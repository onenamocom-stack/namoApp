"""Consultants services — the rules of 007/008/009/011/012/013 re-expressed
in code, per module.

Layers:

1. The public projections. The client reads consultants only through
   `consultants_public` (007) and bookings only through `bookings_view`
   (010); Django does not own those SQL views, so `public_consultants()` and
   the booking rows replicate their definitions exactly — the eleven safe
   columns plus the name join, `status = 'approved'` as the predicate, and
   the view's own seeker_id/consultant_id scoping. An unapproved consultant
   is INVISIBLE, not forbidden: a typed URL gets a 404, so ids do not leak
   existence (007, verbatim).

2. The one slots source (009). Slot times are IST and the horizon is 14
   days; both constants live here and nowhere else — a second implementation
   of the subtraction (availability minus time off minus claimed slots,
   claimed at `pending`) is the phase-4 bug the SQL file exists to kill.
   `book_session` consults this same function, never its own arithmetic.

3. The booking transaction (012 as amended by 013). One write per user
   action (rule 5): lock the wallet, check the balance against the LOCKED
   number, open the order, CLAIM THE SLOT (the insert that can raise —
   the partial unique index is the conflict check, not application logic),
   debit the seeker's ledger, credit the consultant's book. Everything
   unwinds together: a refusal leaves no order, no booking and above all
   no orphaned debit. 013's four review fixes are in: the short-balance
   path is its own branch (no shared sentinel), a zero-price service is
   refused by name, and the consultant's book names the SEEKER while the
   seeker's book names the consultant.

4. The reversing credit (012/013). A decline reverses in full (01-PRD
   §5.4): both books get a NEW row, the original debit stands untouched,
   and the order flips to 'refunded'. Idempotency is the unique index
   ledger_one_refund_per_order (013: the insert IS the check — there is
   no read-before-write to race); a retry is a no-op instead of a second
   credit.

5. The catalogue arithmetic (011). The 20-minute price is the PRD's number
   restored, not rounded; only the derived lengths round (15/30 to the
   nearest ₹10, per-minute to the nearest ₹1), half away from zero like
   Postgres numeric round — never Python banker's rounding.
"""

from datetime import datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.profiles import services as profile_services

from . import gateway
from .models import (
    FEE_BPS,
    Booking,
    Consultant,
    ConsultantAvailability,
    ConsultantService,
    ConsultantStatus,
    ConsultantTimeOff,
    EarningsLedger,
    PriceBand,
    ServiceBilling,
)
from apps.wallet import services as wallet_services

# ── the two product constants, named once (009) ──────────────────────────────

IST = ZoneInfo("Asia/Kolkata")  # slot times are IST
HORIZON_DAYS = 14  # the booking horizon


def ist_today():
    """Today in IST (009's (now() at time zone 'Asia/Kolkata')::date)."""
    return timezone.now().astimezone(IST).date()


def dow_of(day):
    """Postgres dow: 0 = Sunday .. 6 = Saturday. Python's weekday() starts
    on Monday, so map — the database carries no second convention (009)."""
    return (day.weekday() + 1) % 7


def _combine_ist(day, slot):
    """(date + time) at time zone 'Asia/Kolkata' — 009's starts_at."""
    return datetime.combine(day, slot, tzinfo=IST)


# ── refusal sentences: byte-identical to 012/013, the UI already shows these ─

REFUSAL_BOOK_SELF = "You cannot book yourself."
REFUSAL_NOT_AVAILABLE = "That session is not available any more."
REFUSAL_NOT_BOOKABLE = "Instant calls are not bookable yet."
REFUSAL_NOT_PRICED = "That session is not priced yet."
REFUSAL_TIME_NOT_OPEN = "That time is no longer open. Pick another."
REFUSAL_NO_WALLET = "No wallet on this account."
REFUSAL_SHORT_BALANCE = "Not enough balance"
REFUSAL_SLOT_TAKEN = "Someone just took that time. Pick another."
REFUSAL_NOT_OPEN_REQUEST = "That request is no longer open."
REFUSAL_NOT_CONSULTANT = "That is not your practice."
REFUSAL_ALREADY_APPLIED = "You have already applied."
REFUSAL_BAD_BAND = "That price band is not available."


class AlreadyApplied(Exception):
    """A second application — the consultants primary key's refusal, raised
    so the view can answer 409 instead of the gate's 403."""


# ── the one slots source (009) ───────────────────────────────────────────────


def open_slots(consultant_id, day):
    """The open slots for one consultant on one date: availability for the
    weekday, minus time off, minus slots claimed at pending or confirmed,
    inside the horizon and not in the past. Out of range returns nothing
    rather than raising: a date picker one day too far is a UI bug (009).

    A seeker learns a slot is gone and never who took it or why — the
    function returns times, never rows (009's security-definer rationale;
    the Django equivalent is that this query is the only subtraction)."""
    consultant = Consultant.objects.filter(profile_id=consultant_id).first()
    today = ist_today()
    # An unapproved or blocked consultant has no open slots, ever — the same
    # predicate as the RLS policy (009).
    if consultant is None or consultant.status != ConsultantStatus.APPROVED:
        return []
    if day < today or day > today + timedelta(days=HORIZON_DAYS):
        return []
    now = timezone.now()
    rules = ConsultantAvailability.objects.filter(
        consultant_id=consultant_id, weekday=dow_of(day)
    ).order_by("slot_time")
    day_start = _combine_ist(day, time.min)
    day_end = day_start + timedelta(days=1)
    off = ConsultantTimeOff.objects.filter(
        consultant_id=consultant_id, starts_at__lt=day_end, ends_at__gt=day_start
    )
    claimed = set(
        Booking.objects.filter(
            consultant_id=consultant_id,
            status__in=(Booking.Status.PENDING, Booking.Status.CONFIRMED),
            starts_at__gte=day_start,
            starts_at__lt=day_end,
        ).values_list("starts_at", flat=True)
    )
    offered = []
    for rule in rules:
        starts_at = _combine_ist(day, rule.slot_time)
        if starts_at <= now:
            continue
        if any(t.starts_at <= starts_at < t.ends_at for t in off):
            continue
        if starts_at in claimed:
            continue
        offered.append({"slot_time": rule.slot_time, "starts_at": starts_at})
    return offered


# ── the catalogue arithmetic (011) ───────────────────────────────────────────


def _round_to_grid(price_paise, grid):
    """Postgres round(price / grid) * grid: half away from zero, never
    banker's rounding (011's exact-ratio-then-round, rule 1's no-float)."""
    units = (Decimal(price_paise) / grid).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(units) * grid


def derive_band_price(rupees, billing, duration_mins):
    """011's arithmetic for one catalogue row: the 20-minute price is the
    PRD's number restored (rupees * 100), never rounded; 15/30 minutes are
    the exact ratio rounded to the nearest ₹10; per-minute the exact rate
    rounded to the nearest ₹1."""
    if billing == ServiceBilling.FIXED:
        price = rupees * 100 * duration_mins // 20  # 007's exact ratio
        if duration_mins == 20:
            return price
        return _round_to_grid(price, 1000)
    return _round_to_grid(rupees * 100 // 20, 100)


def seed_price_bands(tiers=((1, 749), (2, 899), (3, 999), (4, 1299), (5, 1499), (6, 2200))):
    """The service-role replacement for 007's inserts with 011's prices:
    idempotent upsert of the whole catalogue on (tier, billing,
    duration_mins). The losing insert of a racing re-seed reads the winner
    and refreshes it — constraint-safe, exactly like content's seed_content.
    Reachable from no URL; tests and fresh databases stand the catalogue up
    with this."""
    shapes = [(ServiceBilling.FIXED, mins) for mins in (15, 20, 30)]
    shapes.append((ServiceBilling.PER_MINUTE, 1))
    created, refreshed = 0, 0
    for tier, rupees in tiers:
        for billing, duration_mins in shapes:
            price = derive_band_price(rupees, billing, duration_mins)
            with transaction.atomic():
                try:
                    with transaction.atomic():  # savepoint: the lost race rolls back only the insert
                        PriceBand.objects.create(
                            tier=tier,
                            billing=billing,
                            duration_mins=duration_mins,
                            price_paise=price,
                            sort=tier * 10,
                        )
                        created += 1
                        continue
                except IntegrityError:
                    row = PriceBand.objects.get(
                        tier=tier, billing=billing, duration_mins=duration_mins
                    )
                    if (
                        row.price_paise != price
                        or row.sort != tier * 10
                        or not row.active
                    ):
                        row.price_paise = price
                        row.sort = tier * 10
                        row.active = True
                        row.save()
                        refreshed += 1
    return created, refreshed


def list_price_bands():
    """The active catalogue, tier order — 007's only policy is select where
    active, so this is anonymous (ProApply's six buttons read it)."""
    return list(PriceBand.objects.filter(active=True).order_by("tier", "duration_mins", "billing"))


# ── the public projections (007's view / 010's view) ─────────────────────────


def _name_expr(outer_field):
    """The 007/010 name join as an ORM subquery — module 9 owns profiles,
    so the join is all-Django and the raw _xid dance is gone at this
    boundary (profiles.services.name_subquery)."""
    return profile_services.name_subquery(outer_field)


def public_consultants():
    """`consultants_public` (007) as a queryset: the approved rows with the
    profile name joined. The view's own WHERE is the access control — an
    unapproved consultant is invisible, and so is everything but the eleven
    safe columns plus the name."""
    return (
        Consultant.objects.filter(status=ConsultantStatus.APPROVED)
        .annotate(name=_name_expr("profile_id"))
        .order_by(F("rating_avg_cache").desc(nulls_last=True), "-created_at")
    )


def public_consultant(consultant_id):
    """One approved consultant, or None — the same answer for 'no such id',
    'not approved yet' and 'blocked' (007: invisible, not forbidden)."""
    return public_consultants().filter(profile_id=consultant_id).first()


def active_services(consultant_id, requester_id=None):
    """`consultant_services` per the 007 select policy: the approved
    consultant's active price list, or the consultant's own while pending.
    Anyone else gets nothing (RLS parity: the policy answers an empty set,
    not an error)."""
    consultant = Consultant.objects.filter(profile_id=consultant_id).first()
    if consultant is None:
        return []
    if (
        consultant.status != ConsultantStatus.APPROVED
        and str(consultant.profile_id) != str(requester_id or "")
    ):
        return []
    return list(
        ConsultantService.objects.filter(consultant_id=consultant_id, active=True).order_by(
            "sort", "duration_mins", "billing"
        )
    )


def my_consultant(profile_id):
    """The caller's own consultants row, or None — store.jsx's
    refreshConsultant read, including the pending row (007's
    consultants_select_own; the bare gateway the profile module replaces)."""
    return Consultant.objects.filter(profile_id=profile_id).first()


# ── availability (007's grid; the 009 check's write side) ────────────────────


def list_availability(consultant_id):
    """The consultant's own rules, one row per open cell, grid order."""
    rows = ConsultantAvailability.objects.filter(consultant_id=consultant_id).order_by(
        "weekday", "slot_time"
    )
    return [
        {"weekday": row.weekday, "slot_time": row.slot_time} for row in rows
    ]


def set_availability(consultant_id, weekday, slot_time, open):
    """One cell of the grid, on or off. One INSERT or one DELETE (007) —
    idempotent both ways, so a double-tap is a no-op rather than an error."""
    if open:
        ConsultantAvailability.objects.get_or_create(
            consultant_id=consultant_id, weekday=weekday, slot_time=slot_time
        )
    else:
        ConsultantAvailability.objects.filter(
            consultant_id=consultant_id, weekday=weekday, slot_time=slot_time
        ).delete()


def add_time_off(consultant_id, starts_at, ends_at, reason=None):
    """A closure window. Service layer only (009's check writes these
    directly); there is no client screen for time off yet, so no URL."""
    return ConsultantTimeOff.objects.create(
        consultant_id=consultant_id, starts_at=starts_at, ends_at=ends_at, reason=reason
    )


# ── the application (007's insert grant + 009 assertion 9's band rule) ───────


def apply(profile_id, *, category, specialization, languages, experience_yrs, bio,
          credentials, tier):
    """One application, one transaction (rule 5): the consultants row — the
    insert grant's columns ONLY; status lands 'pending' and verified False
    because the request shape has no fields for them (009 check assertion 8:
    a consultant cannot approve themselves) — plus a service row per active
    band of the chosen tier, priced BY COPYING THE BAND ROW, never from the
    body (assertion 9: a service priced off no band is refused; here the
    refusal is structural)."""
    bands = list(
        PriceBand.objects.filter(active=True, tier=tier).order_by(
            "sort", "duration_mins", "billing"
        )
    )
    if not bands:
        raise PermissionDenied(REFUSAL_BAD_BAND)
    try:
        with transaction.atomic():
            consultant = Consultant.objects.create(
                profile_id=profile_id,
                category=category,
                specialization=specialization,
                languages=list(languages or []),
                experience_yrs=experience_yrs,
                bio=bio,
                credentials=list(credentials or []),
            )
            for n, band in enumerate(bands):
                ConsultantService.objects.create(
                    consultant_id=consultant.profile_id,
                    band_id=band.id,
                    mode="call",
                    billing=band.billing,
                    duration_mins=band.duration_mins,
                    price_paise=band.price_paise,  # the band's price, never the request's
                    sort=n * 10,
                )
    except IntegrityError:
        raise AlreadyApplied(REFUSAL_ALREADY_APPLIED) from None
    return consultant


# ── the booking transaction (012 as amended by 013) ──────────────────────────


def fee_paise(amount_paise):
    """18% in basis points, rounded like Postgres numeric round (012)."""
    return int((Decimal(amount_paise) * FEE_BPS / 10000).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    ))


def book_session(seeker_id, *, consultant_id, service_id, starts_at):
    """THE transaction. One write per user action (rule 5): the client sends
    { consultantId, serviceId, startsAt } and NO PRICE (rule 3) — every
    number below is looked up on this side of the wire.

    The order of operations is 012's design, and it is not arbitrary: lock
    the wallet, check the balance against the LOCKED number, open the
    order, CLAIM THE SLOT (the insert that can raise — the loser never
    reaches the debit), debit the seeker's ledger, credit the consultant's
    book. Everything in the block unwinds together, so a refusal leaves no
    order and no booking and no orphaned debit."""
    if str(consultant_id) == str(seeker_id):
        return {"ok": False, "reason": REFUSAL_BOOK_SELF}
    service = (
        ConsultantService.objects.filter(
            pk=service_id,
            consultant_id=consultant_id,
            active=True,
            consultant__status=ConsultantStatus.APPROVED,
        )
        .select_related("consultant")
        .first()
    )
    if service is None:
        return {"ok": False, "reason": REFUSAL_NOT_AVAILABLE}
    # Per-minute is metered in module 7's chat, where the session with join
    # and leave timestamps lives. Refused by name rather than charged as
    # though one minute were the whole call (012).
    if service.billing != ServiceBilling.FIXED:
        return {"ok": False, "reason": REFUSAL_NOT_BOOKABLE}
    # 013 fix 3: a price of zero is a catalogue mistake, not a free session,
    # and must not reach a ledger that refuses a zero delta.
    if service.price_paise <= 0:
        return {"ok": False, "reason": REFUSAL_NOT_PRICED}
    # Availability, time off, the horizon and the past, from the ONE slots
    # source — a second implementation of this subtraction is the phase-4
    # bug (009).
    slot_day = starts_at.astimezone(IST).date()
    if not any(o["starts_at"] == starts_at for o in open_slots(consultant_id, slot_day)):
        return {"ok": False, "reason": REFUSAL_TIME_NOT_OPEN}

    pro_name = gateway.profile_name(consultant_id)
    seeker_name = gateway.profile_name(seeker_id)
    # Each party's book names the OTHER party (013 fix 4).
    label = f"{pro_name or 'Consultation'} · {service.duration_mins} min"
    earnings_label = f"{seeker_name or 'Session'} · {service.duration_mins} min"
    fee = fee_paise(service.price_paise)

    try:
        with transaction.atomic():
            # Steps 1 and 2 (012): the lock, then the check against the
            # locked number — never a balance the client sent.
            balance = wallet_services.lock_wallet_balance(seeker_id)
            if balance is None:
                return {"ok": False, "reason": REFUSAL_NO_WALLET}
            if service.price_paise > balance:
                # 013 fix 2: its own branch, not a shared SQLSTATE sentinel.
                # Nothing is written by here, so the read-only early return
                # is safe — there is no block to unwind.
                return {
                    "ok": False,
                    "reason": REFUSAL_SHORT_BALANCE,
                    "balance_paise": balance,
                }
            # Step 3: the order. One booking is one order with one line
            # (012 §4.7).
            order_id = gateway.insert_order(seeker_id, service.price_paise)
            gateway.insert_order_item(
                order_id,
                item_type="session",
                item_id=service.id,
                title=label,
                unit_price_paise=service.price_paise,
            )
            # Step 4: THE CLAIM. duration_mins and amount_paise are frozen
            # copies, not joins; status is pending — the slot is held while
            # the consultant decides, or two seekers are sold the same half
            # hour (009/012). The partial unique index bookings_slot_claim
            # is the conflict check: the loser raises here and never reaches
            # step 5, and the whole block unwinds.
            booking = Booking.objects.create(
                seeker_id=seeker_id,
                consultant_id=consultant_id,
                service_id=service.id,
                order_id=order_id,
                starts_at=starts_at,
                duration_mins=service.duration_mins,
                amount_paise=service.price_paise,
                mode=service.mode,
                status=Booking.Status.PENDING,
            )
            # Step 5: the seeker's side. Append-only (rule 2); the wallet
            # balance follows by the phase-2 trigger on Postgres and by the
            # gateway's emulation on SQLite (wallet_services.insert_ledger).
            wallet_services.insert_ledger(
                seeker_id, -service.price_paise, label, ref_type="order", ref_id=order_id
            )
            # Step 6: the consultant's side, in the transaction that is
            # already open — which is why earnings_ledger exists in v1.
            EarningsLedger.objects.create(
                consultant_id=consultant_id,
                booking_id=booking.id,
                gross_paise=service.price_paise,
                fee_bps=FEE_BPS,
                fee_paise=fee,
                net_paise=service.price_paise - fee,
                kind=earnings_label,
            )
    except IntegrityError:
        # 23505 on bookings_slot_claim. The conflict check is the database's,
        # not this function's; the loser never reached the debit.
        return {"ok": False, "reason": REFUSAL_SLOT_TAKEN}
    return {
        "ok": True,
        "booking_id": str(booking.id),
        "order_id": order_id,
        "balance_paise": balance - service.price_paise,
    }


# ── the reversing credit (012/013) ───────────────────────────────────────────


def booking_reverse(booking_id, reason):
    """One movement with three reasons (01-PRD §5.4): the consultant
    declines, the consultant never turns up, a platform failure. Nothing is
    ever edited — both books get a NEW row (rule 2) and the original debit
    is left exactly as it stands.

    Idempotent on the refund row itself rather than on a flag column (013):
    one order, one reversal, and the unique index ledger_one_refund_per_order
    is the guarantee — a second call is a no-op instead of a second credit,
    and a racing duplicate is CAUGHT, never checked for (rule 6). A seeded
    booking carries no order because no money was ever taken for it:
    nothing to reverse is not a failure (012)."""
    booking = Booking.objects.filter(pk=booking_id).first()
    if booking is None or booking.order_id is None:
        return {"ok": True, "reversed": False}
    try:
        with transaction.atomic():
            if wallet_services.lock_wallet_balance(booking.seeker_id) is None:
                raise ValueError(f"booking {booking.id} has no seeker wallet to credit")
            wallet_services.insert_ledger(
                booking.seeker_id,
                booking.amount_paise,
                "Refund · session",
                ref_type="refund",
                ref_id=booking.order_id,
                note=reason,
            )
            # The consultant's side reverses too, every sign flipping
            # together, so gross - fee = net still holds on the reversing
            # row — a declined session nets to zero in their book.
            original = (
                EarningsLedger.objects.filter(booking_id=booking.id, gross_paise__gt=0)
                .order_by("created_at", "id")
                .first()
            )
            if original is not None:
                EarningsLedger.objects.create(
                    consultant_id=original.consultant_id,
                    booking_id=booking.id,
                    gross_paise=-original.gross_paise,
                    fee_bps=original.fee_bps,
                    fee_paise=-original.fee_paise,
                    net_paise=-original.net_paise,
                    kind=f"Reversed · {reason}",
                )
            gateway.set_order_refunded(booking.order_id)
    except IntegrityError:
        # 23505 on ledger_one_refund_per_order — already reversed. The
        # ordinary case on a retry, not an error; the block (including the
        # earnings row) has already unwound.
        return {"ok": True, "reversed": False}
    return {"ok": True, "reversed": True, "amount_paise": booking.amount_paise}


def decide_booking(actor_id, booking_id, status):
    """Accept or decline — the ONLY status write a client can make, and it
    is exactly the pending -> confirmed | declined edge of the state
    machine (008's policy: `using` reads the old row, `with check` the new
    one). A consultant cannot mark their own session completed to be paid
    for one they did not take, and cannot reach back into a resolved
    booking. The conditional UPDATE (not read-then-write) decides a race:
    one winner, and the reversal runs in the same transaction as the
    status flip, exactly as 012's trigger does."""
    if status not in (Booking.Status.CONFIRMED, Booking.Status.DECLINED):
        raise PermissionDenied("That is not a decision this screen can make.")
    booking = Booking.objects.filter(pk=booking_id).select_related().first()
    if booking is None:
        raise NotFound("That booking is not available.")
    if str(booking.consultant_id) != str(actor_id):
        raise PermissionDenied(REFUSAL_NOT_OPEN_REQUEST)
    with transaction.atomic():
        changed = Booking.objects.filter(
            pk=booking.id,
            consultant_id=actor_id,
            status=Booking.Status.PENDING,
        ).update(status=status)
        if changed == 0:
            raise PermissionDenied(REFUSAL_NOT_OPEN_REQUEST)
        reversed_result = None
        if status == Booking.Status.DECLINED:
            reversed_result = booking_reverse(booking.id, "declined")
    return {
        "ok": True,
        "status": status,
        "reversed": bool(reversed_result and reversed_result["reversed"]),
    }


# ── bookings_view (010): the read side, carrying the other party's name ──────


def _booking_view_qs():
    """`bookings_view` (010) as a queryset: the booking columns plus the
    join that carries the seeker's name — and the seeker's BIRTH DETAILS to
    the consultant, which is not an oversight: a reading cannot be done
    without them, and a booking is the seeker asking for one. Scoped to the
    caller by the views; no phone, no email (010, verbatim)."""
    return Booking.objects.annotate(
        seeker_name=_name_expr("seeker_id"),
        birth_date=profile_services.birth_subquery("seeker_id", "birth_date"),
        birth_time=profile_services.birth_subquery("seeker_id", "birth_time"),
        birth_place=profile_services.birth_subquery("seeker_id", "birth_place"),
        consultant_name=_name_expr("consultant_id"),
    )


def _booking_row(row):
    return {
        "id": str(row.id),
        "seeker_id": str(row.seeker_id),
        "consultant_id": str(row.consultant_id),
        "service_id": str(row.service_id),
        "order_id": str(row.order_id) if row.order_id else None,
        "starts_at": row.starts_at,
        "duration_mins": row.duration_mins,
        "amount_paise": row.amount_paise,
        "mode": row.mode,
        "status": row.status,
        "note": row.note,
        "created_at": row.created_at,
        "seeker_name": row.seeker_name,
        "birth_date": row.birth_date,
        "birth_time": row.birth_time,
        "birth_place": row.birth_place,
        "consultant_name": row.consultant_name,
    }


def list_bookings_for(consultant_id):
    """The consultant's queue, newest slot first (010)."""
    rows = _booking_view_qs().filter(consultant_id=consultant_id).order_by("-starts_at")
    return [_booking_row(row) for row in rows]


def list_bookings_by(seeker_id):
    """Every booking this seeker has made, newest slot first — the same
    view, restricting itself by the same predicate (010)."""
    rows = _booking_view_qs().filter(seeker_id=seeker_id).order_by("-starts_at")
    return [_booking_row(row) for row in rows]


def list_earnings(consultant_id, limit=50):
    """The consultant's own book (012's read policy: own rows only), newest
    first, capped the way the client reads it."""
    rows = EarningsLedger.objects.filter(consultant_id=consultant_id).order_by(
        "-created_at", "-id"
    )[:limit]
    return [
        {
            "id": str(row.id),
            "consultant_id": str(row.consultant_id),
            "booking_id": str(row.booking_id) if row.booking_id else None,
            "gross_paise": row.gross_paise,
            "fee_bps": row.fee_bps,
            "net_paise": row.net_paise,
            "fee_paise": row.fee_paise,
            "kind": row.kind,
            "created_at": row.created_at,
        }
        for row in rows
    ]
