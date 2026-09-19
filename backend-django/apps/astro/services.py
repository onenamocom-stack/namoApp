"""Astro services — the rules of the `astro` Edge Function
(backend/functions/astro/index.ts) re-expressed in Django, against the same
astro_cache table with the same cache-key construction.

What is replicated from the edge function, call for call:

- RECKONING (ayanamsha/house_system/node_type) merged into every outbound
  body; the panchang computed at the Ujjain anchor for everybody; the twelve
  canonical births (backend/functions/astro/canonical.json) driving the
  per-rashi horoscope.
- Cache keys: `panchang:<date>`, `chart:<user id>:<birth digest>`,
  `canon-chart:<rashi>`, `rashifal:<rashi>:<date>`. The digest is SHA-256
  over the same six birth columns joined the way the function joined them.
  (docs/05 §4.10's key table still shows the pre-7-Sep per-person horoscope
  key; the function is ground truth and so is this.)
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

import hashlib
import logging
import time
from datetime import date, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from .models import AstroCache
from .providers import FreeAstroApiProvider, MockProvider, UpstreamError

logger = logging.getLogger("apps.astro")

# Settled in docs/02-TRD.md §8. Passed on every upstream call, never defaulted.
RECKONING = {"ayanamsha": "lahiri", "house_system": "whole_sign", "node_type": "mean"}

# WHERE THE PANCHANG IS COMPUTED, FOR EVERYBODY — Ujjain, chosen 4 Sep 2026;
# the classical zero-longitude of Indian astronomy. One anchor means one
# upstream request a day for the entire user base.
PANCHANG_ANCHOR = {"lat": 23.1765, "lng": 75.7885, "zone": "Asia/Kolkata", "city": "Ujjain"}

# THE TWELVE CANONICAL BIRTHS, one per rashi (backend/functions/astro/
# canonical.json — ported, not copied under a different shape, so the Django
# service and the verifier read the same table). Twelve readings a day
# answer everybody; the reader's own chart only picks which one.
CANONICAL_PLACE = {"lat": 23.1765, "lng": 75.7885, "tz_str": "Asia/Kolkata"}
CANONICAL_BIRTHS = {
    "Aries":       {"year": 1995, "month": 6, "day": 23, "hour": 10, "minute": 40},
    "Taurus":      {"year": 1995, "month": 6, "day": 25, "hour": 23, "minute": 30},
    "Gemini":      {"year": 1995, "month": 6, "day": 28, "hour": 12, "minute": 10},
    "Cancer":      {"year": 1995, "month": 6, "day": 3,  "hour": 18, "minute": 10},
    "Leo":         {"year": 1995, "month": 6, "day": 6,  "hour": 3,  "minute": 50},
    "Virgo":       {"year": 1995, "month": 6, "day": 8,  "hour": 10, "minute": 20},
    "Libra":       {"year": 1995, "month": 6, "day": 10, "hour": 13, "minute": 10},
    "Scorpio":     {"year": 1995, "month": 6, "day": 12, "hour": 13, "minute": 20},
    "Sagittarius": {"year": 1995, "month": 6, "day": 14, "hour": 12, "minute": 30},
    "Capricorn":   {"year": 1995, "month": 6, "day": 16, "hour": 12, "minute": 50},
    "Aquarius":    {"year": 1995, "month": 6, "day": 18, "hour": 16, "minute": 10},
    "Pisces":      {"year": 1995, "month": 6, "day": 20, "hour": 23, "minute": 40},
}


class UpstreamUnavailable(UpstreamError):
    """The provider refused or could not be reached. Views turn this into the
    edge function's 502 'upstream' refusal; the message here is for logs
    only and never reaches a response body."""


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


def user_chart(user_id, birth):
    """The caller's natal chart — a pure function of their birth, cached
    with no date in the key because a natal chart never changes."""
    key = f"chart:{user_id}:{birth_digest(birth)}"
    return _chart(key, birth_body(birth))


def horoscope(user_id, birth, date_string):
    """The daily reading: the caller's chart picks a rashi, the canonical
    chart for that rashi is fetched once ever, and the reading for the day
    is one of twelve rows. rashi travels with the response because a sign
    reading that does not say which sign it is for reads as a personal one.
    """
    chart_payload, _ = user_chart(user_id, birth)
    rashi = moon_sign(chart_payload)

    # The Moon is the whole of the key. A chart with no Moon, or a rashi the
    # canonical table does not know, must NOT silently fall through to one
    # arbitrary rashi's reading — that is a refusal.
    if not rashi or rashi not in CANONICAL_BIRTHS:
        logger.error("astro: no usable moon sign on chart for %s: %s", user_id, rashi)
        raise UpstreamUnavailable("no usable moon sign")

    canonical_body = {**CANONICAL_BIRTHS[rashi], **CANONICAL_PLACE, **RECKONING}
    canon, _ = _chart(f"canon-chart:{rashi}", canonical_body)
    if moon_sign(canon) != rashi:
        # The canonical table says what it means: a drifted birth would hand
        # every reader of one rashi the neighbouring one's reading, forever.
        logger.error("astro: canonical birth is wrong: %s moon is %s", rashi, moon_sign(canon))
        raise UpstreamUnavailable("canonical birth mismatch")

    reading_body = {
        **canonical_body,
        "target_date": date_string,
        "include_evidence": False,
        "include_raw_facts": False,
    }
    payload, cached = memo(
        f"rashifal:{rashi}:{date_string}",
        lambda: get_provider().daily_horoscope(reading_body),
    )
    return payload, rashi, cached
