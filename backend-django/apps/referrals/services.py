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

    from apps.ai.services import _ist_today

    stamp = now or timezone.now()
    # STARTS TOMORROW. The day the referral happens is already part-spent,
    # and starting today made the same reward worth two questions or three
    # depending on the hour — with the referrer and the person they
    # referred visibly getting different amounts out of one act.
    #
    # Whole days, inclusive at both ends: from tomorrow, for
    # REFERRAL_AI_DAYS days. Three days means three days.
    begins = _ist_today() + timezone.timedelta(days=1)
    until = begins + timezone.timedelta(days=settings.REFERRAL_AI_DAYS - 1)

    row, _ = Quota.objects.get_or_create(profile_id=profile_id)
    # Extending never shortens. Somebody referred twice keeps the earlier
    # start and the later end, so a second referral can only ever widen
    # the window — never cut the first one short.
    if row.bonus_from is None or row.bonus_from > begins:
        row.bonus_from = begins
    if row.bonus_until is None or row.bonus_until < until:
        row.bonus_until = until
    row.bonus_daily = max(row.bonus_daily or 0, settings.REFERRAL_AI_DAILY)
    row.save(update_fields=("bonus_from", "bonus_until", "bonus_daily"))
    return {
        "daily": row.bonus_daily,
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
    return {"ok": True, "referral_id": str(referral.id), "you": referee,
            "them": referrer}


def _notify_referrer(referral, grant):
    """Tell the person whose code it was. Written in the same transaction
    as nothing — a notification that fails must not undo a referral that
    succeeded, so this is deliberately outside the atomic block above."""
    from apps.notifications import services as notify

    notify.push(
        referral.referrer_id,
        kind="referral.signup",
        title="Someone joined with your code",
        body=(
            f"You both get {grant['daily']} free questions a day with Namo AI, "
            f"starting tomorrow, until {grant['until']}."
        ),
        ref_type="referral",
        ref_id=str(referral.id),
    )


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
        "url": f"{base}/#/shop?{query}",
        "product_id": str(product_id) if product_id else None,
        "share_text": (
            "I use this one. Buy it here and you get 10% back in your Namo "
            f"wallet on your first order: {base}/#/shop?{query}"
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

    PAID or REFUNDED both count as having bought. A refunded order still
    used the one first-order offer this programme allows — otherwise buy,
    refund, buy again is an unlimited 10%.
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
    if Referral.objects.filter(
        referee_id=buyer_id, kind=Referral.Kind.PURCHASE
    ).exclude(order_id=exclude_order_id).exists():
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

    amount = _cashback_paise(order.total_paise)
    if amount <= 0:
        # A ₹1 order at 10% is zero paise. The order stands; there is just
        # nothing to owe, and a zero-amount cashback row would fail its
        # own CHECK.
        return {"ok": True, "cashback_paise": 0}

    referral = Referral.objects.create(
        kind=Referral.Kind.PURCHASE,
        referrer_id=verdict["referrer_id"],
        referee_id=buyer_id,
        code=verdict["code"],
        order=order,
    )
    for side, who in (
        (Cashback.Side.BUYER, buyer_id),
        (Cashback.Side.REFERRER, verdict["referrer_id"]),
    ):
        Cashback.objects.create(
            referral=referral, profile_id=who, side=side, amount_paise=amount,
            note=f"10% on order {str(order.id)[:8]}",
        )
    return {"ok": True, "cashback_paise": amount, "referral_id": str(referral.id)}


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
