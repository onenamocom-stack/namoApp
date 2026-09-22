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
