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

from django.db import IntegrityError, connection, transaction
from django.db.models import BooleanField, Case, F, OuterRef, Q, Subquery, TextField, Value, When
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.profiles import services as profile_services
from apps.profiles.models import Profile

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
    ServiceMode,
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
REFUSAL_BAD_RATE = "Each rate is a whole number of rupees from ₹5 to ₹110 a minute."


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


# A booked slot costs this much less than the same minutes on the meter
# (5 Oct 2026, the owner's call; the amount is docs/01-PRD.md §4.1's).
SLOT_DISCOUNT_PCT = 20


def derive_band_price(rupees, billing, duration_mins):
    """One catalogue row's price. Per-minute is the tier's 20-minute number
    over 20, rounded to the nearest ₹1 (011). A FIXED slot is that same
    per-minute rate times its minutes, less SLOT_DISCOUNT_PCT, rounded to
    the nearest ₹1 — booking ahead is cheaper than calling now.

    This replaced 011's slot prices on 5 Oct 2026, which charged a 20-minute
    slot the tier's whole number (₹749 for tier 1, against ₹37 × 20 = ₹740
    on the meter): a slot was never cheaper, so nothing rewarded booking."""
    per_minute = _round_to_grid(rupees * 100 // 20, 100)
    if billing == ServiceBilling.FIXED:
        return _round_to_grid(per_minute * duration_mins * (100 - SLOT_DISCOUNT_PCT) // 100, 100)
    return per_minute


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


def reprice_services():
    """Every booked-slot (FIXED) service takes its band's CURRENT price.

    A service copies its band's price when the consultant applies (assertion
    9), so a change to the catalogue does not reach anybody already approved
    until this runs. Bookings are untouched — each holds the price it was
    charged. Returns how many services changed.

    Per-minute rates are deliberately left alone: the 5 Oct 2026 change was
    to slots only, and the first run on production reset a hand-set test
    rate (Raghu's ₹10/min) to its tier's ₹37 — put back by hand.

    Since 10 Oct 2026 every service row has a null band (consultants type
    their own rates), so this finds nothing to change. Kept so the command
    that calls it does not break; it must not be taught to reprice again."""
    changed = 0
    for band in PriceBand.objects.filter(billing=ServiceBilling.FIXED):
        changed += ConsultantService.objects.filter(band_id=band.id).exclude(
            price_paise=band.price_paise
        ).update(price_paise=band.price_paise)
    return changed


# ── the consultant's own rates (10 Oct 2026, Rahul; replaced the bands) ──────
#
# Four numbers, each typed by the consultant: rupees a minute for chat,
# video, audio and a booked slot. A slot is 20 minutes, its price the
# booking rate times 20. The range is the whole check — the platform no
# longer sets the ladder, it sets the floor and the ceiling.

RATE_MIN_RUPEES = 5
RATE_MAX_RUPEES = 110
SLOT_MINUTES = 20
# channel -> the per-minute row's mode. Video keeps `call`, the mode every
# per-minute row had before, so a session already open finds its row.
RATE_MODES = {"chat": ServiceMode.CHAT, "video": ServiceMode.CALL, "audio": ServiceMode.AUDIO}
RATE_KEYS = ("chat", "video", "audio", "booking")


class BadRate(Exception):
    """A rate outside the range, or not a whole number of rupees."""


def _clean_rates(rates):
    """{key: whole rupees} for all four keys, or BadRate. Booleans and
    fractions are refused rather than rounded: a typed ₹12.5 is a mistake
    to show, not a price to guess at."""
    clean = {}
    for key in RATE_KEYS:
        value = (rates or {}).get(key)
        if isinstance(value, bool) or not isinstance(value, int):
            raise BadRate(REFUSAL_BAD_RATE)
        if not RATE_MIN_RUPEES <= value <= RATE_MAX_RUPEES:
            raise BadRate(REFUSAL_BAD_RATE)
        clean[key] = value
    return clean


def _write_rates(consultant_id, rates):
    """The four rows, written in the caller's transaction. A row's price
    changes in place: bookings and sessions hold frozen copies, so nothing
    already paid for moves. Every other fixed length is switched off, not
    deleted — old bookings point at those rows."""
    for n, (key, mode) in enumerate(RATE_MODES.items()):
        ConsultantService.objects.update_or_create(
            consultant_id=consultant_id,
            mode=mode,
            billing=ServiceBilling.PER_MINUTE,
            duration_mins=1,
            defaults={"price_paise": rates[key] * 100, "active": True,
                      "band_id": None, "sort": 100 + n * 10},
        )
    ConsultantService.objects.update_or_create(
        consultant_id=consultant_id,
        mode=ServiceMode.CALL,
        billing=ServiceBilling.FIXED,
        duration_mins=SLOT_MINUTES,
        defaults={"price_paise": rates["booking"] * 100 * SLOT_MINUTES, "active": True,
                  "band_id": None, "sort": 0},
    )
    ConsultantService.objects.filter(
        consultant_id=consultant_id, billing=ServiceBilling.FIXED
    ).exclude(duration_mins=SLOT_MINUTES).update(active=False)


def set_rates(consultant_id, rates):
    """The consultant's four rates, all at once (one action, one write —
    rule 5). Returns the rates as stored, or raises BadRate."""
    clean = _clean_rates(rates)
    with transaction.atomic():
        _write_rates(consultant_id, clean)
    return rates_of(consultant_id)


def rates_of(consultant_id):
    """{chat, video, audio, booking} in whole rupees a minute, None for a
    channel with no active row."""
    rows = ConsultantService.objects.filter(consultant_id=consultant_id, active=True)
    out = dict.fromkeys(RATE_KEYS)
    for row in rows:
        if row.billing == ServiceBilling.FIXED and row.duration_mins == SLOT_MINUTES:
            out["booking"] = row.price_paise // (100 * SLOT_MINUTES)
        elif row.billing == ServiceBilling.PER_MINUTE:
            for key, mode in RATE_MODES.items():
                if row.mode == mode:
                    out[key] = row.price_paise // 100
    return out


def rates_from_tier(tier):
    """An old client's tier pick as four rates: the band's per-minute rate
    for chat, video and audio; the booking rate the 20-minute slot over 20,
    to the nearest rupee. None if the tier has no active band."""
    bands = {(b.billing, b.duration_mins): b
             for b in PriceBand.objects.filter(active=True, tier=tier)}
    per_minute = bands.get((ServiceBilling.PER_MINUTE, 1))
    slot = bands.get((ServiceBilling.FIXED, SLOT_MINUTES))
    if per_minute is None or slot is None:
        return None

    def clamp(r):
        return max(RATE_MIN_RUPEES, min(RATE_MAX_RUPEES, r))

    rupees = per_minute.price_paise // 100
    booking = _round_to_grid(slot.price_paise // SLOT_MINUTES, 100) // 100
    return {"chat": clamp(rupees), "video": clamp(rupees), "audio": clamp(rupees),
            "booking": clamp(booking)}


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


def _paid_sessions(consultant_ref):
    from apps.chat.models import Session, SessionStatus

    return Session.objects.filter(
        consultant_id=consultant_ref, status=SessionStatus.ENDED, charged_paise__gt=0
    )


def sessions_done_expr(outer_field="profile_id"):
    """How many paid sessions this consultant has given — chat, call and
    video alike, the one `sessions` table both meters write (3 Oct 2026, for
    the milestone badges). A session counts once it ended with a charge:
    declined, expired and never-connected rows have no charge. Bookings are
    not counted, because nothing marks one completed yet."""
    from django.db.models import Count, OuterRef, Subquery
    from django.db.models.functions import Coalesce

    counted = (
        _paid_sessions(OuterRef(outer_field))
        .order_by()
        .values("consultant_id")
        .annotate(n=Count("id"))
        .values("n")[:1]
    )
    return Coalesce(Subquery(counted), 0)


def sessions_done(consultant_id):
    return _paid_sessions(consultant_id).count()


def public_consultants():
    """`consultants_public` (007) as a queryset: the approved rows with the
    profile name joined. The view's own WHERE is the access control — an
    unapproved consultant is invisible, and so is everything but the eleven
    safe columns plus the name."""
    return (
        Consultant.objects.filter(status=ConsultantStatus.APPROVED)
        .annotate(
            name=_name_expr("profile_id"),
            # The profile photo, for the roster card (8 Oct 2026).
            avatar_url=Subquery(
                Profile.objects.filter(id=OuterRef("profile_id")).values("avatar_url")[:1],
                output_field=TextField(),
            ),
            # For the share link, 1namo.com/<username> (11 Oct 2026).
            username=profile_services.username_subquery("profile_id"),
            online=online_expr(),
            busy=busy_expr(),
            sessions_done=sessions_done_expr(),
        )
        # Online first (5 Oct 2026, owner's request), then best rated.
        .order_by(F("online").desc(), F("rating_avg_cache").desc(nulls_last=True), "-created_at")
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


def active_services_for(consultant_ids):
    """`active_services` for many APPROVED consultants in one query:
    {consultant_id: [services]}, each list in the same order."""
    grouped = {}
    rows = ConsultantService.objects.filter(
        consultant_id__in=consultant_ids, active=True
    ).order_by("sort", "duration_mins", "billing")
    for row in rows:
        grouped.setdefault(row.consultant_id, []).append(row)
    return grouped


class BadIntro(Exception):
    """An intro upload that cannot be used. `status` is the HTTP answer."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def set_intro(profile_id, asset_id):
    """Point the consultant's intro at a READY video or image of THEIR OWN
    (11 Oct 2026), or clear it when `asset_id` is None. Someone else's asset
    is a 404, as for avatars, so ids do not leak. Returns {url, kind}."""
    from django.conf import settings

    from apps.media.models import MediaAsset

    if asset_id is None:
        Consultant.objects.filter(profile_id=profile_id).update(intro_url=None, intro_kind=None)
        return {"url": None, "kind": None}
    asset = MediaAsset.objects.filter(pk=asset_id).first()
    if asset is None or str(asset.owner).replace("-", "") != str(profile_id).replace("-", ""):
        raise BadIntro(404, "That upload does not exist.")
    kinds = {MediaAsset.Kind.REEL: "video", MediaAsset.Kind.IMAGE: "image"}
    if asset.kind not in kinds:
        raise BadIntro(400, "The intro must be a video or a photo.")
    if asset.status != MediaAsset.Status.READY:
        raise BadIntro(409, "That upload is not ready yet.")
    url = f"{settings.MEDIA_PUBLIC_BASE_URL.rstrip('/')}/{asset.bucket_key}"
    Consultant.objects.filter(profile_id=profile_id).update(intro_url=url, intro_kind=kinds[asset.kind])
    return {"url": url, "kind": kinds[asset.kind]}


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
    """A closure window (009's check writes these directly; the calendar's
    blocked dates since 15 Oct 2026)."""
    return ConsultantTimeOff.objects.create(
        consultant_id=consultant_id, starts_at=starts_at, ends_at=ends_at, reason=reason
    )


# ── the week, as windows (15 Oct 2026, Rahul) ────────────────────────────────
#
# A Pro sets each day of the week as up to two windows ("9 to 12, 4 to 7");
# a customer books 20 minutes inside one (SLOT_MINUTES). The windows are
# stored as the 20-minute cells they expand to, in the same
# `consultant_availability` table the slots function already reads, so
# booking and the slots subtraction are unchanged. Reading back, runs of
# back-to-back cells are the windows again.

MAX_WINDOWS = 2
# Every Pro's week until they change it (16 Oct 2026, Rahul): 11 am to 2 pm
# and 4 pm to 9 pm, every day.
DEFAULT_WINDOWS = ((time(11, 0), time(14, 0)), (time(16, 0), time(21, 0)))


def default_week():
    return {d: list(DEFAULT_WINDOWS) for d in range(7)}
REFUSAL_WINDOWS = "Each day takes up to two windows, each at least 20 minutes, not overlapping."


def _minutes(t):
    return t.hour * 60 + t.minute


def _at(minutes):
    return time(minutes // 60, minutes % 60)


def week(consultant_id):
    """{weekday (0 = Sunday): [{"from": "09:00", "to": "12:00"}, ...]} for
    every day, empty where closed. Cells that do not run back to back (the
    old six-times grid) read as windows of one slot each."""
    out = {d: [] for d in range(7)}
    rows = (ConsultantAvailability.objects.filter(consultant_id=consultant_id)
            .order_by("weekday", "slot_time").values_list("weekday", "slot_time"))
    for weekday, slot in rows:
        start = _minutes(slot)
        runs = out[weekday]
        if runs and runs[-1][1] == start:
            runs[-1][1] = start + SLOT_MINUTES
        else:
            runs.append([start, start + SLOT_MINUTES])
    return {d: [{"from": _at(a).strftime("%H:%M"), "to": _at(min(b, 24 * 60 - 1)).strftime("%H:%M")}
                for a, b in runs] for d, runs in out.items()}


def set_week(consultant_id, days):
    """The whole week at once: `days` maps weekday (0 = Sunday) to a list of
    (from, to) times. Each window becomes its 20-minute starts — 9:00 to
    12:00 is 9:00, 9:20 … 11:40; a remainder shorter than a slot is not
    offered. Replaces every cell in one transaction. A booking already made
    stands whatever changes."""
    cells = []
    for weekday, windows in days.items():
        if not 0 <= int(weekday) <= 6 or len(windows) > MAX_WINDOWS:
            raise ValueError(REFUSAL_WINDOWS)
        spans = sorted((_minutes(a), _minutes(b)) for a, b in windows)
        for i, (a, b) in enumerate(spans):
            if b - a < SLOT_MINUTES or (i and a < spans[i - 1][1]):
                raise ValueError(REFUSAL_WINDOWS)
            for start in range(a, b - SLOT_MINUTES + 1, SLOT_MINUTES):
                cells.append(ConsultantAvailability(consultant_id=consultant_id, weekday=int(weekday),
                                                    slot_time=_at(start)))
    with transaction.atomic():
        ConsultantAvailability.objects.filter(consultant_id=consultant_id).delete()
        ConsultantAvailability.objects.bulk_create(cells)
    return week(consultant_id)


def blocked_dates(consultant_id):
    """The days off still to come, whole IST days, soonest first."""
    rows = ConsultantTimeOff.objects.filter(consultant_id=consultant_id,
                                            ends_at__gt=timezone.now()).order_by("starts_at")
    return [{"id": str(r.id), "from": r.starts_at.astimezone(IST).date().isoformat(),
             "to": (r.ends_at.astimezone(IST) - timedelta(seconds=1)).date().isoformat(),
             "reason": r.reason or ""} for r in rows]


def block_dates(consultant_id, first, last, reason=None):
    """Closes whole days, `first` to `last` inclusive (IST)."""
    if last < first:
        raise ValueError("The last day is before the first.")
    if first < ist_today():
        raise ValueError("Pick today or a later day.")
    return add_time_off(consultant_id, _combine_ist(first, time.min),
                        _combine_ist(last + timedelta(days=1), time.min), reason or None)


def unblock(consultant_id, time_off_id):
    return ConsultantTimeOff.objects.filter(consultant_id=consultant_id, pk=time_off_id).delete()[0]


# ── the application (007's insert grant + 009 assertion 9's band rule) ───────


def apply(profile_id, *, category, specialization, languages, experience_yrs, bio,
          credentials, tier=None, rates=None, tags=None, degree=None, degree_asset_id=None):
    """One application, one transaction (rule 5): the consultants row — the
    insert grant's columns ONLY; status lands 'pending' and verified False
    because the request shape has no fields for them (009 check assertion 8:
    a consultant cannot approve themselves) — plus the four rate rows.

    `rates` are the applicant's own four numbers (10 Oct 2026), checked by
    the same range as `set_rates`. `tier` is what the application sent
    before that, turned into four rates off the band, so an app still open
    from before the change can apply."""
    if rates is not None:
        clean = _clean_rates(rates)
    else:
        clean = rates_from_tier(tier) if tier is not None else None
        if clean is None:
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
                tags=list(tags or []),
                degree=degree,
                degree_asset_id=degree_asset_id,
            )
            _write_rates(consultant.profile_id, clean)
            # Every new Pro starts with the default week (16 Oct 2026, Rahul).
            set_week(consultant.profile_id, default_week())
    except IntegrityError:
        raise AlreadyApplied(REFUSAL_ALREADY_APPLIED) from None
    return consultant


# ── the booking transaction (012 as amended by 013) ──────────────────────────


def fee_bps_for(consultant_id):
    """Namo's share of a consultation: the console's rate for the
    consultation category, 30% when blank (15 Oct 2026, Rahul; owner's yes)
    — the same for every astrologer. The per-astrologer share built on 13
    Oct is withdrawn; `consultants.fee_bps` stays as an unused column."""
    from apps.market import services as market

    return market.namo_bps("consultation")


def fee_paise(amount_paise, bps=FEE_BPS):
    """`bps` of the amount, rounded like Postgres numeric round (012)."""
    return int((Decimal(amount_paise) * bps / 10000).quantize(
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
    bps = fee_bps_for(consultant_id)
    fee = fee_paise(service.price_paise, bps)

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
                fee_bps=bps,
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


def _refund_row_exists(order_id):
    """Dashless-safe refund lookup: SQLite stores raw-inserted UUIDs without
    dashes, Postgres's uuid type normalises the cast — replace() makes the
    same SQL true on both."""
    with connection.cursor() as cursor:
        cursor.execute(
            "select 1 from ledger where ref_type = 'refund' and "
            "replace(cast(ref_id as text), '-', '') = "
            "replace(cast(%s as text), '-', '') limit 1",
            [str(order_id)],
        )
        return cursor.fetchone() is not None


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
        # 23505 on ledger_one_refund_per_order — the refund row already
        # exists. Two legitimate writers: an app-level retry of this call
        # (the block above unwound), or — on Postgres — the
        # bookings_decline_reverses trigger having already reversed inside
        # the status UPDATE itself. Either way the seeker IS refunded, so
        # report what is true rather than what this call wrote.
        return {"ok": True, "reversed": _refund_row_exists(booking.order_id)}
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


# ── presence (24 Sep 2026) ──────────────────────────────────────────────────


# How stale a heartbeat may be and still count as here. The pro app beats
# every 30s, so ninety seconds forgives two missed beats — a phone that
# switched from wifi to mobile data mid-tap should not go dark.
#
# Long enough that a flaky network does not blink the dot; short enough
# that a closed app stops taking calls before a seeker has typed their
# question. Nothing writes "offline": going dark is the ABSENCE of a
# write, which is the only kind of offline a dead battery can produce.
PRESENCE_GRACE_SECONDS = 90


def _cutoff(now=None):
    from django.utils import timezone

    return (now or timezone.now()) - timedelta(seconds=PRESENCE_GRACE_SECONDS)


def busy_expr(now=None):
    """Annotation: ringing for somebody or in a session right now (5 Oct
    2026). Shown as "Busy" beside the name; a call to them waits and
    retries instead of failing. Read live from `sessions`, never stored —
    a busy flag on the consultant row is one more thing to forget to clear."""
    from django.db.models import Exists, OuterRef

    from apps.chat.models import Session
    from apps.chat.services import RING_SECONDS

    stamp = now or timezone.now()
    return Exists(
        Session.objects.filter(consultant_id=OuterRef("profile_id")).filter(
            Q(status=Session.Status.LIVE)
            | Q(status=Session.Status.REQUESTED,
                requested_at__gte=stamp - timedelta(seconds=RING_SECONDS))
        )
    )


def online_expr(now=None):
    """Annotation: is this consultant takeable RIGHT NOW?

    THE SWITCH ALONE, since 6 Oct 2026 (owner's call). It was the switch AND
    a heartbeat in the last 90 seconds, and a phone web app stops beating
    the moment it is locked or backgrounded — so every consultant showed
    offline unless they stared at the app. A request now wakes their phone
    by push (apps/notifications/push.py), so the app need not be open.
    The guard against somebody asleep with the switch on is the missed-
    call rule: three rings in a row nobody answered turn the switch off
    (apps/chat/services.py, `_missed_check`).
    """
    return Case(
        When(accepting_now=True, then=Value(True)),
        default=Value(False),
        output_field=BooleanField(),
    )


def is_online(consultant_id, now=None):
    """One consultant, for the refusal at the top of a session request."""
    return Consultant.objects.filter(
        profile_id=consultant_id,
        status=ConsultantStatus.APPROVED,
        accepting_now=True,
    ).exists()


def touch_presence(consultant_id, accepting=None, now=None):
    """The pro app checking in, and optionally flipping the switch.

    One endpoint for both because they travel together: every heartbeat
    carries the toggle's current state, so a toggle that failed to save
    corrects itself on the next beat rather than leaving the consultant
    invisible — or worse, visible and absent — until they notice.

    Returns the state as the server now sees it, which is what the pro
    app renders. It never renders its own optimistic copy: the dot a
    seeker sees is this row, and two sources of truth for "am I online"
    is how a consultant sits waiting for calls that were never offered.
    """
    from django.utils import timezone

    stamp = now or timezone.now()
    fields = {"last_seen_at": stamp}
    if accepting is not None:
        fields["accepting_now"] = bool(accepting)

    updated = Consultant.objects.filter(
        profile_id=consultant_id, status=ConsultantStatus.APPROVED
    ).update(**fields)
    if not updated:
        return None

    row = Consultant.objects.filter(profile_id=consultant_id).values(
        "accepting_now", "last_seen_at"
    ).first()
    return {
        "accepting_now": row["accepting_now"],
        "online": bool(row["accepting_now"]),  # the switch alone (6 Oct 2026)
        "last_seen_at": row["last_seen_at"].isoformat(),
        "grace_seconds": PRESENCE_GRACE_SECONDS,
    }


def go_offline(consultant_id):
    """The switch, off. Used by the toggle and by signing out of the pro
    app — leaving `accepting_now` true on a logout would put a green dot
    on somebody who has gone home."""
    return Consultant.objects.filter(profile_id=consultant_id).update(
        accepting_now=False
    ) == 1


def is_approved(profile_id):
    """Does this person have an approved practice?

    Lives here rather than being imported from `apps.content.gateway`,
    where the same question is answered for the publish gate. That one is
    the content module's private view of the roster; a third module
    reaching into it would make content a dependency of everything that
    ever needs to know what a consultant is.
    """
    return Consultant.objects.filter(
        profile_id=profile_id, status=ConsultantStatus.APPROVED
    ).exists()
