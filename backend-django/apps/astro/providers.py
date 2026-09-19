"""The provider interface behind the astro module.

The upstream API (freeastroapi.com) is called server-side only — the key is
a secret and the browser never holds it (backend/INSTRUCTIONS.md rule 7).
`AstroProvider` is the seam: the edge function in backend/functions/astro/
is replaced by `FreeAstroApiProvider` in production and `MockProvider` in
dev and tests, selected by the ASTRO_PROVIDER setting.

Two hard rules, both inherited from the edge function:

- A failure is a generic `UpstreamError`. The exception message, the logs
  the caller sees, and any response body must never contain the API key or
  the upstream URL — provider internals stay server-side.
- Method arguments are the exact request bodies the edge function built;
  response values are the parsed JSON payloads it stored in astro_cache, so
  the client-visible shapes do not change at cutover.
"""

import abc
import hashlib
import json
import logging
import math
from datetime import date, datetime, timedelta, timezone

import requests

logger = logging.getLogger("apps.astro")


class UpstreamError(Exception):
    """The provider could not answer. Message is generic on purpose — it may
    surface in logs and must never carry the key, the URL, or the response
    the vendor sent back."""


class AstroProvider(abc.ABC):
    """One method per upstream endpoint the edge function called."""

    @abc.abstractmethod
    def chart(self, body):
        """POST /api/v2/vedic/chart — natal chart for one birth."""

    @abc.abstractmethod
    def panchang(self, body):
        """POST /api/v2/vedic/panchang — the day's almanac for one place."""

    @abc.abstractmethod
    def daily_horoscope(self, body):
        """POST /api/v2/vedic/horoscope/daily/personal — one sign's reading."""

    @abc.abstractmethod
    def geo_search(self, query):
        """GET /api/v2/geo/search — place candidates for a search string."""


class FreeAstroApiProvider(AstroProvider):
    """The real provider. Mirrors the edge function's fetch calls exactly:
    same paths, same `x-api-key` header, POST with JSON bodies for the three
    computed ops and a GET with q/limit for geo."""

    def __init__(self, api_key, base_url="https://api.freeastroapi.com", timeout=10):
        if not api_key:
            raise UpstreamError("provider not configured")
        self._api_key = api_key
        self._base_url = base_url
        self._timeout = timeout

    def _post(self, path, payload):
        try:
            response = requests.post(
                f"{self._base_url}{path}",
                json=payload,
                headers={"Content-Type": "application/json", "x-api-key": self._api_key},
                timeout=self._timeout,
            )
        except requests.RequestException:
            # Named by class only: requests exceptions embed the URL (and so
            # the host) in their message, which must not reach any log the
            # caller sees or any response body.
            logger.error("astro upstream unreachable (%s)", path)
            raise UpstreamError("unreachable") from None
        if response.status_code != 200:
            logger.error("astro upstream refused (%s): %s", path, response.status_code)
            raise UpstreamError("refused")
        try:
            return response.json()
        except ValueError:
            logger.error("astro upstream returned non-JSON (%s)", path)
            raise UpstreamError("bad payload") from None

    def chart(self, body):
        return self._post("/api/v2/vedic/chart", body)

    def panchang(self, body):
        return self._post("/api/v2/vedic/panchang", body)

    def daily_horoscope(self, body):
        return self._post("/api/v2/vedic/horoscope/daily/personal", body)

    def geo_search(self, query):
        try:
            response = requests.get(
                f"{self._base_url}/api/v2/geo/search",
                params={"q": query, "limit": 8},
                headers={"x-api-key": self._api_key},
                timeout=self._timeout,
            )
        except requests.RequestException:
            logger.error("astro geo search unreachable")
            raise UpstreamError("unreachable") from None
        if response.status_code != 200:
            logger.error("astro geo search refused: %s", response.status_code)
            raise UpstreamError("refused")
        try:
            document = response.json()
        except ValueError:
            raise UpstreamError("bad payload") from None
        return document.get("results", [])


# ── The deterministic mock ───────────────────────────────────────────────────
#
# MockProvider answers every method with a payload derived purely from its
# arguments — same input, same output, no clock, no randomness — so dev and
# tests run with zero network and zero quota. The Moon is the one body the
# service reads back (it chooses a rashi from it and verifies the canonical
# births), so the mock computes it with a truncated lunar theory (Meeus,
# low-precision series; ~0.3°) minus the Lahiri ayanamsa rather than from a
# bare hash. Verified against backend/functions/astro/canonical.json: all
# twelve canonical births land mid-sign, which is what keeps the service's
# canonical-moon check passing end-to-end on the mock. Everything else is
# hash-derived; the shapes match the fields src/lib/astro.js renders.

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

NAKSHATRAS = [
    "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
    "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
    "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha",
    "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana",
    "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada",
    "Revati",
]

NAKSHATRA_LORDS = [
    "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
]

PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]

TITHI_NAMES = [
    "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
    "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
    "Trayodashi", "Chaturdashi",
]

MOVING_KARANAS = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti"]

YOGAS = [
    "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
    "Sukarman", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata",
    "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana", "Parigha",
    "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra",
    "Vaidhriti",
]

LUNAR_MONTHS = [
    "Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada",
    "Ashwin", "Kartik", "Margashirsha", "Pausha", "Magha", "Phalguna",
]

DAY_SENTENCES = [
    "A steady day — finish what is already moving before starting anything new.",
    "Good for calls and short journeys; keep the afternoon unplanned.",
    "Hold money decisions until tomorrow; the morning favours paperwork.",
    "A day for listening more than speaking; evening brings clarity.",
    "Start the one thing you have been postponing — the day supports beginnings.",
    "Keep promises small and keep them; energy runs lower after dusk.",
    "Favourable for study and repair; avoid lending today.",
]

_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

_NAK_LENGTH = 40.0 / 3.0  # 13°20'


def _seed(*parts):
    material = "|".join(str(p) for p in parts)
    return int.from_bytes(hashlib.sha256(material.encode()).digest()[:8], "big")


def _sign_of(longitude):
    return SIGNS[int(longitude % 360 // 30)]


def _nakshatra(longitude):
    index = int(longitude % 360 // _NAK_LENGTH) % 27
    return {
        "name": NAKSHATRAS[index],
        "pada": int((longitude % 360 % _NAK_LENGTH) / (_NAK_LENGTH / 4)) + 1,
        "lord": NAKSHATRA_LORDS[index % 9],
    }


def _to_utc(body):
    """The birth's local civil time as an aware UTC datetime (zoneinfo,
    falling back to +05:30 when the zone name is unknown)."""
    local = datetime(
        int(body["year"]), int(body["month"]), int(body["day"]),
        int(body.get("hour", 12)), int(body.get("minute", 0)),
    )
    try:
        from zoneinfo import ZoneInfo

        return local.replace(tzinfo=ZoneInfo(body.get("tz_str") or "Asia/Kolkata")).astimezone(timezone.utc)
    except Exception:
        return local.replace(tzinfo=timezone(timedelta(hours=5, minutes=30))).astimezone(timezone.utc)


def _days_since_j2000(moment):
    return moment.timestamp() / 86400.0 + 2440587.5 - 2451545.0


def _tropical_longitudes(moment):
    """Sun and Moon, tropical ecliptic longitude, truncated series (~0.3°)."""
    d = _days_since_j2000(moment)
    sun = (280.466447 + 0.98564736 * d) % 360
    Lp = (218.3164477 + 13.17639648 * d) % 360
    D = (297.8501921 + 12.19074912 * d) % 360
    M = (357.5291092 + 0.99034969 * d) % 360
    Mp = (134.9633964 + 13.06499245 * d) % 360
    F = (93.2720950 + 13.22935024 * d) % 360
    s = lambda x: math.sin(math.radians(x))  # noqa: E731
    moon = (
        Lp + 6.289 * s(Mp) + 1.274 * s(2 * D - Mp) + 0.658 * s(2 * D)
        + 0.214 * s(2 * Mp) - 0.186 * s(M) - 0.114 * s(2 * F)
    ) % 360
    return sun, moon


def _lahiri(d):
    return 23.853 + 3.8247e-5 * d  # degrees since J2000; ~±0.5° is ample for signs


def _clock(minutes):
    """Minutes past midnight as HH:MM, matching the panchang convention of
    windows that can run past 24:00."""
    return f"{int(minutes // 60):02d}:{int(minutes % 60):02d}"


def _window(seed, day_minutes=720):
    start = seed % (24 * 60 - day_minutes)
    return {"start": _clock(start), "end": _clock(start + day_minutes)}


class MockProvider(AstroProvider):
    """Deterministic stand-in for freeastroapi.com. Same arguments, same
    shapes, answers derived only from the inputs — never from the clock or
    a random source."""

    def chart(self, body):
        seed = _seed("chart", json.dumps(body, sort_keys=True, default=str))
        moment = _to_utc(body)
        d = _days_since_j2000(moment)
        sun_trop, moon_trop = _tropical_longitudes(moment)
        ayanamsa = _lahiri(d)
        moon_sid = (moon_trop - ayanamsa) % 360
        sun_sid = (sun_trop - ayanamsa) % 360

        longitudes = {"Sun": sun_sid, "Moon": moon_sid}
        for name in ("Mars", "Mercury", "Jupiter", "Venus", "Saturn"):
            longitudes[name] = (_seed(seed, name) % 360000) / 1000.0
        rahu = (moon_trop + 180.0) % 360  # mean node approximation
        longitudes["Rahu"] = (rahu - ayanamsa) % 360
        longitudes["Ketu"] = (longitudes["Rahu"] + 180.0) % 360

        asc_lon = (_seed(seed, "ascendant") % 36000) / 100.0
        asc_sign = int(asc_lon // 30)

        planets = []
        for name in PLANETS:
            lon = longitudes[name]
            sign = int(lon // 30)
            nak = _nakshatra(lon)
            planets.append({
                "name": name,
                "sign": SIGNS[sign],
                "house": (sign - asc_sign) % 12 + 1,  # whole sign
                "degree_in_sign": round(lon % 30, 4),
                "nakshatra": nak["name"],
                "pada": nak["pada"],
                "nakshatra_lord": nak["lord"],
                "is_retrograde": bool(name not in ("Sun", "Moon") and _seed(seed, name, "retro") % 5 == 0),
            })

        return {
            "planets": planets,
            "ascendant": {
                "sign": SIGNS[asc_sign],
                "degree": round(asc_lon, 4),
                "nakshatra": _nakshatra(asc_lon),
            },
            "houses": [
                {"house": n, "sign": SIGNS[(asc_sign + n - 1) % 12]} for n in range(1, 13)
            ],
        }

    def panchang(self, body):
        seed = _seed("panchang", json.dumps(body, sort_keys=True, default=str))
        moment = _to_utc(body)
        d = _days_since_j2000(moment)
        sun_trop, moon_trop = _tropical_longitudes(moment)
        ayanamsa = _lahiri(d)
        sun_sid = (sun_trop - ayanamsa) % 360
        moon_sid = (moon_trop - ayanamsa) % 360
        elong = (moon_trop - sun_trop) % 360

        tithi_index = int(elong // 12) + 1  # 1..30
        paksha = "Shukla" if tithi_index <= 15 else "Krishna"
        if tithi_index == 15:
            tithi_name = "Purnima"
        elif tithi_index == 30:
            tithi_name = "Amavasya"
        else:
            tithi_name = TITHI_NAMES[(tithi_index if tithi_index < 15 else tithi_index - 15) - 1]

        day = date(int(body["year"]), int(body["month"]), int(body["day"]))
        sunrise = _clock(345 + seed % 30)
        sunset = _clock(1105 + (seed >> 8) % 30)

        return {
            "date": day.isoformat(),
            "weekday": {"name": _WEEKDAYS[day.weekday()]},
            "tithi": {"name": tithi_name, "paksha": paksha},
            "nakshatra": _nakshatra(moon_sid),
            "yoga": {"name": YOGAS[int((moon_sid + sun_sid) % 360 // _NAK_LENGTH) % 27]},
            "karanas": [{"name": MOVING_KARANAS[(int(elong // 6) - 1) % 7]}],
            "sunrise": f"{sunrise}:00+05:30",
            "sunset": f"{sunset}:00+05:30",
            "rahu_kalam": _window(seed >> 16, 90),
            "yamaganda": _window(seed >> 24, 90),
            "gulika": _window(seed >> 32, 90),
            "abhijit": _window(seed >> 40, 48),
            "lunar_month": {
                "name": LUNAR_MONTHS[int(moon_sid // 30) % 12],
                "vikram_samvat": int(body["year"]) + 57,
            },
            "request_time_panchang": {"moon_sign": {"name": _sign_of(moon_sid)}},
        }

    def daily_horoscope(self, body):
        target = str(body["target_date"])
        seed = _seed("horoscope", target)
        return {
            "meta": {"target_date": target},
            "narrative": {"best_use": DAY_SENTENCES[seed % len(DAY_SENTENCES)]},
            "timing": {
                "abhijit": _window(seed, 48),
                "rahu_kalam": _window(seed >> 8, 90),
                "yamaganda": _window(seed >> 16, 90),
                "gulika": _window(seed >> 24, 90),
            },
        }

    def geo_search(self, query):
        q = query.strip()
        seed = _seed("geo", q.lower())
        primary_population = 500_000 + seed % 9_000_000
        base_lat = 8 + (seed % 2000) / 100.0   # 8.00–27.99, inside India-ish
        base_lng = 68 + ((seed >> 16) % 2400) / 100.0
        results = [{
            "name": q.title(),
            "district": q.title(),
            "state": ["Maharashtra", "Uttar Pradesh", "Karnataka", "West Bengal"][(seed >> 32) % 4],
            "country": "India",
            "lat": round(base_lat, 6),
            "lng": round(base_lng, 6),
            "population": primary_population,
        }]
        # A same-name hamlet with a smaller population and a row that renders
        # identically to the primary one (same rounded coords) — the view's
        # rank-by-population and render-dedup must collapse these.
        results.append({
            "name": q.title(),
            "district": q.title(),
            "state": results[0]["state"],
            "country": "India",
            "lat": round(base_lat + 0.003, 6),
            "lng": round(base_lng + 0.003, 6),
            "population": 400 + (seed >> 40) % 9_000,
        })
        results.append({
            "name": f"{q.title()} Road",
            "district": q.title(),
            "state": results[0]["state"],
            "country": "India",
            "lat": round(base_lat + 0.4, 6),
            "lng": round(base_lng + 0.3, 6),
            "population": 1_000 + (seed >> 48) % 90_000,
        })
        return results
