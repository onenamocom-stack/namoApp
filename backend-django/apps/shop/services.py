"""The catalogue, and buying from it.

── THE ONE HARD PART: TWO PEOPLE, ONE ITEM ─────────────────────────────────
The question this module exists to answer is the one that gets asked about
every shop: there is one Blue Sapphire left and two people tap Buy in the
same tick. Exactly one may get it; the other must be told it is gone, and
must not be charged.

The naive shape is read-then-write:

    if product.stock >= qty:        # both read 1
        product.stock -= qty        # both write 0
        charge(...)                 # both charged

Both pass the check, because the gap between the read and the write is
where the other transaction lives. Two orders, one gemstone.

**What this does instead is a conditional UPDATE:**

    update products set stock = stock - %s
     where id = %s and active and stock >= %s

The database evaluates `stock >= qty` and applies the subtraction in ONE
statement, holding the row lock for its duration. Whoever arrives second
finds `stock >= 1` false and the statement matches nothing — `rowcount` is
0, and that zero IS the answer. There is no gap to lose a race in.

Chosen over `select … for update` because it is one round trip instead of
two, and because the check cannot drift from the write: they are the same
statement. Postgres and SQLite both give an exact rowcount, so the test
suite exercises the real mechanism rather than a mock.

**Lock ordering.** Rows are claimed in sorted id order, always. Two carts
holding the same two products in opposite orders would otherwise each hold
what the other wants — a deadlock the database resolves by killing one
transaction, which a seeker experiences as a random failure. Sorting makes
that impossible rather than rare.

**What bigger shops add on top.** Blinkit and Zomato hold a reservation
with a short expiry while checkout is open, usually in Redis, so an item
in your basket is not sold from under you mid-payment. That matters when
payment is a redirect taking thirty seconds. Here the wallet is debited in
the same transaction as the decrement — there is no window to reserve
across — so a reservation layer would be machinery guarding a gap that
does not exist. It becomes worth building the day checkout leaves the
server, and `hold_stock` below is where it would go.
"""

import logging
import uuid

from django.db import transaction
from django.db.models import F

from apps.wallet import services as wallet_services

from .delivery import DeliveryRefused, snapshot, use_quote
from .shiprocket import tracking_url as shiprocket_tracking_url
from .models import Coupon, Order, OrderItem, Product, Shipment

logger = logging.getLogger("apps.shop")

REFUSAL_EMPTY = "Nothing in the order."
REFUSAL_GONE = "That is no longer for sale."
REFUSAL_OUT_OF_STOCK = "Out of stock."
REFUSAL_SHORT = "Not enough left."
REFUSAL_COUPON_UNKNOWN = "That code does not work."
REFUSAL_COUPON_EXPIRED = "That code has expired."
REFUSAL_COUPON_SPENT = "That code has been used up."
REFUSAL_COUPON_TOO_SMALL = "Your order is below this code's minimum."

MAX_QTY_PER_LINE = 10


# ── reading the catalogue ────────────────────────────────────────────────────


def list_products(*, category=None, include_sold_out=True):
    """What the shop screen renders.

    Inactive products are never returned — `active=False` is the console's
    delete, and a product taken down must vanish from the app. Sold-out
    ones ARE returned: a shelf with a greyed-out label is a shop; a shelf
    that silently loses items is a bug report.
    """
    rows = Product.objects.filter(active=True).select_related("category", "subcategory")
    if category:
        rows = rows.filter(category__name__iexact=category)
    if not include_sold_out:
        rows = rows.filter(stock__gt=0)
    return list(rows)


VIDEO_EXTENSIONS = (".mp4", ".webm", ".mov", ".m4v")


def media_kind(url):
    """'video' for a video file, 'image' for everything else. Read off the
    extension, query string ignored — the gallery is a list of plain URLs so
    the spreadsheet can carry it in one cell."""
    path = (url or "").split("?", 1)[0].lower()
    return "video" if path.endswith(VIDEO_EXTENSIONS) else "image"


def next_sku():
    """The next free NAMO-#### number."""
    import re

    highest = 0
    for sku in Product.objects.filter(sku__startswith="NAMO-").values_list("sku", flat=True):
        match = re.fullmatch(r"NAMO-(\d+)", sku)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"NAMO-{highest + 1:04d}"


def unique_slug(name, exclude_pk=None):
    """A page address from the name, with -2, -3… if it is taken."""
    from django.utils.text import slugify

    base = slugify(name or "")[:110] or "product"
    slug, n = base, 1
    taken = Product.objects.exclude(pk=exclude_pk) if exclude_pk else Product.objects.all()
    while taken.filter(slug=slug).exists():
        n += 1
        slug = f"{base}-{n}"
    return slug


def product_images(product):
    """The cover, then the gallery, in order, each once."""
    seen, out = set(), []
    for url in [product.image_url, *(product.gallery or [])]:
        if isinstance(url, str) and url.strip() and url not in seen:
            seen.add(url)
            out.append(url.strip())
    return out


def product_row(product):
    return {
        "id": str(product.id),
        "sku": product.sku,
        "slug": product.slug or "",
        "name": product.name,
        "subtitle": product.subtitle or "",
        "brand": product.brand or "",
        "category": product.category.name if product.category_id else "",
        "subcategory": product.subcategory.name if product.subcategory_id else "",
        "image_url": product.image_url or "",
        "images": product_images(product),
        "media": [{"url": u, "kind": media_kind(u)} for u in product_images(product)],
        "price_paise": product.price_paise,
        "mrp_paise": product.mrp_paise,
        "stock": product.stock,
        "in_stock": product.stock > 0,
        "featured": product.featured,
        "weight_grams": product.weight_grams,
    }


def product_detail(product):
    """The product page: the list row plus the long text. The search and
    share text fall back to the name and the description's first lines, so
    a product nobody wrote SEO for still shows something true."""
    row = product_row(product)
    description = product.description or ""
    row.update({
        "description": description,
        "faq": [
            {"q": str(item.get("q", "")).strip(), "a": str(item.get("a", "")).strip()}
            for item in (product.faq or [])
            if isinstance(item, dict) and str(item.get("q", "")).strip()
        ],
        "seo_title": product.seo_title or product.name,
        "seo_description": product.seo_description
        or (description.strip().split("\n")[0][:160] if description else (product.subtitle or "")),
    })
    return row


def find_product(key):
    """A live product by id or by slug, or None."""
    rows = Product.objects.filter(active=True).select_related("category", "subcategory")
    try:
        import uuid as _uuid

        return rows.filter(pk=_uuid.UUID(str(key))).first()
    except ValueError:
        return rows.filter(slug=str(key)).first()


def list_categories():
    """The shop's categories and their subcategories, as the console has
    them — names, order and all. The app draws its tiles and pills from
    this, so a rename in the console is a rename in the app (6 Oct 2026:
    the tiles were a list in the app's code, and a renamed category
    emptied its own tile)."""
    from .models import ShopCategory

    return [
        {
            "id": str(c.id),
            "name": c.name,
            "subcategories": [s.name for s in c.subcategories.all()],
        }
        for c in ShopCategory.objects.prefetch_related("subcategories").order_by("sort", "name")
    ]


# ── buying ───────────────────────────────────────────────────────────────────


def claim_stock(product_id, qty):
    """Take `qty` off the shelf, or return False.

    ONE statement. The database evaluates `stock >= qty` and applies the
    subtraction together, holding the row lock for its duration, so there
    is no moment between them for a second buyer to occupy. The returned
    row count of 0 means the condition failed — sold out, not enough left,
    or withdrawn between the screen rendering and the tap.

    Written through the ORM rather than as raw SQL, and that is not
    tidiness. The first cut was raw SQL comparing `id = %s` against a
    dashed uuid string; Postgres accepts that and SQLite does not, because
    Django stores a UUIDField there as 32 hex characters with no dashes.
    It would have worked in production and matched nothing in the tests —
    the worst arrangement available, since the test suite would have been
    proving nothing about the one mechanism it exists to prove.
    """
    return Product.objects.filter(
        pk=product_id, active=True, stock__gte=qty
    ).update(stock=F("stock") - qty) == 1


def release_stock(product_id, qty):
    """Put it back. Belt to the transaction's braces, for a caller that is
    not inside one."""
    Product.objects.filter(pk=product_id).update(stock=F("stock") + qty)


def check_coupon(code, subtotal_paise, now=None):
    """-> (discount_paise, coupon) or (0, None), with a reason on refusal."""
    from django.utils import timezone

    now = now or timezone.now()
    if not code:
        return 0, None, None
    coupon = Coupon.objects.filter(code__iexact=code.strip(), active=True).first()
    if coupon is None:
        return 0, None, REFUSAL_COUPON_UNKNOWN
    if coupon.starts_at and now < coupon.starts_at:
        return 0, None, REFUSAL_COUPON_EXPIRED
    if coupon.ends_at and now >= coupon.ends_at:
        return 0, None, REFUSAL_COUPON_EXPIRED
    if coupon.max_redemptions is not None and coupon.used_count >= coupon.max_redemptions:
        return 0, None, REFUSAL_COUPON_SPENT
    if subtotal_paise < (coupon.min_order_paise or 0):
        return 0, None, REFUSAL_COUPON_TOO_SMALL
    return coupon.discount_on(subtotal_paise), coupon, None


class Refused(Exception):
    """A refusal, raised rather than returned.

    `transaction.atomic()` rolls back on an EXCEPTION. A plain `return`
    from inside the block commits everything done so far — so an early
    return after a stock claim silently sold an item nobody paid for. It
    happened: a refused coupon left the shelf one short.

    Returning the refusal is the obvious way to write this and the wrong
    one, and the wrongness is invisible at the call site. Raising makes
    the correct thing the default, so a refusal added a year from now
    cannot reintroduce the bug by being written the obvious way.
    """

    def __init__(self, reason, **extra):
        super().__init__(reason)
        self.payload = {"ok": False, "reason": reason, **extra}


def buy(profile_id, lines, coupon_code=None, delivery=None, payment="wallet"):
    """One purchase: stock, money, order — all of it or none of it.

    `lines` is [{product_id, qty}]. `payment` is "wallet" (the default:
    debited now) or "cod" (cash on delivery, 6 Oct 2026: nothing debited, a
    fee added, the order PENDING until the parcel arrives).
    `delivery` is {address_id, quote_id};
    the view requires it (a parcel needs somewhere to go and the fee is
    part of the total). None writes no shipment — internal callers and the
    tests of stock and money, which are about neither.

    The order of operations is deliberate. **Stock is claimed before the
    wallet is touched**, because an unaffordable order that already took
    the last gemstone off the shelf is worse than a rejected one: the
    seeker who could pay is then told it is sold out.
    """
    if not lines:
        return {"ok": False, "reason": REFUSAL_EMPTY}

    # Sorted, always. Two carts holding the same two products in opposite
    # orders would each hold what the other wants; the database breaks the
    # deadlock by killing one, which a seeker sees as a random failure.
    wanted = sorted(
        ((str(line["product_id"]), int(line.get("qty") or 1)) for line in lines),
        key=lambda pair: pair[0],
    )
    for _id, qty in wanted:
        if qty < 1 or qty > MAX_QTY_PER_LINE:
            return {"ok": False, "reason": f"Between 1 and {MAX_QTY_PER_LINE} of each."}

    try:
        with transaction.atomic():
            return _purchase(profile_id, wanted, coupon_code, delivery, payment)
    except Refused as refusal:
        return refusal.payload
    except DeliveryRefused as refusal:
        return {"ok": False, "reason": refusal.reason}


REFUSAL_COD_PINCODE = "Cash on delivery is not available at this pincode. Pay online instead."
REFUSAL_COD_OPEN = "You already have {n} cash-on-delivery orders on the way. Pay online, or wait for one to arrive."


def cod_fee(total_paise):
    """The cash-on-delivery fee: COD_FEE_BPS of the total, delivery
    included, rounded UP to the whole rupee."""
    import math

    from django.conf import settings

    return math.ceil(total_paise * settings.COD_FEE_BPS / 10_000 / 100) * 100


def _purchase(profile_id, wanted, coupon_code, delivery=None, payment="wallet"):
    products = {}
    for product_id, qty in wanted:
        product = Product.objects.filter(pk=product_id, active=True).first()
        if product is None:
            raise Refused(REFUSAL_GONE)
        if not claim_stock(product_id, qty):
            # Re-read rather than trust the row we loaded: the number that
            # mattered was the one at the moment of the update.
            left = Product.objects.filter(pk=product_id).values_list("stock", flat=True).first() or 0
            raise Refused(
                REFUSAL_OUT_OF_STOCK if left == 0 else REFUSAL_SHORT,
                product_id=product_id, stock=left,
            )
        products[product_id] = (product, qty)

    subtotal = sum(p.price_paise * q for p, q in products.values())

    # TWO KINDS OF CODE GO IN THE SAME BOX, and they do opposite things.
    #
    # A shop coupon is a DISCOUNT: the total comes down and the revenue
    # with it. A consultant's referral code is not — the order is paid in
    # full and 10% comes back afterwards as wallet credit. That is the
    # whole commercial point: the money stays inside the product instead
    # of leaving it, and a discount would have done the opposite.
    #
    # Referral codes are checked first because their namespace is its own
    # (one letter of prefix, then seven), so a referral code reaching
    # check_coupon would be refused as an unknown coupon — the wrong
    # sentence for a code that is perfectly valid.
    referral_code = None
    discount, coupon = 0, None
    if coupon_code:
        from apps.referrals import services as referral_services

        if referral_services.resolve(coupon_code) is not None:
            verdict = referral_services.check_coupon(profile_id, coupon_code)
            if not verdict["ok"]:
                raise Refused(verdict["reason"])
            referral_code = coupon_code
        else:
            discount, coupon, refusal = check_coupon(coupon_code, subtotal)
            if refusal:
                raise Refused(refusal)
    total = max(0, subtotal - discount)

    # Delivery is added AFTER the discount: a coupon takes money off the
    # goods, never off what the courier charges. The quote is burned here,
    # in the same transaction, so a refused purchase does not spend it.
    address, shipping, cod_ok = None, 0, False
    if delivery is not None:
        weight = sum((p.weight_grams or 100) * q for p, q in products.values())
        address, shipping, cod_ok = use_quote(
            profile_id, delivery["address_id"], delivery["quote_id"], weight
        )
        total += shipping

    # CASH ON DELIVERY (6 Oct 2026). Nothing leaves the wallet: the courier
    # collects the total, which carries the COD fee, and the order stays
    # PENDING until the parcel is delivered (delivery.order_follows_shipment).
    fee = 0
    if payment == Order.PaymentMethod.COD:
        from django.conf import settings

        if address is None or not cod_ok:
            raise Refused(REFUSAL_COD_PINCODE)
        fee = cod_fee(total)
        if total + fee > settings.COD_MAX_PAISE:
            raise Refused(
                f"Cash on delivery is for orders up to ₹{settings.COD_MAX_PAISE // 100:,}. "
                "Pay online for this one."
            )
        open_cod = Order.objects.filter(
            profile_id=profile_id, payment_method=Order.PaymentMethod.COD,
            status=Order.Status.PENDING,
        ).count()
        if open_cod >= settings.COD_MAX_OPEN:
            raise Refused(REFUSAL_COD_OPEN.format(n=open_cod))
        total += fee
        paid = {"ok": True, "balance_paise": None}
    else:
        # The wallet takes its own row lock inside this transaction. It is
        # the LAST lock taken, after every product row, which is what keeps
        # the ordering consistent across every purchase in the system.
        paid = wallet_services.debit(profile_id, total, _label(products)) if total else {"ok": True}
        if not paid.get("ok"):
            raise Refused(paid.get("reason"), balance_paise=paid.get("balance_paise"))

    cod = payment == Order.PaymentMethod.COD
    order = Order.objects.create(
        id=uuid.uuid4(), profile_id=profile_id,
        status=Order.Status.PENDING if cod else Order.Status.PAID, total_paise=total,
        payment_method=Order.PaymentMethod.COD if cod else Order.PaymentMethod.WALLET,
        cod_fee_paise=fee,
    )
    for product, qty in products.values():
        OrderItem.objects.create(
            order=order, item_type="product", item_id=product.id,
            title=product.name, qty=qty,
            unit_price_paise=product.price_paise,
            tax_rate_bps=product.tax_rate_bps,
        )

    if address is not None:
        OrderItem.objects.create(
            # item_id points at the shipment, whose key IS the order's.
            order=order, item_type="shipping", item_id=order.id,
            title="Delivery", qty=1, unit_price_paise=shipping, tax_rate_bps=0,
        )
        Shipment.objects.create(
            order=order, address=snapshot(address), pincode=address.pincode,
            weight_grams=weight,
            shipping_paise=shipping, status=Shipment.Status.READY,
        )

    if coupon is not None:
        # Counted, not derived. An order later refunded still consumed the
        # coupon, so `used_count` cannot be a query over orders.
        Coupon.objects.filter(pk=coupon.pk).update(used_count=coupon.used_count + 1)

    cashback = 0
    if referral_code:
        # Inside this transaction on purpose: an order that refuses for any
        # later reason must take its attribution with it. Nothing is PAID
        # here — two pending rows are written and they mature seven days
        # after the parcel is delivered.
        from apps.referrals import services as referral_services

        claimed = referral_services.claim_purchase(profile_id, order, referral_code)
        if not claimed["ok"]:
            raise Refused(claimed["reason"])
        cashback = claimed.get("cashback_paise", 0)

    return {
        "ok": True, "order_id": str(order.id),
        "subtotal_paise": subtotal, "discount_paise": discount,
        "shipping_paise": shipping, "cod_fee_paise": fee,
        "payment_method": order.payment_method,
        "total_paise": total, "balance_paise": paid.get("balance_paise"),
        # Not a discount and deliberately named so. The client says
        # "₹X back after delivery", never "₹X off".
        "cashback_paise": cashback,
    }


def _label(products):
    """What the seeker reads on their statement. The ledger's `kind` is
    the only description of the purchase they ever see."""
    names = [p.name for p, _ in products.values()]
    if len(names) == 1:
        return names[0]
    return f"{names[0]} and {len(names) - 1} more"


# ── what somebody has bought ────────────────────────────────────────────────


def order_history(profile_id, limit=50):
    """The caller's orders, newest first, with everything a person needs to
    recognise one: what was in it, what it cost, where it is, and what it
    earned them.

    PRODUCTS ONLY. `orders` also carries sessions and AI questions —
    `item_type` spans the whole product — and a shop history listing "Namo
    AI · chat ₹9" beside a rudraksha would be a statement, not an order
    list. The wallet ledger is where money is read; this is where parcels
    are.
    """
    from apps.referrals.models import Cashback

    orders = list(
        Order.objects.filter(profile_id=profile_id)
        .order_by("-created_at")[:limit]
    )
    if not orders:
        return []

    ids = [o.id for o in orders]
    items = {}
    for row in OrderItem.objects.filter(order_id__in=ids, item_type="product"):
        items.setdefault(row.order_id, []).append(row)
    shipments = {s.order_id: s for s in Shipment.objects.filter(order_id__in=ids)}
    # The buyer's side only. The consultant's row for the same order is
    # theirs to see in their earnings, not in somebody else's history.
    cashback = {
        c.referral.order_id: c
        for c in Cashback.objects.filter(
            referral__order_id__in=ids, profile_id=profile_id
        ).select_related("referral")
    }

    out = []
    for order in orders:
        lines = items.get(order.id, [])
        if not lines:
            continue  # a session or an AI question, not a parcel
        out.append({
            "id": str(order.id),
            "created_at": order.created_at.isoformat(),
            "status": order.status,
            "payment_method": order.payment_method,
            "cod_fee_paise": order.cod_fee_paise,
            "total_paise": order.total_paise,
            "items": [
                {
                    "title": line.title,
                    "qty": line.qty,
                    "unit_price_paise": line.unit_price_paise,
                    "product_id": str(line.item_id) if line.item_id else None,
                }
                for line in lines
            ],
            "shipment": _shipment_row(shipments.get(order.id)),
            "cashback": _cashback_row(cashback.get(order.id)),
        })
    return out


def _shipment_row(shipment):
    if shipment is None:
        return None
    return {
        "status": shipment.status,
        "courier": shipment.courier,
        "awb": shipment.awb,
        "shipping_paise": shipment.shipping_paise,
        "tracking_status": shipment.tracking_status,
        "tracking_url": shiprocket_tracking_url(shipment.awb),
        "city": (shipment.address or {}).get("city"),
        "shipped_at": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
        "delivered_at": (
            shipment.delivered_at.isoformat() if shipment.delivered_at else None
        ),
    }


def _cashback_row(cashback):
    """None when this order earned none, which is most of them.

    The screen shows nothing at all in that case rather than "₹0 cashback"
    — a line that exists only to say a thing did not happen is a line that
    makes every order look like it was supposed to.
    """
    if cashback is None:
        return None
    return {
        "amount_paise": cashback.amount_paise,
        "status": cashback.status,
        "matures_at": cashback.matures_at.isoformat() if cashback.matures_at else None,
        "paid_at": cashback.paid_at.isoformat() if cashback.paid_at else None,
    }
