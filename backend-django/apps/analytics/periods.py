"""Named windows of time, and the window before each one.

The dashboard's first version offered "last 7 / 30 / 90 days", which
answers almost none of the questions anybody actually asks. "How did this
month go" is not "the last 30 days": a rolling window on the 3rd of the
month is mostly last month, and comparing two rolling windows compares two
things that overlap.

So every period here is a CALENDAR period, and every one knows what it
should be compared against:

  this month   -> last month
  last month   -> the month before
  this year    -> last year
  last year    -> the year before
  last 7 / 30  -> the 7 / 30 before that

IST throughout. A shop day ends at midnight in Delhi, not in UTC, and a
sale at 11pm on the 31st belongs to that month (docs/02-TRD.md §10).
"""

from datetime import datetime, time, timedelta, timezone as dt_timezone

from django.utils import timezone

IST = dt_timezone(timedelta(hours=5, minutes=30))

CHOICES = (
    ("this_month", "This month"),
    ("last_month", "Last month"),
    ("this_year", "This year"),
    ("last_year", "Last year"),
    ("last_7", "Last 7 days"),
    ("last_30", "Last 30 days"),
)


def _ist_now():
    return timezone.now().astimezone(IST)


def _start_of_day(moment):
    return datetime.combine(moment.date(), time.min, tzinfo=IST)


def _month_start(year, month):
    return datetime(year, month, 1, tzinfo=IST)


def _add_month(moment, months):
    month = moment.month - 1 + months
    return _month_start(moment.year + month // 12, month % 12 + 1)


def resolve(key):
    """-> {key, label, start, end, previous_start, previous_end, grain}

    `end` is exclusive everywhere, which is what stops a row landing in two
    buckets on a boundary.

    `grain` is how the series should be bucketed. A year of daily bars is
    365 columns nobody can read; a month of monthly bars is one column.
    """
    now = _ist_now()
    if key == "last_month":
        start = _add_month(_month_start(now.year, now.month), -1)
        end = _month_start(now.year, now.month)
        return _window(key, "Last month", start, end, _add_month(start, -1), start, "day")
    if key == "this_year":
        start = _month_start(now.year, 1)
        end = _month_start(now.year + 1, 1)
        return _window(key, "This year", start, end,
                       _month_start(now.year - 1, 1), start, "month")
    if key == "last_year":
        start = _month_start(now.year - 1, 1)
        end = _month_start(now.year, 1)
        return _window(key, "Last year", start, end,
                       _month_start(now.year - 2, 1), start, "month")
    if key in ("last_7", "last_30"):
        days = 7 if key == "last_7" else 30
        end = _start_of_day(now) + timedelta(days=1)
        start = end - timedelta(days=days)
        return _window(key, f"Last {days} days", start, end,
                       start - timedelta(days=days), start, "day")

    # Default, and the one most often wanted.
    start = _month_start(now.year, now.month)
    end = _add_month(start, 1)
    return _window("this_month", "This month", start, end,
                   _add_month(start, -1), start, "day")


def _window(key, label, start, end, previous_start, previous_end, grain):
    return {
        "key": key, "label": label,
        "start": start, "end": end,
        "previous_start": previous_start, "previous_end": previous_end,
        "grain": grain,
        # A month in progress compared against a whole previous month reads
        # as a collapse every 1st of the month. Said out loud rather than
        # hidden, because the alternative is somebody panicking at 9am.
        "in_progress": end > _ist_now(),
    }


def change(current, previous):
    """Percent change, or None when there is nothing to compare against.

    Zero to anything is not "infinity percent" and must not render as one —
    it is a first, and the dashboard says so.
    """
    if previous in (None, 0):
        return None
    return round((current - previous) * 100.0 / previous, 1)
