"""The referral programme's rules, in one place.

WHAT IS ENFORCED HERE AND NOWHERE ELSE:

  * A code belongs to one person and is minted once.
  * A seeker is referred at sign-up exactly once, and never by themselves.
  * A consultant's coupon works on a buyer's FIRST order and no other.
  * Cashback is owed on purchase and PAID seven days after delivery.

Every refusal is a sentence the interface shows verbatim
(backend/INSTRUCTIONS.md §2). None of them is invented by the client.
"""

import logging

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import Cashback, Referral, ReferralCode, mint

logger = logging.getLogger("apps.referrals")

REFUSAL_UNKNOWN_CODE = "That code does not exist."
REFUSAL_INACTIVE = "That code is no longer valid."
REFUSAL_SELF = "You cannot use your own code."
REFUSAL_ALREADY_REFERRED = "You have already used a referral code."
REFUSAL_NOT_FIRST_ORDER = "This coupon is for first-time buyers only."
REFUSAL_WRONG_KIND_AT_SIGNUP = (
    "That is a shop coupon. Use it at checkout on your first order."
)
REFUSAL_WRONG_KIND_AT_CHECKOUT = (
    "That is a sign-up code, not a shop coupon."
)
REFUSAL_CONSULTANT_TO_CONSULTANT = (
    "Referral rewards are for seekers. Nothing is credited between consultants."
)
# A consultant claiming a seeker's sign-up code. Same rule, different
# direction: the programme brings SEEKERS into the product, and a
# practitioner arriving is a different event with a different queue
# (they apply, and somebody approves them).
REFUSAL_CONSULTANT_AS_REFEREE = (
    "Referral codes are for seekers. Your practice is not signed up this way."
)


# ── codes ───────────────────────────────────────────────────────────────────


def code_for(profile_id, kind):
    """This person's code, minted on first ask.

    Lazy rather than at sign-up, because most people never share one and a
    code nobody sees is a row nobody needs. The retry loop is for the
    unique index, not for the odds: seven characters out of thirty-one is
    27 billion, so a collision is a formality.
    """
    row = ReferralCode.objects.filter(profile_id=profile_id, kind=kind).first()
    if row:
        return row

    for _ in range(5):
        try:
            with transaction.atomic():
                return ReferralCode.objects.create(
                    profile_id=profile_id, kind=kind, code=mint(kind)
                )
        except IntegrityError:
            # Either the code collided or this person raced themselves in
            # two tabs. The second is the likely one, and re-reading
            # answers it.
            existing = ReferralCode.objects.filter(
                profile_id=profile_id, kind=kind
            ).first()
            if existing:
                return existing
    raise RuntimeError("could not mint a referral code")


def resolve(code):
    """A typed code to its row, or None. Case and spacing are the user's
    problem to get wrong and ours to forgive — these get read off
    screenshots and over the phone."""
    cleaned = (code or "").strip().replace(" ", "").replace("-", "").upper()
    if not cleaned:
        return None
    return ReferralCode.objects.filter(code=cleaned).first()


# ── sign-up: seeker brings a seeker ─────────────────────────────────────────


def _ai_boost(profile_id, now=None):
    """Give this person extra free AI questions for a few days.

    Written on the QUOTA row rather than as a grant of N messages,
    because the ask was "three a day for three days", not "nine
    messages" — somebody who misses a day does not get to spend the
    backlog on the third.
    """
    from apps.ai.models import Quota

    from apps.ai.services import open_bonus_window, welcome_left

    row, _ = Quota.objects.get_or_create(profile_id=profile_id)
    row.bonus_daily = max(row.bonus_daily or 0, settings.REFERRAL_AI_DAILY)
    row.bonus_days = max(row.bonus_days or 0, settings.REFERRAL_AI_DAYS)

    if welcome_left(row) > 0:
        # EARNED, NOT YET STARTED. This person is still on the welcome
        # five, which are the same for everybody. Opening the window now
        # would spend it on days they are not on the daily ladder for —
        # the referee finishes the welcome five a week later and finds the
        # boost already expired, so the person the programme exists for
        # gets nothing. `_take_free` opens it when the last welcome
        # message is spent.
        row.save(update_fields=("bonus_daily", "bonus_days"))
        return {"daily": row.bonus_daily, "days": row.bonus_days,
                "from": None, "until": None}

    # Already on the daily ladder, so the window opens tomorrow. Not
    # today: the day a referral happens is part-spent, and starting today
    # made the same reward worth two questions or three depending on the
    # hour it was earned.
    open_bonus_window(row, now=now)
    return {
        "daily": row.bonus_daily,
        "days": row.bonus_days,
        "from": row.bonus_from.isoformat(),
        "until": row.bonus_until.isoformat(),
    }


def claim_signup(referee_id, code, now=None):
    """A new seeker types somebody's code during onboarding.

    BOTH SIDES GET THE SAME THING, which is the point of a referral: the
    person who shared it has no reason to unless they are also thanked.

    A consultant's code is refused here with its own sentence rather than
    a generic "invalid", because the holder of an A code who tries it at
    sign-up has not done anything wrong — they have used the right code in
    the wrong place, and the fix is one sentence away.
    """
    row = resolve(code)
    if row is None:
        return {"ok": False, "reason": REFUSAL_UNKNOWN_CODE}
    if not row.active:
        return {"ok": False, "reason": REFUSAL_INACTIVE}
    if row.kind == ReferralCode.Kind.CONSULTANT:
        return {"ok": False, "reason": REFUSAL_WRONG_KIND_AT_SIGNUP}
    if str(row.profile_id).replace("-", "") == str(referee_id).replace("-", ""):
        return {"ok": False, "reason": REFUSAL_SELF}

    # NOBODY EARNS ANYTHING WHEN A CONSULTANT IS THE ONE ARRIVING.
    #
    # Both directions into a consultant pay nothing, and for the same
    # reason: this programme exists to bring SEEKERS into the product.
    # A practitioner joining is a different event entirely — they apply
    # and somebody approves them — and free AI questions are not what
    # either side of that wants.
    #
    # Refused rather than silently worth nothing, which is the rule the
    # consultant-to-consultant case already follows: telling somebody
    # their code worked and crediting them nothing is worse than telling
    # them it does not apply.
    #
    # Checked at CLAIM time only. A seeker who used a code legitimately
    # and is approved as a consultant months later keeps what they were
    # given; nothing reaches back.
    from apps.consultants import services as consultant_services

    if consultant_services.is_approved(referee_id):
        return {"ok": False, "reason": REFUSAL_CONSULTANT_AS_REFEREE}

    try:
        with transaction.atomic():
            referral = Referral.objects.create(
                kind=Referral.Kind.SIGNUP,
                referrer_id=row.profile_id,
                referee_id=referee_id,
                code=row.code,
            )
            referee = _ai_boost(referee_id, now)
            referrer = _ai_boost(row.profile_id, now)
    except IntegrityError:
        # The unique index. One account collecting the new-seeker perk from
        # six friends' codes is the abuse this exists to stop.
        return {"ok": False, "reason": REFUSAL_ALREADY_REFERRED}

    _notify_referrer(referral, referrer)
    # First touch, so "how many came by referral" has an answer. Nothing
    # wrote attribution before 3 Oct 2026; get_or_create keeps the first
    # source if anything ever recorded one earlier.
    from apps.analytics.models import Source
    from apps.analytics.services import remember_first_touch

    remember_first_touch(referee_id, Source.REFERRAL, referrer_id=row.profile_id)
    return {"ok": True, "referral_id": str(referral.id), "you": referee,
            "them": referrer}


def _notify_referrer(referral, grant):
    """Tell the person whose code it was. Written in the same transaction
    as nothing — a notification that fails must not undo a referral that
    succeeded, so this is deliberately outside the atomic block above.

    It names who joined (owner's request, 5 Oct 2026): "Someone" told the
    referrer nothing they could act on. A sign-up that claims before the
    name is saved is named by the last digits of their number instead.
    """
    from apps.notifications import services as notify
    from apps.profiles.models import Profile

    who = Profile.objects.filter(pk=referral.referee_id).values("name", "phone").first() or {}
    name = (who.get("name") or "").strip()
    if not name:
        digits = "".join(ch for ch in (who.get("phone") or "") if ch.isdigit())
        name = f"A new member (number ending {digits[-4:]})" if len(digits) >= 4 else "A new member"

    if grant.get("until"):
        until = _day(grant["until"])
        perk = (f"You both get {grant['daily']} free questions a day with Namo AI, "
                f"from tomorrow until {until}.")
    else:
        perk = (f"You both get {grant['daily']} free questions a day with Namo AI "
                f"for {grant['days']} days, once your welcome questions are used.")

    notify.push(
        referral.referrer_id,
        kind="referral.signup",
        title=f"{name} joined with your code",
        body=perk,
        ref_type="referral",
        ref_id=str(referral.id),
    )


def _day(iso):
    """2026-10-06 → 6 Oct. A date a person reads, not a database's."""
    from datetime import date

    d = date.fromisoformat(str(iso)[:10])
    return f"{d.day} {d.strftime('%b')}"


REFUSAL_CONSULTANT_LINK_NOT_YOURS = (
    "Affiliate links are for approved consultants."
)


def affiliate_link(consultant_id, product_id=None):
    """A link the consultant can paste anywhere, with their code in it.

    The code IS the coupon — there is no second identifier to track,
    because a link that attributes through one string and pays through
    another is a link that can attribute and not pay.
    """
    from django.conf import settings

    code = code_for(consultant_id, ReferralCode.Kind.CONSULTANT)
    base = settings.APP_PUBLIC_URL.rstrip("/")
    query = f"ref={code.code}"
    if product_id:
        query += f"&p={product_id}"
    return {
        "code": code.code,
        "url": f"{base}/shop?{query}",
        "product_id": str(product_id) if product_id else None,
        "share_text": (
            "I use this one. Buy it here and you get 10% back in your Namo "
            f"wallet on your first order: {base}/shop?{query}"
        ),
    }


def my_referrals(profile_id):
    """What this person's codes have actually done. The number that makes
    somebody share a code twice is the number that says the first one
    worked."""
    rows = Referral.objects.filter(referrer_id=profile_id)
    return {
        "signups": rows.filter(kind=Referral.Kind.SIGNUP).count(),
        "purchases": rows.filter(kind=Referral.Kind.PURCHASE).count(),
        # Have THEY already used somebody's code? The profile card hides
        # its input on this rather than leaving a box that can only ever
        # refuse — a control that cannot succeed again invites the attempt
        # and then explains itself badly.
        "claimed": Referral.objects.filter(
            referee_id=profile_id, kind=Referral.Kind.SIGNUP
        ).exists(),
    }


def cashback_row(row):
    return {
        "id": str(row.id),
        "amount_paise": row.amount_paise,
        "side": row.side,
        "status": row.status,
        "matures_at": row.matures_at.isoformat() if row.matures_at else None,
        "paid_at": row.paid_at.isoformat() if row.paid_at else None,
        "note": row.note,
        "created_at": row.created_at.isoformat(),
    }


# ── checkout: a consultant's code on a first order ──────────────────────────


def _has_bought_before(profile_id, exclude_order_id=None):
    """Has this person ever completed a shop order?

    PAID and REFUNDED count. CANCELLED does not, and the line between
    them is whether the thing was ever actually bought:

      REFUNDED  they had it and sent it back. The one first-order offer
                was used — otherwise buy, return, buy again is an
                unlimited 10%.
      CANCELLED the order never happened. A mis-tap reversed before
                anything shipped, or an admin undoing a mistake. Holding
                the offer against somebody for an order they never
                received is charging them for our correction.

    Both are reversals in the ledger and only the status tells them
    apart, which is why an admin undoing an accidental purchase must
    write CANCELLED and not REFUNDED. Getting that wrong on 26 Sep cost
    the owner their own first-order coupon.
    """
    from apps.shop.models import Order, OrderItem

    qs = OrderItem.objects.filter(
        order__profile_id=profile_id,
        order__status__in=(Order.Status.PAID, Order.Status.REFUNDED),
        item_type="product",
    )
    if exclude_order_id is not None:
        # THE ORDER BEING PLACED RIGHT NOW DOES NOT COUNT AGAINST ITSELF.
        # `claim_purchase` runs after the order and its items are written,
        # so without this every referred order sees its own line and
        # refuses itself as a second purchase — which is exactly what the
        # first run of this did.
        qs = qs.exclude(order_id=exclude_order_id)
    return qs.exists()


def check_coupon(buyer_id, code, exclude_order_id=None):
    """Can this buyer use this consultant's code right now?

    Read-only, and called BEFORE the order is written so the refusal
    arrives while the basket is still on screen. `claim_purchase` re-runs
    every one of these checks inside the order's transaction, because a
    check that is only advisory is a check two tabs can both pass.
    """
    row = resolve(code)
    if row is None:
        return {"ok": False, "reason": REFUSAL_UNKNOWN_CODE}
    if not row.active:
        return {"ok": False, "reason": REFUSAL_INACTIVE}
    if row.kind != ReferralCode.Kind.CONSULTANT:
        return {"ok": False, "reason": REFUSAL_WRONG_KIND_AT_CHECKOUT}
    if str(row.profile_id).replace("-", "") == str(buyer_id).replace("-", ""):
        return {"ok": False, "reason": REFUSAL_SELF}

    # Consultant to consultant pays nobody anything (the owner's point 3).
    # Refused rather than silently worth zero: a consultant who is told
    # "you got 10%" and receives nothing has been lied to.
    from apps.consultants import services as consultant_services

    if consultant_services.is_approved(buyer_id):
        return {"ok": False, "reason": REFUSAL_CONSULTANT_TO_CONSULTANT}

    if _has_bought_before(buyer_id, exclude_order_id):
        return {"ok": False, "reason": REFUSAL_NOT_FIRST_ORDER}
    from apps.shop.models import Order

    if Referral.objects.filter(
        referee_id=buyer_id, kind=Referral.Kind.PURCHASE
    ).exclude(order_id=exclude_order_id).exclude(
        # An order that never happened (lapsed unpaid, cancelled) does not
        # use the offer up, the same rule as _has_bought_before.
        order__status=Order.Status.CANCELLED,
    ).exists():
        return {"ok": False, "reason": REFUSAL_NOT_FIRST_ORDER}

    return {"ok": True, "referrer_id": str(row.profile_id), "code": row.code}


def _cashback_paise(order_total_paise):
    """10%, capped if a cap is set. **Zero cap means no cap**, which is
    where it starts — the flag exists so a limit can be imposed without a
    deploy, not because one is in force."""
    from django.conf import settings

    amount = (order_total_paise * settings.REFERRAL_CASHBACK_BPS) // 10_000
    cap = settings.REFERRAL_CASHBACK_CAP_PAISE
    return min(amount, cap) if cap > 0 else amount


def cashback_base(order):
    """What the 10% is taken on: the goods. Not delivery and not the
    cash-on-delivery fee (6 Oct 2026) — both are pass-through costs."""
    delivery = sum(order.items.filter(item_type="shipping").values_list("unit_price_paise", flat=True))
    return order.total_paise - delivery - (getattr(order, "cod_fee_paise", 0) or 0)


def cashback_split(lines, prepaid):
    """(buyer_paise, referrer_paise) for a first order through an
    astrologer's code (9 Oct 2026; the rules are apps/shop/offers.py).

    `lines` is [(product, unit_price_paise, qty)]. Per line:
      - a product with its own rule: the buyer gets the rule's amount, on a
        PREPAID order only; the astrologer gets the platform rate on what is
        left of the line after it (₹700 − ₹500 → 10% of ₹200 = ₹20).
      - a product on DEFAULT: as before — the platform rate on those lines
        together, capped by REFERRAL_CASHBACK_CAP_PAISE, to the astrologer,
        and the same to the buyer on a prepaid order.
    Cash on delivery pays the buyer nothing (owner, 9 Oct 2026): the
    cashback is what makes paying first worth it."""
    from django.conf import settings
    from apps.shop import offers

    bps = settings.REFERRAL_CASHBACK_BPS
    buyer = referrer = default_base = 0
    for product, unit, qty in lines:
        own = offers.buyer_cashback(product, unit, qty) if product is not None else None
        if own is None:
            default_base += unit * qty
            continue
        back = own if prepaid else 0
        buyer += back
        referrer += (unit * qty - back) * bps // 10_000
    default = _cashback_paise(default_base)
    referrer += default
    if prepaid:
        buyer += default
    return buyer, referrer


def _order_lines(order):
    from apps.shop.models import Product

    items = list(order.items.filter(item_type="product"))
    products = Product.objects.in_bulk([i.item_id for i in items])
    return [(products.get(i.item_id), i.unit_price_paise, i.qty) for i in items]


def claim_purchase(buyer_id, order, code):
    """Record the attribution and owe both sides 10%.

    NOTHING IS PAID HERE. Two pending rows are written and that is all —
    they mature seven days after the order is DELIVERED. Credited at
    purchase, a buyer could take the cashback, spend it on a consultation
    and return the item, and money already paid to a consultant cannot be
    clawed back.

    Called inside the order's own transaction, so an order that refuses
    for any later reason takes the attribution with it.
    """
    # Re-checked inside the order's transaction, excluding this order:
    # the advisory check at the top of checkout is one two tabs can both
    # pass, and this is the one that actually decides.
    verdict = check_coupon(buyer_id, code, exclude_order_id=order.id)
    if not verdict["ok"]:
        return verdict

    # On the goods, line by line, never the courier or the COD fee: each
    # product's own rule (9 Oct 2026), the buyer's share on prepaid only.
    from apps.shop.models import Order

    prepaid = order.payment_method != Order.PaymentMethod.COD
    buyer_amount, referrer_amount = cashback_split(_order_lines(order), prepaid)
    if buyer_amount <= 0 and referrer_amount <= 0:
        # Nothing to owe — a zero-amount row would fail its own CHECK. The
        # attribution is still recorded below only when something is owed.
        return {"ok": True, "cashback_paise": 0}

    referral = Referral.objects.create(
        kind=Referral.Kind.PURCHASE,
        referrer_id=verdict["referrer_id"],
        referee_id=buyer_id,
        code=verdict["code"],
        order=order,
    )
    short = str(order.id)[:8]
    for side, who, amount, note in (
        (Cashback.Side.BUYER, buyer_id, buyer_amount, f"Cashback on your first order {short}"),
        (Cashback.Side.REFERRER, verdict["referrer_id"], referrer_amount, f"Referral on order {short}"),
    ):
        if amount > 0:
            Cashback.objects.create(
                referral=referral, profile_id=who, side=side, amount_paise=amount, note=note,
            )
    # What the BUYER is told: their own share, never the astrologer's.
    return {"ok": True, "cashback_paise": buyer_amount, "referral_id": str(referral.id)}


# ── maturation: delivery, then the wait, then the money ─────────────────────


def on_shipment_status(order_id, status):
    """The shop telling us a parcel moved. Starts or cancels the clock.

    DELIVERED starts it — `matures_at` is seven days from delivery, not
    from the order, because the return window runs from when the thing
    arrived.

    RETURNED and CANCELLED kill it. A pending row is cancelled outright,
    which is the whole reason the money waits: there is nothing to claw
    back from anybody because nothing has been paid.
    """
    from django.conf import settings
    from apps.shop.models import Shipment

    pending = Cashback.objects.filter(
        referral__order_id=order_id, status=Cashback.Status.PENDING
    )
    if not pending.exists():
        return 0

    if status == Shipment.Status.DELIVERED:
        return pending.update(
            matures_at=timezone.now()
            + timezone.timedelta(days=settings.REFERRAL_HOLD_DAYS)
        )

    if status in (Shipment.Status.RETURNED, Shipment.Status.CANCELLED):
        moved = 0
        for row in pending:
            row.status = Cashback.Status.CANCELLED
            row.note = f"Order {status}"
            row.save(update_fields=("status", "note"))
            moved += 1
            _notify_cancelled(row, status)
        return moved

    return 0


def mature_due(now=None):
    """Pay everything whose wait is over. Idempotent and re-runnable.

    Each row is moved to PAID under its own lock and its own transaction
    BEFORE the money is written, so a sweep that dies halfway cannot pay
    the same cashback twice — the second run finds the row already paid
    and skips it. The same rule the chat sweeper follows.
    """
    stamp = now or timezone.now()
    due = Cashback.objects.filter(
        status=Cashback.Status.PENDING,
        matures_at__isnull=False,
        matures_at__lte=stamp,
    ).values_list("id", flat=True)

    paid = 0
    for cashback_id in list(due):
        if _pay_one(cashback_id, stamp):
            paid += 1
    return paid


def _pay_one(cashback_id, stamp):
    with transaction.atomic():
        row = (
            Cashback.objects.select_for_update()
            .filter(pk=cashback_id, status=Cashback.Status.PENDING)
            .first()
        )
        if row is None:
            return False  # another sweeper took it
        row.status = Cashback.Status.PAID
        row.paid_at = stamp
        row.save(update_fields=("status", "paid_at"))

        if row.side == Cashback.Side.BUYER:
            _credit_wallet(row)
        else:
            _credit_earnings(row)
    _notify_paid(row)
    return True


def _credit_wallet(row):
    """The buyer's 10%, into the wallet they already spend from.

    Spendable on a consultation or another order, and NOT withdrawable —
    which needs no enforcement, because the wallet has no withdraw path
    for seekers at all. It is a top-up wallet; money goes in and is spent
    inside the product. That is what makes cashback safe to give.
    """
    from apps.wallet import services as wallet_services
    from apps.wallet.models import RefType

    # `credit`'s first argument is named wallet_id but is the PROFILE id —
    # `debit` passes profile_id to the same insert_ledger. Following debit
    # rather than the parameter name, because debit is the path that runs
    # in production every day.
    wallet_services.ensure_wallet(row.profile_id)
    wallet_services.credit(
        row.profile_id,
        row.amount_paise,
        "Cashback · referral",
        # ADJUSTMENT, not REFUND: the ledger's CHECK allows four types and
        # this is not money coming back from a failed charge, it is money
        # the product is granting. Calling it a refund would make every
        # reconciliation report read as though a payment had reversed.
        ref_type=RefType.ADJUSTMENT,
        ref_id=str(row.id),
        note=row.note,
    )


def _credit_earnings(row):
    """The consultant's 10%, into the book they draw from at month end.

    The earnings ledger and not the wallet, because that is where a
    consultant's money already lives and where the payout run already
    looks. `fee_bps` is zero: the platform takes no cut of a referral
    bonus it is itself paying.
    """
    from apps.consultants.models import EarningsLedger

    EarningsLedger.objects.create(
        consultant_id=row.profile_id,
        booking=None,
        gross_paise=row.amount_paise,
        fee_bps=0,
        fee_paise=0,
        net_paise=row.amount_paise,
        # `kind` is this table's description column — there is no `note`.
        # It is what the consultant reads on their earnings row, so it
        # says referral rather than the order id they never saw.
        kind=f"Referral cashback · {row.note or ''}".strip(" ·"),
    )


def _notify_paid(row):
    from apps.notifications import services as notify

    rupees = row.amount_paise / 100
    if row.side == Cashback.Side.BUYER:
        title = f"₹{rupees:g} cashback is in your wallet"
        body = "Spend it on a reading or your next order."
    else:
        title = f"₹{rupees:g} referral cashback added to your earnings"
        body = "It goes out with your next payout."
    notify.push(
        row.profile_id, kind="cashback.paid", title=title, body=body,
        ref_type="cashback", ref_id=str(row.id),
        # A sweep that runs again after a crash must not say this twice.
        dedupe_key=f"cashback.paid:{row.id}",
    )


def _notify_cancelled(row, status):
    from apps.notifications import services as notify

    notify.push(
        row.profile_id, kind="cashback.cancelled",
        title="Cashback cancelled",
        body=f"The order was {status}, so the ₹{row.amount_paise / 100:g} "
             "cashback will not be paid.",
        ref_type="cashback", ref_id=str(row.id),
        dedupe_key=f"cashback.cancelled:{row.id}",
    )


def preview_lines(lines):
    """[{product_id, qty}] from the cart -> [(product, price, qty)], at the
    price the server charges, for the preview below."""
    from apps.shop.models import Product

    ids = [str(row["product_id"]) for row in lines or []]
    products = {str(p.id): p for p in Product.objects.filter(id__in=ids, active=True)}
    return [(products[str(row["product_id"])], products[str(row["product_id"])].price_paise, row["qty"])
            for row in lines or [] if str(row["product_id"]) in products]


def describe_code(code, viewer_id=None, subtotal_paise=0, lines=None, payment=None):
    """What would this code do, without using it?

    Answers the question the cart asks while somebody is still typing, so
    a green tick means the SERVER agrees rather than a regex in the
    browser agreeing with itself. Read-only: nothing here writes a row or
    consumes anything.

    `viewer_id` is optional. Without it this answers only what kind of
    code it is and whether it exists — which is what an onboarding screen
    can know, since there is no session yet to check "your own code" or
    "already used one" against. With it, every rule is applied.
    """
    row = resolve(code)
    if row is None:
        return {"ok": False, "kind": None, "reason": REFUSAL_UNKNOWN_CODE}
    if not row.active:
        return {"ok": False, "kind": row.kind, "reason": REFUSAL_INACTIVE}

    if row.kind == ReferralCode.Kind.CONSULTANT:
        if viewer_id is None:
            return {"ok": True, "kind": row.kind,
                    "note": "An astrologer's code. Use it at checkout."}
        verdict = check_coupon(viewer_id, row.code)
        if not verdict["ok"]:
            return {"ok": False, "kind": row.kind, "reason": verdict["reason"]}
        if lines:
            # The basket itself, product by product (9 Oct 2026).
            back, _ = cashback_split(preview_lines(lines), prepaid=True)
        else:
            back = _cashback_paise(subtotal_paise)
        if not back:
            return {"ok": True, "kind": row.kind, "cashback_paise": 0,
                    "note": "An astrologer's code. No cashback on these items."}
        if payment == "cod":
            return {"ok": True, "kind": row.kind, "cashback_paise": 0, "prepaid_cashback_paise": back,
                    "note": f"Cashback is for prepaid orders. Pay online to get ₹{back / 100:,.0f} back."}
        return {
            "ok": True, "kind": row.kind, "cashback_paise": back, "prepaid_cashback_paise": back,
            "note": f"₹{back / 100:,.0f} back in your wallet seven days after delivery",
        }

    # A seeker's sign-up code.
    if viewer_id is None:
        return {"ok": True, "kind": row.kind,
                "note": "A friend's code. Three free questions a day for three days."}
    if str(row.profile_id).replace("-", "") == str(viewer_id).replace("-", ""):
        return {"ok": False, "kind": row.kind, "reason": REFUSAL_SELF}
    if Referral.objects.filter(referee_id=viewer_id, kind=Referral.Kind.SIGNUP).exists():
        return {"ok": False, "kind": row.kind, "reason": REFUSAL_ALREADY_REFERRED}
    return {"ok": True, "kind": row.kind,
            "note": "Three free questions a day for three days, for both of you."}
