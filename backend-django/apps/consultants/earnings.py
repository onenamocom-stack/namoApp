"""What a consultant has earned, by period (payouts P1, 3 Oct 2026).

Read-only. Every figure is a sum over `earnings_ledger`; nothing here writes,
and nothing here knows about payouts yet — those are P3, and they will read
the same periods this module defines, so the Earnings screen and the money
that leaves on the 7th can never disagree.

**Periods are IST calendar months and Indian financial years** (1 April to
31 March), because a consultant is paid by month and files tax by year.

**When a row counts.** A row counts at its *effective* time:

- most rows when they were written (a chat ends, cashback matures);
- a booking row at the later of when it was written and when the session
  starts. A session booked on 30 September for 15 October is October's
  earning — paying it before it happens would pay for work not yet done.
  A decline before the session writes its reversal with the same booking,
  so the two land in the same month and cancel there.

Rows whose effective time is still ahead are *upcoming*: booked, not yet
earned. They are reported apart and kept out of every period total.

**Sources** are derived, not stored, so old rows classify too: anything
negative is a reversal; a row tied to a booking is a booking; the shop's 10%
commission is written as "Referral cashback · …"; everything else is
metered chat, call or video.
"""

from datetime import date, datetime, timedelta

from django.db.models import Case, CharField, Count, Sum, Value, When
from django.db.models.functions import Coalesce, Greatest
from django.utils import timezone

from .models import EarningsLedger
from .services import IST

RANGES = ("this_month", "last_month", "fy", "last_fy", "lifetime", "custom")
SOURCES = ("sessions", "bookings", "shop", "reversals")
PAGE = 50
PAGE_MAX = 200
# Paid on this day of the month after the period (owner's call, 3 Oct 2026).
PAYOUT_DAY = 7


class BadRange(ValueError):
    """A period the API cannot read. The message is shown to the caller."""


def ist_today(now=None):
    return (now or timezone.now()).astimezone(IST).date()


def _midnight(day):
    """00:00 IST on `day`, as an aware datetime."""
    return datetime(day.year, day.month, day.day, tzinfo=IST)


def _month_start(day, shift=0):
    index = day.year * 12 + (day.month - 1) + shift
    return date(index // 12, index % 12 + 1, 1)


def _fy_start(day):
    return date(day.year if day.month >= 4 else day.year - 1, 4, 1)


def period(range_key, today, start=None, end=None):
    """(first day, day after the last) in IST, or (None, None) for lifetime.

    `start` and `end` are inclusive ISO dates, for `custom` only."""
    if range_key == "this_month":
        first = _month_start(today)
        return first, _month_start(today, 1)
    if range_key == "last_month":
        return _month_start(today, -1), _month_start(today)
    if range_key == "fy":
        first = _fy_start(today)
        return first, date(first.year + 1, 4, 1)
    if range_key == "last_fy":
        first = _fy_start(today)
        return date(first.year - 1, 4, 1), first
    if range_key == "lifetime":
        return None, None
    if range_key == "custom":
        try:
            lo = date.fromisoformat(start or "")
            hi = date.fromisoformat(end or "")
        except ValueError:
            raise BadRange("Give both dates as YYYY-MM-DD.") from None
        if lo > hi:
            raise BadRange("The start date is after the end date.")
        return lo, hi + timedelta(days=1)
    raise BadRange(f"Unknown range. Use one of: {', '.join(RANGES)}.")


def _rows(consultant_id):
    return EarningsLedger.objects.filter(consultant_id=consultant_id).annotate(
        effective_at=Greatest("created_at", Coalesce("booking__starts_at", "created_at")),
        source=Case(
            When(net_paise__lt=0, then=Value("reversals")),
            When(booking__isnull=False, then=Value("bookings")),
            When(kind__startswith="Referral cashback", then=Value("shop")),
            default=Value("sessions"),
            output_field=CharField(),
        ),
    )


def _in_period(qs, lo, hi, now):
    qs = qs.filter(effective_at__lte=now)
    if lo is not None:
        qs = qs.filter(effective_at__gte=_midnight(lo))
    if hi is not None:
        qs = qs.filter(effective_at__lt=_midnight(hi))
    return qs


def summary(consultant_id, range_key, start=None, end=None, now=None):
    now = now or timezone.now()
    today = ist_today(now)
    lo, hi = period(range_key, today, start, end)
    base = _rows(consultant_id)

    totals = {s: {"source": s, "gross_paise": 0, "fee_paise": 0, "net_paise": 0, "count": 0} for s in SOURCES}
    for row in (
        _in_period(base, lo, hi, now)
        .values("source")
        .annotate(gross=Sum("gross_paise"), fee=Sum("fee_paise"), net=Sum("net_paise"), n=Count("id"))
    ):
        totals[row["source"]].update(
            gross_paise=row["gross"], fee_paise=row["fee"], net_paise=row["net"], count=row["n"]
        )
    by_source = [totals[s] for s in SOURCES]

    upcoming = base.filter(effective_at__gt=now).aggregate(s=Sum("net_paise"))["s"] or 0

    # The last seven IST days, oldest first, whatever the range.
    week_lo = today - timedelta(days=6)
    daily = {week_lo + timedelta(days=i): 0 for i in range(7)}
    for at, net in _in_period(base, week_lo, today + timedelta(days=1), now).values_list(
        "effective_at", "net_paise"
    ):
        daily[at.astimezone(IST).date()] += net

    pays_on = None
    if range_key in ("this_month", "last_month"):
        pays_on = hi.replace(day=PAYOUT_DAY)

    return {
        "range": range_key,
        "from": lo.isoformat() if lo else None,
        "to": (hi - timedelta(days=1)).isoformat() if hi else None,
        "pays_on": pays_on.isoformat() if pays_on else None,
        "gross_paise": sum(t["gross_paise"] for t in by_source),
        "fee_paise": sum(t["fee_paise"] for t in by_source),
        "net_paise": sum(t["net_paise"] for t in by_source),
        "count": sum(t["count"] for t in by_source),
        "by_source": by_source,
        "upcoming_paise": upcoming,
        "last_7_days": [{"date": d.isoformat(), "net_paise": v} for d, v in daily.items()],
    }


def rows(consultant_id, range_key, start=None, end=None, offset=0, limit=PAGE, now=None):
    """The rows behind a summary, newest first, a page at a time."""
    now = now or timezone.now()
    lo, hi = period(range_key, ist_today(now), start, end)
    limit = max(1, min(int(limit), PAGE_MAX))
    offset = max(0, int(offset))
    qs = _in_period(_rows(consultant_id), lo, hi, now).order_by("-effective_at", "-id")
    page = list(qs[offset : offset + limit + 1])
    return {
        "rows": [
            {
                "id": str(r.id),
                "booking_id": str(r.booking_id) if r.booking_id else None,
                "gross_paise": r.gross_paise,
                "fee_bps": r.fee_bps,
                "fee_paise": r.fee_paise,
                "net_paise": r.net_paise,
                "kind": r.kind,
                "source": r.source,
                "created_at": r.created_at,
                "effective_at": r.effective_at,
            }
            for r in page[:limit]
        ],
        "next_offset": offset + limit if len(page) > limit else None,
    }
