"""Taking events in, and answering questions from them."""

import logging
import re
import uuid

from django.db import connection
from django.db.models import Count
from django.utils import timezone

from .models import Attribution, Event, Source

logger = logging.getLogger("apps.analytics")

# A batch is capped so one client cannot post a megabyte of rows.
MAX_BATCH = 50
NAME_RE = re.compile(r"^[a-z][a-z0-9_.]{1,63}$")

# `/consult/8f3e…` becomes `/consult/:id`. An event carrying a real id
# names a specific consultant every time somebody opens their profile,
# which turns a page-view counter into a record of who looked at whom.
_UUID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I
)
_NUMERIC = re.compile(r"/\d+(?=/|$)")


def normalise_path(path):
    if not path:
        return ""
    path = path.split("?")[0].split("#/")[-1]
    if not path.startswith("/"):
        path = "/" + path
    path = _UUID.sub(":id", path)
    path = _NUMERIC.sub("/:n", path)
    return path[:160]


def record_batch(rows, profile_id=None):
    """Write a batch of events. Returns how many were kept.

    Anything malformed is DROPPED rather than refused: a client that keeps
    retrying a bad batch is worse than a lost event, and analytics must
    never be able to break a screen. Everything dropped is counted in the
    log.
    """
    kept, dropped = [], 0
    now = timezone.now()
    for row in rows[:MAX_BATCH]:
        name = (row.get("name") or "").strip().lower()
        if not NAME_RE.match(name):
            dropped += 1
            continue
        try:
            visit = uuid.UUID(str(row.get("visit_id")))
        except (ValueError, TypeError, AttributeError):
            dropped += 1
            continue
        props = row.get("props")
        if not isinstance(props, dict):
            props = {}
        kept.append(Event(
            profile_id=profile_id,
            visit_id=visit,
            name=name[:64],
            path=normalise_path(row.get("path")),
            # Values only, no nested structures: props exist to hold a
            # count or a flag, and a nested blob is a place for something
            # the seeker typed to end up by accident.
            props={k: v for k, v in list(props.items())[:12]
                   if isinstance(v, (str, int, float, bool)) and len(str(v)) <= 120},
            platform=str(row.get("platform") or "")[:16],
            app=str(row.get("app") or "")[:16],
            created_at=now,
        ))
    if kept:
        Event.objects.bulk_create(kept, batch_size=MAX_BATCH)
    if dropped:
        logger.info("[analytics] dropped %s malformed of %s", dropped, len(rows))
    return len(kept)


def remember_first_touch(profile_id, source, referrer_id=None, campaign="", landed_on=""):
    """First touch only. `get_or_create` is the whole rule — a second call
    for the same profile changes nothing, which is what makes "how many
    came by referral" answerable a year later."""
    attribution, created = Attribution.objects.get_or_create(
        profile_id=profile_id,
        defaults={
            "source": source or Source.ORGANIC,
            "referrer_id": referrer_id,
            "campaign": (campaign or "")[:64],
            "landed_on": normalise_path(landed_on),
        },
    )
    return attribution, created


# ── the dashboard's questions ────────────────────────────────────────────────


def _since(days):
    return timezone.now() - timezone.timedelta(days=days)


def top_paths(days=7, limit=15):
    """Which screens people actually open."""
    return list(
        Event.objects.filter(name="page_view", created_at__gte=_since(days))
        .values("path")
        .annotate(views=Count("id"), visits=Count("visit_id", distinct=True))
        .order_by("-views")[:limit]
    )


def top_features(days=7, limit=15):
    """What they do once they are there — every event that is not a page
    view, which is the definition that needs no maintenance as features are
    added."""
    return list(
        Event.objects.filter(created_at__gte=_since(days))
        .exclude(name="page_view")
        .values("name")
        .annotate(times=Count("id"), people=Count("visit_id", distinct=True))
        .order_by("-times")[:limit]
    )


def traffic(days=7):
    return {
        "events": Event.objects.filter(created_at__gte=_since(days)).count(),
        "visits": Event.objects.filter(created_at__gte=_since(days))
        .values("visit_id").distinct().count(),
        "signed_in": Event.objects.filter(
            created_at__gte=_since(days), profile_id__isnull=False
        ).values("profile_id").distinct().count(),
    }


def acquisition(days=30):
    """Referral against organic — the question as it was asked."""
    rows = (
        Attribution.objects.filter(created_at__gte=_since(days))
        .values("source").annotate(people=Count("profile_id")).order_by("-people")
    )
    counted = {r["source"]: r["people"] for r in rows}
    total = sum(counted.values())
    return {"total": total, "by_source": counted}


def money(days=30):
    """Sales, from the tables that already hold them. Nothing here is an
    event: an order is a fact in `orders`, and counting a "purchase" event
    instead would mean a blocked analytics request could lose a sale from
    the numbers."""
    with connection.cursor() as cursor:
        cursor.execute(
            "select count(*), coalesce(sum(total_paise), 0)"
            " from orders where status = 'paid' and created_at >= %s",
            [_since(days)],
        )
        orders, gross = cursor.fetchone()
        cursor.execute(
            "select coalesce(sum(delta_paise), 0) from ledger"
            " where delta_paise > 0 and ref_type = 'payment' and created_at >= %s",
            [_since(days)],
        )
        (topped_up,) = cursor.fetchone()
        cursor.execute(
            "select count(*) from profiles where created_at >= %s", [_since(days)]
        )
        (signups,) = cursor.fetchone()
    return {
        "orders": orders,
        "gross_paise": gross,
        "topped_up_paise": topped_up,
        "signups": signups,
        # Formatted HERE, not in the template. The first cut chained
        # `|floatformat:0|divisibleby:1` and rendered "₹True" — Django
        # template filters compose in ways that fail silently, and money
        # is the last thing that should be formatted by guesswork.
        "gross": rupees(gross),
        "topped_up": rupees(topped_up),
    }


def rupees(paise):
    if not paise:
        return "₹0"
    return f"₹{paise / 100:,.2f}".replace(".00", "")


# ── the dashboard, second cut: calendar periods, comparisons, charts ─────────
#
# The first cut offered rolling 7/30/90-day windows and plain tables, and
# answered almost none of the questions anybody asks out loud. "How did
# this month go against last month" is not two overlapping rolling windows,
# and "is viewership climbing" is a shape, not a number.


def _bucket_sql(column, grain):
    """Truncate a timestamp to an IST day or month, in either dialect.

    The shift is applied to the VALUE rather than to the window boundaries,
    so a sale at 11pm Delhi time on the 31st lands in that month and not
    the next one. IST has no DST, which is what makes a constant correct.

    Two dialects because production is Postgres and the tests are SQLite,
    and a query that only runs on one of them is a query with no test.
    `date_trunc` does not exist in SQLite; `strftime` does not exist in
    Postgres.
    """
    if connection.vendor == "postgresql":
        unit = "month" if grain == "month" else "day"
        return f"date_trunc('{unit}', {column} + interval '5 hours 30 minutes')"
    shift = f"datetime({column}, '+5 hours', '+30 minutes')"
    pattern = "%Y-%m-01" if grain == "month" else "%Y-%m-%d"
    return f"strftime('{pattern}', {shift})"


def _as_date(value):
    """Postgres answers a timestamp, SQLite a string. One date either way."""
    if hasattr(value, "date"):
        return value.date()
    if isinstance(value, str):
        from datetime import date

        return date.fromisoformat(value[:10])
    return value


def _fill(rows, window):
    """Every bucket in the window, including the empty ones.

    A chart that skips days with no sales draws a line through the gap and
    makes a quiet week look like a busy one.
    """
    from .periods import IST

    grain = window["grain"]
    found = {r[0]: r[1] for r in rows}
    labels, values = [], []
    cursor = window["start"]
    while cursor < window["end"]:
        key = cursor.date()
        labels.append(cursor.strftime("%b" if grain == "month" else "%-d %b"))
        values.append(found.get(key, 0))
        if grain == "month":
            month = cursor.month
            cursor = cursor.replace(
                year=cursor.year + (1 if month == 12 else 0),
                month=1 if month == 12 else month + 1,
            )
        else:
            cursor = cursor + timezone.timedelta(days=1)
    return {"labels": labels, "values": values}


def _series(sql, window, params=()):
    with connection.cursor() as cursor:
        cursor.execute(sql, [*params, window["start"], window["end"]])
        rows = [(_as_date(r[0]), r[1] or 0) for r in cursor.fetchall()]
    return _fill(rows, window)


def _scalar(sql, start, end, params=()):
    with connection.cursor() as cursor:
        cursor.execute(sql, [*params, start, end])
        row = cursor.fetchone()
    return (row[0] or 0) if row else 0


REVENUE_SQL = (
    "select coalesce(sum(total_paise), 0) from orders"
    " where status = 'paid' and created_at >= %s and created_at < %s"
)
ORDERS_SQL = (
    "select count(*) from orders"
    " where status = 'paid' and created_at >= %s and created_at < %s"
)
SIGNUPS_SQL = "select count(*) from profiles where created_at >= %s and created_at < %s"
TOPUP_SQL = (
    "select coalesce(sum(delta_paise), 0) from ledger"
    " where delta_paise > 0 and ref_type = 'payment'"
    " and created_at >= %s and created_at < %s"
)


def headline(window):
    """The cards: this period, the one before, and the change between.

    Every figure carries its comparison. A number on its own tells you
    almost nothing — ₹4,986 is either a good month or a catastrophe
    depending on what last month was.
    """
    from .periods import change

    def pair(sql, params=()):
        now = _scalar(sql, window["start"], window["end"], params)
        before = _scalar(sql, window["previous_start"], window["previous_end"], params)
        return {"now": now, "before": before, "change": change(now, before)}

    visits_sql = (
        "select count(distinct visit_id) from events"
        " where created_at >= %s and created_at < %s"
    )
    views_sql = (
        "select count(*) from events where name = 'page_view'"
        " and created_at >= %s and created_at < %s"
    )
    ai_sql = (
        "select count(*) from events where name = 'ai_question'"
        " and created_at >= %s and created_at < %s"
    )

    revenue = pair(REVENUE_SQL)
    topups = pair(TOPUP_SQL)
    return {
        "revenue": {**revenue, "now_text": rupees(revenue["now"]),
                    "before_text": rupees(revenue["before"])},
        "orders": pair(ORDERS_SQL),
        "signups": pair(SIGNUPS_SQL),
        "visits": pair(visits_sql),
        "views": pair(views_sql),
        "ai_questions": pair(ai_sql),
        "topups": {**topups, "now_text": rupees(topups["now"]),
                   "before_text": rupees(topups["before"])},
    }


def revenue_series(window):
    """Money over time, in RUPEES — the chart's axis is read by a person,
    and paise put five zeroes on every label."""
    bucket = _bucket_sql("created_at", window["grain"])
    series = _series(
        f"select {bucket} as b, coalesce(sum(total_paise), 0) from orders"
        " where status = 'paid' and created_at >= %s and created_at < %s"
        " group by b order by b",
        window,
    )
    return {"labels": series["labels"],
            "values": [round(v / 100, 2) for v in series["values"]]}


def traffic_series(window):
    """Views and visits together: the gap between them is whether people
    are going deeper or bouncing, which neither line says alone."""
    bucket = _bucket_sql("created_at", window["grain"])
    views = _series(
        f"select {bucket} as b, count(*) from events where name = 'page_view'"
        " and created_at >= %s and created_at < %s group by b order by b",
        window,
    )
    visits = _series(
        f"select {bucket} as b, count(distinct visit_id) from events"
        " where created_at >= %s and created_at < %s group by b order by b",
        window,
    )
    return {"labels": views["labels"], "views": views["values"],
            "visits": visits["values"]}


def signup_series(window):
    bucket = _bucket_sql("created_at", window["grain"])
    return _series(
        f"select {bucket} as b, count(*) from profiles"
        " where created_at >= %s and created_at < %s group by b order by b",
        window,
    )


def revenue_mix(window):
    """What the money was actually for — sessions, products, courses.

    From `order_items`, because one order can hold a gemstone and a chat
    hold at once and the order total alone cannot tell them apart.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "select i.item_type, coalesce(sum(i.unit_price_paise * i.qty), 0)"
            " from order_items i join orders o on o.id = i.order_id"
            " where o.status = 'paid' and o.created_at >= %s and o.created_at < %s"
            " group by i.item_type order by 2 desc",
            [window["start"], window["end"]],
        )
        rows = cursor.fetchall()
    return {
        "labels": [r[0] for r in rows],
        "values": [round((r[1] or 0) / 100, 2) for r in rows],
    }


def acquisition_mix(window):
    rows = (
        Attribution.objects
        .filter(created_at__gte=window["start"], created_at__lt=window["end"])
        .values("source").annotate(people=Count("profile_id")).order_by("-people")
    )
    return {"labels": [r["source"] for r in rows],
            "values": [r["people"] for r in rows]}


def paths_in(window, limit=12):
    return list(
        Event.objects.filter(
            name="page_view",
            created_at__gte=window["start"], created_at__lt=window["end"],
        )
        .values("path")
        .annotate(views=Count("id"), visits=Count("visit_id", distinct=True))
        .order_by("-views")[:limit]
    )


def features_in(window, limit=12):
    return list(
        Event.objects.filter(
            created_at__gte=window["start"], created_at__lt=window["end"]
        )
        .exclude(name="page_view")
        .values("name")
        .annotate(times=Count("id"), people=Count("visit_id", distinct=True))
        .order_by("-times")[:limit]
    )
