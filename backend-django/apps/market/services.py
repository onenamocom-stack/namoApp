"""The Market's sellers, as functions (15 Oct 2026, docs/06 Phase 17).

Money rules, docs/01 §4.7 (Rahul's terms, owner's yes 15 Oct):
  - Namo's commission is 30% of a download, course or event, and 20% of a
    product plus ₹100 a unit for delivery (from the seller's share; the
    buyer pays no delivery). The admin may type another percentage on a
    listing when approving it; blank takes the default.
  - Payouts run monthly, on the 7th, for everything earned before the 1st.
"""

import logging
from datetime import date, datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import (Listing, ListingKind, ListingStatus, ListingTag, Purchase, SellerBank, SellerEarning,
                     SellerPayout)

logger = logging.getLogger(__name__)

DEFAULT_BPS = {
    ListingKind.DOWNLOAD: 3000,
    ListingKind.COURSE: 3000,
    ListingKind.EVENT: 3000,
    ListingKind.PRODUCT: 2000,
}
DELIVERY_PAISE = 10_000  # ₹100 a unit, a product only
MAX_PRICE_PAISE = 10_00_000_00  # ₹10,00,000
MAX_LESSONS = 200


class Refused(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


# ── who may sell ────────────────────────────────────────────────────────────


def is_seller(profile_id):
    """A Pro (an approved consultant) or a Creator — the people who may
    share for a commission already (referrals.may_share)."""
    from apps.consultants import services as consultants
    from apps.profiles import services as profiles

    return consultants.is_approved(profile_id) or profiles.is_creator(profile_id)


def commission_bps(listing):
    if listing.commission_bps is not None:
        return listing.commission_bps
    return DEFAULT_BPS[listing.kind]


def split(listing, gross_paise, units=1):
    """(commission, delivery, net) for a sale of `gross_paise`."""
    bps = commission_bps(listing)
    commission = (gross_paise * bps + 5000) // 10000
    delivery = DELIVERY_PAISE * units if listing.kind == ListingKind.PRODUCT else 0
    return commission, delivery, gross_paise - commission - delivery


# ── a seller's listings ─────────────────────────────────────────────────────

FIELDS = (
    "kind", "title", "description", "cover_url", "price_paise", "mrp_paise",
    "file_asset_id", "lessons", "language", "starts_at", "duration_minutes",
    "seats", "join_url", "category_name", "stock", "weight_grams",
)


def _own_download_asset(seller_id, asset_id):
    """A READY `download` asset the seller uploaded, or a refusal."""
    from apps.media.models import MediaAsset

    asset = MediaAsset.objects.filter(pk=asset_id, owner=str(seller_id), kind="download",
                                      status="ready").first()
    if asset is None:
        raise Refused("Upload the file again: that one is not yours or did not finish.")
    return asset


def _clean(seller_id, data, current=None):
    """The listing's fields after the rules for its kind; refuses with the
    sentence the form shows."""
    kind = data.get("kind") or (current.kind if current else None)
    if kind not in ListingKind.values:
        raise Refused("Pick what you are selling: a download, a course, an event or a product.")
    out = {"kind": kind}
    title = " ".join((data.get("title") or "").split())
    if not title:
        raise Refused("Give it a name.")
    out["title"] = title[:200]
    out["description"] = (data.get("description") or "").strip()[:20000]
    out["cover_url"] = (data.get("cover_url") or "").strip()
    if not out["cover_url"]:
        raise Refused("Add a cover picture, 16:9.")
    price = int(data.get("price_paise") or 0)
    if price < 0 or price > MAX_PRICE_PAISE:
        raise Refused("That price is not one we can take.")
    if price and price < 100:
        raise Refused("A price is at least ₹1, or 0 for free.")
    if kind == ListingKind.PRODUCT and not price:
        raise Refused("A product needs a price.")
    out["price_paise"] = price
    mrp = data.get("mrp_paise")
    mrp = int(mrp) if mrp not in (None, "", 0) else None
    if mrp is not None and mrp <= price:
        raise Refused("The MRP must be above the price, or left blank.")
    out["mrp_paise"] = mrp

    if kind == ListingKind.DOWNLOAD:
        asset_id = data.get("file_asset_id") or (current.file_asset_id if current else None)
        if not asset_id:
            raise Refused("Upload the file people will download.")
        asset = _own_download_asset(seller_id, asset_id)
        out["file_asset_id"] = asset.pk
        out["file_name"] = asset.bucket_key.rsplit("/", 1)[-1]
        out["file_size"] = asset.size_bytes
    if kind == ListingKind.COURSE:
        lessons = []
        for i, row in enumerate((data.get("lessons") or [])[:MAX_LESSONS]):
            name = " ".join(str(row.get("title") or "").split())[:200]
            if not name or not row.get("asset_id"):
                raise Refused(f"Lesson {i + 1} needs a name and a video or file.")
            _own_download_asset(seller_id, row["asset_id"])
            minutes = int(row.get("minutes") or 0)
            lessons.append({"title": name, "minutes": max(minutes, 0), "asset_id": str(row["asset_id"]),
                            "preview": i == 0 and bool(row.get("preview", True))})
        if not lessons:
            raise Refused("Add at least one lesson.")
        out["lessons"] = lessons
        out["language"] = (data.get("language") or "").strip()[:40]
    if kind == ListingKind.EVENT:
        starts = data.get("starts_at")
        if isinstance(starts, str):
            starts = datetime.fromisoformat(starts.replace("Z", "+00:00")) if starts else None
        if not starts:
            raise Refused("Say when it starts.")
        if timezone.is_naive(starts):
            starts = timezone.make_aware(starts)
        if starts <= timezone.now():
            raise Refused("An event starts in the future.")
        out["starts_at"] = starts
        minutes = int(data.get("duration_minutes") or 0)
        if not 10 <= minutes <= 24 * 60:
            raise Refused("Say how long it runs, in minutes.")
        out["duration_minutes"] = minutes
        seats = int(data.get("seats") or 0)
        if not 1 <= seats <= 100_000:
            raise Refused("Say how many seats there are.")
        out["seats"] = seats
        link = (data.get("join_url") or "").strip()
        if not link.startswith("https://"):
            raise Refused("Add the joining link (Zoom, Google Meet, YouTube Live), starting https://.")
        out["join_url"] = link[:500]
    if kind == ListingKind.PRODUCT:
        out["category_name"] = (data.get("category_name") or "").strip()[:80]
        stock = int(data.get("stock") or 0)
        weight = int(data.get("weight_grams") or 0)
        if stock < 1:
            raise Refused("Say how many you will send to Namo.")
        if not 1 <= weight <= 30_000:
            raise Refused("Say what one weighs, packed, in grams.")
        out["stock"], out["weight_grams"] = stock, weight
    return out


def create(seller_id, data):
    if not is_seller(seller_id):
        raise Refused("Selling is for Pros and Creators.", status=403)
    fields = _clean(seller_id, data)
    return Listing.objects.create(seller_id=seller_id, **fields)


def update(seller_id, listing_id, data):
    """An edit goes back to review: what buyers see is always what an
    admin approved. The kind never changes."""
    listing = Listing.objects.filter(pk=listing_id, seller_id=seller_id).first()
    if listing is None:
        raise Refused("That listing is not yours.", status=404)
    fields = _clean(seller_id, {**data, "kind": listing.kind}, current=listing)
    for k, v in fields.items():
        setattr(listing, k, v)
    listing.status = ListingStatus.PENDING
    listing.review_note = ""
    listing.updated_at = timezone.now()
    listing.save()
    if listing.product_id:
        from apps.shop.models import Product

        # Off the shelf until it is approved again.
        Product.objects.filter(pk=listing.product_id).update(active=False)
    return listing


def withdraw(seller_id, listing_id):
    listing = Listing.objects.filter(pk=listing_id, seller_id=seller_id).first()
    if listing is None:
        raise Refused("That listing is not yours.", status=404)
    listing.status = ListingStatus.WITHDRAWN
    listing.updated_at = timezone.now()
    listing.save(update_fields=("status", "updated_at"))
    if listing.product_id:
        from apps.shop.models import Product

        Product.objects.filter(pk=listing.product_id).update(active=False)
    return listing


# ── the console's decision ──────────────────────────────────────────────────


def approve(listing, who, bps=None):
    """Live from now. A product becomes a shop row, sold and shipped by the
    shop, branded with the seller's name."""
    listing.status = ListingStatus.APPROVED
    listing.review_note = ""
    listing.reviewed_at = timezone.now()
    listing.reviewed_by = who
    if bps is not None:
        listing.commission_bps = bps
    if listing.kind == ListingKind.PRODUCT:
        listing.product_id = _shelve(listing).pk
    listing.save()
    _notify(listing.seller_id, "market.approved", "Your listing is live",
            f"{listing.title} is on the Market now.", listing)
    return listing


def reject(listing, who, note):
    listing.status = ListingStatus.REJECTED
    listing.review_note = note
    listing.reviewed_at = timezone.now()
    listing.reviewed_by = who
    listing.save()
    if listing.product_id:
        from apps.shop.models import Product

        Product.objects.filter(pk=listing.product_id).update(active=False)
    _notify(listing.seller_id, "market.rejected", "Your listing needs a change",
            f"{listing.title}: {note}", listing)
    return listing


def _shelve(listing):
    from apps.profiles.models import Profile
    from apps.shop.models import Product, ShopCategory
    from apps.shop.services import next_sku

    seller = Profile.objects.filter(pk=listing.seller_id).values_list("name", flat=True).first() or "Namo"
    category = (ShopCategory.objects.filter(name__iexact=listing.category_name).first()
                or ShopCategory.objects.order_by("sort", "name").first())
    if category is None:
        raise Refused("Add a shop category in the console first.")
    fields = dict(
        name=listing.title, image_url=listing.cover_url, price_paise=listing.price_paise,
        mrp_paise=listing.mrp_paise, stock=listing.stock or 0, weight_grams=listing.weight_grams or 500,
        category=category, brand=seller, description=listing.description, active=True,
    )
    if listing.product_id:
        product = Product.objects.filter(pk=listing.product_id).first()
        if product is not None:
            for k, v in fields.items():
                setattr(product, k, v)
            product.save()
            return product
    return Product.objects.create(sku=next_sku(), **fields)


# ── buying ──────────────────────────────────────────────────────────────────


def live(listing_id):
    try:
        return Listing.objects.filter(pk=listing_id, status=ListingStatus.APPROVED).first()
    except Exception:  # not a uuid
        return None


def seats_left(listing):
    if listing.kind != ListingKind.EVENT or not listing.seats:
        return None
    return max(listing.seats - listing.purchases.count(), 0)


def _can_buy(listing):
    if listing.kind == ListingKind.PRODUCT:
        return False  # the shop sells it
    if listing.kind == ListingKind.EVENT:
        if listing.starts_at and listing.starts_at + timedelta(minutes=listing.duration_minutes or 0) < timezone.now():
            return False
        if seats_left(listing) == 0:
            return False
    return True


def price_to_pay(ref):
    """What the gateway charges for listing `ref`, or None when it is not
    for sale (wallet.sku_price's `listing` branch)."""
    listing = live(ref)
    if listing is None or not listing.price_paise or not _can_buy(listing):
        return None
    return listing.price_paise


def owns(profile_id, listing):
    if profile_id is None:
        return False
    if str(listing.seller_id) == str(profile_id):
        return True
    return Purchase.objects.filter(listing=listing, buyer_id=profile_id).exists()


def take_free(profile_id, listing_id):
    listing = live(listing_id)
    if listing is None:
        raise Refused("That is not on the Market.", status=404)
    if listing.price_paise:
        raise Refused("That one is paid.", status=402)
    if not _can_buy(listing):
        raise Refused("That is closed: no seats left, or it is over.")
    Purchase.objects.get_or_create(listing=listing, buyer_id=profile_id,
                                   defaults={"amount_paise": 0, "referrer_id": _referrer(profile_id, listing)})
    return listing


def _referrer(buyer_id, listing):
    """The Pro or Creator whose link or tag holds this buyer now, if any
    and not the seller themselves. Recorded on the purchase; nothing is paid
    on it until what a sharer earns on a listing is decided (Rahul, 15 Oct)."""
    from apps.referrals import services as referrals

    visit = referrals.live_visit(buyer_id)
    if visit is None or str(visit.consultant_id) in (str(listing.seller_id), str(buyer_id)):
        return None
    return visit.consultant_id


def on_listing_paid(profile_id, ref, amount_paise):
    """The gateway's capture granted listing `ref` (wallet._grant_paid, in
    its transaction): the purchase and the seller's share, together."""
    listing = Listing.objects.get(pk=ref)
    purchase, made = Purchase.objects.get_or_create(
        listing=listing, buyer_id=profile_id,
        defaults={"amount_paise": amount_paise, "referrer_id": _referrer(profile_id, listing)})
    if not made:
        return
    commission, delivery, net = split(listing, amount_paise)
    SellerEarning.objects.create(
        seller_id=listing.seller_id, listing=listing, purchase=purchase, gross_paise=amount_paise,
        commission_bps=commission_bps(listing), commission_paise=commission,
        delivery_paise=delivery, net_paise=net,
    )
    transaction.on_commit(lambda: _notify(
        listing.seller_id, "market.sale", "You made a sale",
        f"{listing.title} · ₹{amount_paise // 100:,} (yours ₹{net // 100:,})", listing))


def on_shipment_status(order_id, status):
    """A shop parcel moved. Delivered: each line that is a seller's product
    earns its seller (once — the order line's id is unique on the row)."""
    from apps.shop.models import OrderItem, Shipment

    if status != Shipment.Status.DELIVERED:
        return 0
    lines = OrderItem.objects.filter(order_id=order_id, item_type="product")
    by_product = {str(lst.product_id): lst for lst in Listing.objects.filter(
        product_id__in=[line.item_id for line in lines])}
    made = 0
    for line in lines:
        listing = by_product.get(str(line.item_id))
        if listing is None:
            continue
        gross = line.unit_price_paise * line.qty
        commission, delivery, net = split(listing, gross, units=line.qty)
        try:
            with transaction.atomic():
                SellerEarning.objects.create(
                    seller_id=listing.seller_id, listing=listing, order_item_id=line.pk,
                    gross_paise=gross, commission_bps=commission_bps(listing),
                    commission_paise=commission, delivery_paise=delivery, net_paise=net,
                )
            made += 1
            _notify(listing.seller_id, "market.sale", "Your product was delivered",
                    f"{listing.title} × {line.qty} · yours ₹{net // 100:,}", listing)
        except IntegrityError:
            continue  # this line already earned
    return made


def access(profile_id, listing):
    """What an owner opens: the file, the lessons, the joining link. Links
    die in ten minutes."""
    if not owns(profile_id, listing):
        raise Refused("Buy it to open it.", status=402)
    if listing.kind == ListingKind.DOWNLOAD:
        return {"file_url": _signed(listing.file_asset_id), "file_name": listing.file_name}
    if listing.kind == ListingKind.COURSE:
        return {"lessons": [{**_lesson_public(row), "url": _signed(row["asset_id"])} for row in listing.lessons]}
    if listing.kind == ListingKind.EVENT:
        return {"join_url": listing.join_url}
    return {}


def preview(listing, index):
    """A course's free lesson, to anybody."""
    rows = listing.lessons or []
    if listing.kind != ListingKind.COURSE or not 0 <= index < len(rows) or not rows[index].get("preview"):
        raise Refused("That lesson is not a preview.", status=402)
    return _signed(rows[index]["asset_id"])


def _signed(asset_id):
    from django.conf import settings

    from apps.media.models import MediaAsset
    from apps.media.providers import get_provider

    asset = MediaAsset.objects.filter(pk=asset_id).first()
    if asset is None:
        return None
    return get_provider().presign_get(asset.bucket_key, settings.R2_PRIVATE_BUCKET, seconds=600)


# ── reading ─────────────────────────────────────────────────────────────────


def _lesson_public(row):
    return {"title": row.get("title"), "minutes": row.get("minutes") or 0, "preview": bool(row.get("preview"))}


def _sellers(ids):
    from apps.profiles.models import Profile
    from apps.profiles import services as profiles
    from apps.consultants.models import Consultant

    ids = list({str(i) for i in ids})
    rows = {str(p["id"]): p for p in Profile.objects.filter(pk__in=ids).values(
        "id", "name", "avatar_url", "influencer")}
    pros = {str(c) for c in Consultant.objects.filter(profile_id__in=ids, status="approved")
            .values_list("profile_id", flat=True)}
    out = {}
    for i in ids:
        p = rows.get(i, {})
        out[i] = {"id": i, "name": p.get("name") or "Namo", "avatar_url": p.get("avatar_url"),
                  "is_pro": i in pros, "is_creator": bool(p.get("influencer"))}
    return out


def card(listing, seller=None, viewer=None, detail=False):
    row = {
        "id": str(listing.id),
        "kind": listing.kind,
        "title": listing.title,
        "cover_url": listing.cover_url,
        "price_paise": listing.price_paise,
        "mrp_paise": listing.mrp_paise,
        "seller": seller,
        "product_id": str(listing.product_id) if listing.product_id else None,
        "starts_at": listing.starts_at.isoformat() if listing.starts_at else None,
        "duration_minutes": listing.duration_minutes,
        "lessons_count": len(listing.lessons or []),
        "minutes": sum(int(r.get("minutes") or 0) for r in (listing.lessons or [])),
    }
    if detail:
        row.update({
            "description": listing.description,
            "language": listing.language,
            "lessons": [_lesson_public(r) for r in listing.lessons or []],
            "seats": listing.seats,
            "seats_left": seats_left(listing),
            "file_name": listing.file_name,
            "file_size": listing.file_size,
            "owned": owns(viewer, listing),
            "open": _can_buy(listing),
        })
    return row


def browse(kind=None, seller_id=None):
    q = Listing.objects.filter(status=ListingStatus.APPROVED)
    if kind:
        q = q.filter(kind=kind)
    if seller_id:
        q = q.filter(seller_id=seller_id)
    # An event that is over leaves the Market.
    q = q.exclude(kind=ListingKind.EVENT, starts_at__lt=timezone.now() - timedelta(hours=24))
    rows = list(q.order_by("-reviewed_at", "-created_at")[:200])
    sellers = _sellers(r.seller_id for r in rows)
    return [card(r, sellers[str(r.seller_id)]) for r in rows]


def detail(listing_id, viewer=None):
    listing = Listing.objects.filter(pk=listing_id).first()
    if listing is None or (listing.status != ListingStatus.APPROVED and str(listing.seller_id) != str(viewer)):
        return None
    seller = _sellers([listing.seller_id])[str(listing.seller_id)]
    return card(listing, seller, viewer, detail=True)


def mine(seller_id):
    rows = Listing.objects.filter(seller_id=seller_id).exclude(status=ListingStatus.WITHDRAWN).order_by("-created_at")
    sold = dict(Purchase.objects.filter(listing__seller_id=seller_id).values("listing_id")
                .annotate(n=Count("id")).values_list("listing_id", "n"))
    out = []
    for r in rows:
        row = card(r)
        row.update({
            "status": r.status, "review_note": r.review_note, "sold": sold.get(r.id, 0),
            "description": r.description, "language": r.language, "seats": r.seats,
            "join_url": r.join_url, "category_name": r.category_name, "stock": r.stock,
            "weight_grams": r.weight_grams, "file_name": r.file_name, "file_asset_id": str(r.file_asset_id or ""),
            "lessons": r.lessons, "commission_bps": commission_bps(r),
        })
        out.append(row)
    return out


def earnings(seller_id):
    base = SellerEarning.objects.filter(seller_id=seller_id)
    total = base.aggregate(g=Sum("gross_paise"), n=Sum("net_paise"))
    due = base.filter(Q(payout__isnull=True) | Q(payout__status="due")).aggregate(n=Sum("net_paise"))["n"] or 0
    paid = base.filter(payout__status="paid").aggregate(n=Sum("net_paise"))["n"] or 0
    recent = [{
        "title": e.listing.title, "kind": e.listing.kind, "gross_paise": e.gross_paise,
        "commission_paise": e.commission_paise, "delivery_paise": e.delivery_paise,
        "net_paise": e.net_paise, "at": e.created_at.isoformat(),
        "paid": bool(e.payout_id and e.payout.status == "paid"),
    } for e in base.select_related("listing", "payout").order_by("-created_at")[:50]]
    payouts = [{"month": p.month.isoformat(), "amount_paise": p.amount_paise, "status": p.status,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None}
               for p in SellerPayout.objects.filter(seller_id=seller_id).order_by("-month")[:24]]
    return {"gross_paise": total["g"] or 0, "net_paise": total["n"] or 0, "due_paise": due,
            "paid_paise": paid, "recent": recent, "payouts": payouts, "next_payout": next_payout_day().isoformat()}


# ── payouts ─────────────────────────────────────────────────────────────────


def next_payout_day(today=None):
    today = today or timezone.localdate()
    if today.day <= 7:
        return today.replace(day=7)
    first_next = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    return first_next.replace(day=7)


def run_payouts(today=None):
    """Everything earned before the 1st of this month and not yet in a
    payout, one row per seller, labelled with last month. Re-running is
    harmless: a seller who already has this month's row is skipped."""
    today = today or timezone.localdate()
    first = today.replace(day=1)
    month = (first - timedelta(days=1)).replace(day=1)
    cutoff = timezone.make_aware(datetime.combine(first, time.min))
    made = []
    sellers = (SellerEarning.objects.filter(payout__isnull=True, created_at__lt=cutoff)
               .values_list("seller_id", flat=True).distinct())
    for seller_id in list(sellers):
        with transaction.atomic():
            if SellerPayout.objects.filter(seller_id=seller_id, month=month).exists():
                continue
            rows = SellerEarning.objects.select_for_update().filter(
                seller_id=seller_id, payout__isnull=True, created_at__lt=cutoff)
            amount = sum(r.net_paise for r in rows)
            if amount <= 0:
                continue
            payout = SellerPayout.objects.create(seller_id=seller_id, month=month, amount_paise=amount)
            rows.update(payout=payout)
            made.append(payout)
    return made


def mark_paid(payout, reference, who):
    if payout.status == SellerPayout.Status.PAID:
        return payout
    payout.status = SellerPayout.Status.PAID
    payout.reference = reference
    payout.paid_at = timezone.now()
    payout.paid_by = who
    payout.save()
    _notify(payout.seller_id, "market.payout", "You have been paid",
            f"₹{payout.amount_paise // 100:,} for {payout.month:%B %Y} · {reference}", None)
    return payout


# ── a Creator's bank ────────────────────────────────────────────────────────


def bank(profile_id):
    row = SellerBank.objects.filter(pk=profile_id).first()
    if row is None:
        return None
    return {"account_holder": row.account_holder, "account_last4": row.account_last4, "ifsc": row.ifsc,
            "upi_id": row.upi_id, "pan_last4": row.pan_last4, "updated_at": row.updated_at.isoformat()}


def save_bank(profile_id, data):
    import re

    from apps.consultants.payout_details import encrypt

    holder = " ".join((data.get("account_holder") or "").split())[:120]
    account = re.sub(r"\s", "", data.get("account_number") or "")
    ifsc = (data.get("ifsc") or "").strip().upper()
    upi = (data.get("upi_id") or "").strip()[:100]
    pan = (data.get("pan") or "").strip().upper()
    if not holder:
        raise Refused("Add the account holder's name.")
    if account and not re.fullmatch(r"\d{6,20}", account):
        raise Refused("An account number is 6 to 20 digits.")
    if account and not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", ifsc):
        raise Refused("That IFSC does not look right: 11 characters, like SBIN0001234.")
    if not account and not upi:
        raise Refused("Add a bank account or a UPI ID.")
    if pan and not re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", pan):
        raise Refused("That PAN does not look right: like ABCDE1234F.")
    row = SellerBank.objects.filter(pk=profile_id).first() or SellerBank(profile_id=profile_id)
    row.account_holder = holder
    if account:
        row.account_cipher, row.account_last4, row.ifsc = encrypt(account), account[-4:], ifsc
    row.upi_id = upi
    if pan:
        row.pan_cipher, row.pan_last4 = encrypt(pan), pan[-4:]
    row.updated_at = timezone.now()
    row.save()
    return bank(profile_id)


def _notify(profile_id, kind, title, body, listing):
    from apps.notifications import services as notify

    notify.push(profile_id, kind=kind, title=title, body=body,
                ref_type="listing" if listing else None, ref_id=listing.id if listing else None)


def first_of_month(d: date):
    return d.replace(day=1)


# ── tags on posts (15 Oct 2026, Rahul) ─────────────────────────────────────


def checked_tags(listing_ids, already=0, limit=3):
    """The live listings a post may carry, in the author's order; refuses
    rather than trims, as the products' check does. `already` counts the
    post's product tags against the same limit."""
    from rest_framework.exceptions import ValidationError

    ids = list(dict.fromkeys(str(i) for i in listing_ids or []))
    if not ids:
        return []
    if already + len(ids) > limit:
        raise ValidationError({"listing_ids": f"A post can tag up to {limit} things."})
    found = {str(x.id): x for x in Listing.objects.filter(id__in=ids, status=ListingStatus.APPROVED)}
    if len(found) != len(ids):
        raise ValidationError({"listing_ids": "One of those is no longer on the Market."})
    return [found[i] for i in ids]


def set_tags(content_id, listings):
    ListingTag.objects.filter(content_id=content_id).delete()
    ListingTag.objects.bulk_create(ListingTag(content_id=content_id, listing=x, sort=i)
                                   for i, x in enumerate(listings))


def attach_tags(rows):
    """Each row gets `_listings`: its live tagged listings, in order. One
    query for the page."""
    by_content = {}
    for t in (ListingTag.objects.filter(content_id__in=[r.id for r in rows], listing__status=ListingStatus.APPROVED)
              .select_related("listing").order_by("content_id", "sort")):
        by_content.setdefault(str(t.content_id), []).append(t.listing)
    for r in rows:
        r._listings = by_content.get(str(r.id), [])
    return rows

