"""Astro services — the rules of the `astro` Edge Function
(backend/functions/astro/index.ts) re-expressed in Django, against the same
astro_cache table with the same cache-key construction.

What is replicated from the edge function, call for call:

- RECKONING (ayanamsha/house_system/node_type) merged into every outbound
  body; the panchang computed at the Ujjain anchor for everybody.
- Cache keys: `panchang:<date>`, `chart:<user id>:<birth digest>`. The
  digest is SHA-256 over the same six birth columns joined the way the
  function joined them.

What is new since the function (22 Sep 2026):

- The daily reading is computed from the reader's OWN birth again, under
  `horoscope:<user id>:<birth digest>:<date>` (docs/05 §4.10). This replaces
  the twelve canonical births of 7 Sep, whose readings described nobody
  (docs/02-TRD.md §8).
- Matching (`match:<digest>:<digest>`) and muhurat
  (`muhurat:<purpose>:<lat>:<lng>:<zone>:<month>`, and `muhurat-me:` with the
  user and their digest in front when it is judged against their chart).
- No TTL, no invalidation: the key carries every input, so a change of any
  input misses on its own. The date clamp (yesterday/today/tomorrow only)
  is the only freshness boundary, exactly as in the function.
- Access parity: geo and panchang answer signed-out callers (verify_jwt on
  but the anon key passes); chart and horoscope require a real user and read
  birth details from the caller's own profiles row — the client sends
  nothing that decides the answer (rule 3).

Trust boundary: astro_cache stays service-role-only. In Django that means
only this module's service layer reads or writes it, and endpoints return
computed payloads, never raw rows.
"""

import calendar
import hashlib
import logging
import time
from datetime import date, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from .models import AstroCache
from .providers import FreeAstroApiProvider, MockProvider

logger = logging.getLogger("apps.astro")

# Settled in docs/02-TRD.md §8. Passed on every upstream call, never defaulted.
RECKONING = {"ayanamsha": "lahiri", "house_system": "whole_sign", "node_type": "mean"}

# WHERE THE PANCHANG IS COMPUTED, FOR EVERYBODY — Ujjain, chosen 4 Sep 2026;
# the classical zero-longitude of Indian astronomy. One anchor means one
# upstream request a day for the entire user base.
PANCHANG_ANCHOR = {"lat": 23.1765, "lng": 75.7885, "zone": "Asia/Kolkata", "city": "Ujjain"}

# The vendor's six muhurat purposes. Anything else is refused before a call.
PURPOSES = (
    "general_work", "vehicle_purchase", "property_purchase",
    "griha_pravesh", "namkaran", "mundan",
)

# How many months ahead a muhurat can be searched: this one and the next two.
# The same idea as the date clamp — only what a screen asks for is worth quota.
MUHURAT_MONTHS_AHEAD = 2


class ProviderNotConfigured(Exception):
    """FREE_ASTRO_API_KEY is unset while the real provider is selected — the
    edge function's 500 'upstream' "Charts are not available right now." case."""


def get_provider():
    """The provider for this process: real when ASTRO_PROVIDER says so and
    the key exists, mock otherwise (dev and tests)."""
    if settings.ASTRO_PROVIDER == "freeastroapi":
        if not settings.FREE_ASTRO_API_KEY:
            raise ProviderNotConfigured("FREE_ASTRO_API_KEY is not set")
        return FreeAstroApiProvider(
            settings.FREE_ASTRO_API_KEY, timeout=settings.ASTRO_TIMEOUT_SECONDS
        )
    return MockProvider()


# ── dates ────────────────────────────────────────────────────────────────────

def _utcnow():
    return timezone.now()


def ist_today():
    """Today as YYYY-MM-DD in IST — the only calendar this product has
    (docs/02-TRD.md §10). IST has no DST, so the shift is a constant."""
    return (_utcnow() + timedelta(hours=5, minutes=30)).date().isoformat()


def allowed_date(value):
    """Yesterday, today, tomorrow — the only dates any screen asks for, and
    therefore the only dates worth spending quota on. None/absent resolves
    to today; anything else is None (the view's 400)."""
    today = date.fromisoformat(ist_today())
    around = {(today + timedelta(days=d)).isoformat() for d in (-1, 0, 1)}
    if value in (None, ""):
        return ist_today()
    if isinstance(value, str) and value in around:
        return value
    return None


def allowed_month(value):
    """`YYYY-MM` for this IST month or one of the next two; absent means this
    month. Anything else is None (the view's 400)."""
    today = date.fromisoformat(ist_today())
    months = []
    year, month = today.year, today.month
    for _ in range(MUHURAT_MONTHS_AHEAD + 1):
        months.append(f"{year:04d}-{month:02d}")
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    if value in (None, ""):
        return months[0]
    return value if value in months else None


def month_range(month_string):
    """The first and last day of a `YYYY-MM`, as the vendor's inclusive
    start_date/end_date. A whole month at most 31 days, inside its limit."""
    year, month = (int(part) for part in month_string.split("-"))
    last = calendar.monthrange(year, month)[1]
    return f"{month_string}-01", f"{month_string}-{last:02d}"


def date_parts(date_string):
    """A date split the way the upstream body wants it: noon, because the
    endpoint reports the sunrise-to-sunrise day and noon is unambiguously
    inside the day you named."""
    year, month, day = (int(part) for part in date_string.split("-"))
    return {"year": year, "month": month, "day": day, "hour": 12, "minute": 0}


# ── births ───────────────────────────────────────────────────────────────────

def _js_str(value):
    """The way JavaScript's String() renders the values Postgres returns, so
    the digest matches the edge function's byte for byte: null -> "null",
    booleans lowercase, integral numbers without a trailing ".0"."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def birth_digest(birth):
    """Short digest of everything about a birth that moves a chart — half
    the chart cache key. A corrected birth time produces a different key and
    therefore a miss; nothing cached can be stale, only unused."""
    material = "|".join(
        _js_str(birth[field])
        for field in ("birth_date", "birth_time", "birth_time_known", "birth_lat", "birth_lon", "birth_zone")
    )
    return hashlib.sha256(material.encode()).digest()[:8].hex()


def birth_body(birth):
    """Birth details as the upstream body wants them. `birth_time` is NULL
    when the person does not know it and noon is substituted — planets
    survive a rough time, the ascendant does not, so the caller is told
    time_known=false and the screens suppress the houses."""
    year, month, day = str(birth["birth_date"]).split("-")
    if birth["birth_time_known"] and birth["birth_time"]:
        hour, minute = str(birth["birth_time"]).split(":")[:2]
    else:
        hour, minute = "12", "0"
    return {
        "year": int(year), "month": int(month), "day": int(day),
        "hour": int(hour), "minute": int(minute),
        "lat": float(birth["birth_lat"]),
        "lng": float(birth["birth_lon"]),
        # The birth PLACE's zone, stored at signup — never today's offset.
        "tz_str": birth["birth_zone"] or "Asia/Kolkata",
        **RECKONING,
    }


def time_known(birth):
    return bool(birth["birth_time_known"] and birth["birth_time"])


def moon_sign(chart_payload):
    """The Moon's sign off a chart payload — janma rashi, the bucket a daily
    reading is chosen by."""
    for planet in chart_payload.get("planets", []):
        if planet.get("name") == "Moon":
            return planet.get("sign")
    return None


def get_birth_details(user_id):
    """The caller's own birth row — the profile module (9) owns the table
    now, and this is the seam astro always read it through: same six
    columns, same None-when-absent answer, same rule that a query ERROR
    propagates so the view never conflates a failed read with an absent row
    (that conflation once sent a working consultant to a signup form —
    index.ts carries the same warning)."""
    from apps.profiles import services as profile_services

    return profile_services.get_birth_details(user_id)


# ── the memo ─────────────────────────────────────────────────────────────────

_LOCK_TIMEOUT_SECONDS = 60
_LOCK_WAIT_SECONDS = 3.0
_LOCK_POLL_INTERVAL = 0.05


def memo(cache_key, compute):
    """Read-through against astro_cache, with single-flight so two
    simultaneous misses for one key cost ONE upstream call.

    A hit needs no freshness test — the key carries every input. A miss
    takes the per-key lock (Django cache: atomic add on every backend), the
    winner computes and writes through; the loser polls for the winner's row
    rather than calling upstream a second time. The write is unique-key safe:
    a race lost at the primary key reads the winner's row instead (the same
    catch-IntegrityError-read-winner pattern as apps.reactions), so the row
    count never drifts.

    Cache write failure is NOT a request failure — the caller still gets a
    correct answer — but it is logged: the only symptom otherwise is every
    call missing, which spends the month's quota while looking healthy.
    Returns (payload, cached).
    """
    try:
        row = AstroCache.objects.filter(key=cache_key).first()
    except Exception:
        # A broken cache reads as a permanent miss and would silently spend
        # the quota; say so, then recompute (the right answer to both cases).
        logger.exception("astro cache read failed, recomputing: %s", cache_key)
        row = None
    if row is not None:
        return row.payload, True

    lock_key = f"astro:lock:{cache_key}"
    if not cache.add(lock_key, "1", timeout=_LOCK_TIMEOUT_SECONDS):
        # Another request is computing this key right now. Wait for its row
        # instead of doubling the upstream call.
        deadline = time.monotonic() + _LOCK_WAIT_SECONDS
        while time.monotonic() < deadline:
            row = AstroCache.objects.filter(key=cache_key).first()
            if row is not None:
                return row.payload, True
            time.sleep(_LOCK_POLL_INTERVAL)

    try:
        try:
            row = AstroCache.objects.filter(key=cache_key).first()
        except Exception:
            logger.exception("astro cache read failed, recomputing: %s", cache_key)
            row = None
        if row is not None:
            return row.payload, True

        payload = compute()  # raises UpstreamError

        try:
            with transaction.atomic():
                AstroCache.objects.create(key=cache_key, payload=payload)
        except IntegrityError:
            # The unique primary key lost a race at the database — the
            # winner's row IS the answer, for a pure function of the key.
            row = AstroCache.objects.get(key=cache_key)
            return row.payload, False
        except Exception:
            logger.exception("astro cache write failed, serving uncached: %s", cache_key)
        return payload, False
    finally:
        cache.delete(lock_key)


# ── the four ops ─────────────────────────────────────────────────────────────

def place_search(query):
    """`geo`: the one op with no cache and no session behind it — AskPlace
    runs during onboarding, before anyone has signed in. Results ranked by
    population (relevance puts hamlets above cities with the same name) and
    deduped by what the screen would render."""
    results = get_provider().geo_search(query)
    ranked = sorted(results, key=lambda r: r.get("population") or 0, reverse=True)
    seen = set()
    distinct = []
    for result in ranked:
        render_key = "|".join([
            str(result.get("name")), str(result.get("district")), str(result.get("state")),
            str(result.get("country")),
            f"{float(result['lat']):.2f}", f"{float(result['lng']):.2f}",
        ])
        if render_key in seen:
            continue
        seen.add(render_key)
        distinct.append(result)
    return distinct


def panchang(date_string):
    """One row a day for the entire user base, computed at Ujjain; the key
    carries no place because there is only one. `city` travels with the
    response so the screen can name whose sunrise it used."""
    body = {
        **date_parts(date_string),
        "lat": PANCHANG_ANCHOR["lat"], "lng": PANCHANG_ANCHOR["lng"],
        "tz_str": PANCHANG_ANCHOR["zone"],
        **RECKONING,
    }
    payload, cached = memo(f"panchang:{date_string}", lambda: get_provider().panchang(body))
    return payload, cached


def _chart(cache_key, body):
    payload, cached = memo(cache_key, lambda: get_provider().chart(body))
    return payload, cached


def subject_chart(birth):
    """A chart for birth details the caller TYPED — somebody else's.

    Not `user_chart`: that keys the cache by the profile it belongs to, and
    this chart belongs to no profile. The key is the birth digest alone, so
    two seekers asking about the same person share one upstream call and no
    account id is attached to the row.

    NOTHING IS STORED but the chart. The name, the date, the place stay in
    the request — a third party never agreed to be in this database, and
    the only way not to hold their details is not to write them (21 Sep
    decision; docs/01-PRD.md §4.4). `astro_cache` holds the computed
    positions under a hash, which is derived data and not a birth record.
    """
    return _chart(f"chart:subject:{birth_digest(birth)}", birth_body(birth))


def user_chart(user_id, birth):
    """The caller's natal chart — a pure function of their birth, cached
    with no date in the key because a natal chart never changes."""
    key = f"chart:{user_id}:{birth_digest(birth)}"
    return _chart(key, birth_body(birth))


def horoscope(user_id, birth, date_string):
    """The daily reading, computed from the caller's own birth.

    Everything in it — the headline, the scores, the dasha, the transits — is
    theirs. It used to come from one of twelve canonical births, which made
    it cheap and made most of it true of nobody; this reverses that, at one
    upstream call per reader per day (docs/02-TRD.md §8 has the cost).

    The timing windows are computed at the BIRTH place, not at Ujjain. The
    screen names the place for that reason.

    rashi still travels with the response, off the reader's chart, which is
    cached forever and which the screens fetch anyway for their header.
    """
    chart_payload, _ = user_chart(user_id, birth)
    body = {
        **birth_body(birth),
        "target_date": date_string,
        "include_evidence": False,
        "include_raw_facts": False,
    }
    payload, cached = memo(
        f"horoscope:{user_id}:{birth_digest(birth)}:{date_string}",
        lambda: get_provider().daily_horoscope(body),
    )
    return payload, moon_sign(chart_payload), cached


def match(first, second):
    """Ashtakoota for two births, in that order — the order is part of the
    key because the kootas are not symmetric (Tara and Vashya read
    differently from each side).

    Either birth may be typed by the caller, so, as with `subject_chart`,
    the key is the two digests and nothing else: no account id, no name, no
    date. Only the computed result is stored.
    """
    body = {"person1": birth_body(first), "person2": birth_body(second)}
    return memo(
        f"match:{birth_digest(first)}:{birth_digest(second)}",
        lambda: get_provider().match(body),
    )


def muhurat_place(lat, lng):
    """Coordinates rounded to one decimal, about 11 km. Sunrise moves about
    two seconds across that, and everyone in the same cell shares one row.
    The ROUNDED values go upstream too, so the payload is a function of its
    key and nothing else."""
    return round(float(lat), 1), round(float(lng), 1)


def muhurat(purpose, month_string, lat, lng, zone, user_id=None, birth=None):
    """A purpose's windows for a whole month at a place. Always the whole
    month, so the key does not change every day; the screen drops windows
    that have already passed.

    With a birth, the vendor judges the same windows against that chart and
    may pick one best moment. That result is the caller's alone, so the key
    carries their id and their birth digest.
    """
    lat, lng = muhurat_place(lat, lng)
    start_date, end_date = month_range(month_string)
    body = {
        "purpose": purpose,
        "start_date": start_date,
        "end_date": end_date,
        "lat": lat,
        "lng": lng,
        "tz_str": zone,
        "ayanamsha": RECKONING["ayanamsha"],
        "limit": 20,
    }
    place_key = f"{purpose}:{lat:.1f}:{lng:.1f}:{zone}:{month_string}"
    if birth is None:
        return memo(f"muhurat:{place_key}", lambda: get_provider().muhurat(body))
    body["subject"] = birth_body(birth)
    return memo(
        f"muhurat-me:{user_id}:{birth_digest(birth)}:{place_key}",
        lambda: get_provider().muhurat_personal(body),
    )
