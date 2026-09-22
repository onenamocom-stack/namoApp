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
    """One method per upstream endpoint we call."""

    @abc.abstractmethod
    def chart(self, body):
        """POST /api/v2/vedic/chart — natal chart for one birth."""

    @abc.abstractmethod
    def panchang(self, body):
        """POST /api/v2/vedic/panchang — the day's almanac for one place."""

    @abc.abstractmethod
    def daily_horoscope(self, body):
        """POST /api/v2/vedic/horoscope/daily/personal — one reader's day."""

    @abc.abstractmethod
    def geo_search(self, query):
        """GET /api/v2/geo/search — place candidates for a search string."""

    @abc.abstractmethod
    def match(self, body):
        """POST /api/v2/vedic/match — Ashtakoota for two births."""

    @abc.abstractmethod
    def muhurat(self, body):
        """POST /api/v2/vedic/muhurat/search — a purpose's windows at a place."""

    @abc.abstractmethod
    def muhurat_personal(self, body):
        """POST /api/v2/vedic/muhurat/personalized-search — the same windows
        judged against one birth, with a best moment when one survives."""


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

    def match(self, body):
        return self._post("/api/v2/vedic/match", body)

    def muhurat(self, body):
        return self._post("/api/v2/vedic/muhurat/search", body)

    def muhurat_personal(self, body):
        return self._post("/api/v2/vedic/muhurat/personalized-search", body)

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
# service reads back (the reader's rashi comes from it, and so does each
# person's side of a match), so the mock computes it with a truncated lunar
# theory (Meeus, low-precision series; ~0.3°) minus the Lahiri ayanamsa
# rather than from a bare hash. Everything else is hash-derived. The shapes
# of the reading, the match and the muhurat searches are copied from real
# responses taken 22 Sep 2026, cut to the fields src/lib/astro.js reads.

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

# The reading's six domains, as the vendor names them, with their titles.
_AREAS = {
    "career": "Career", "wealth": "Money", "relationships": "Relationships",
    "health": "Health", "mind": "Mind", "spiritual": "Spiritual life",
}

# The eight kootas and their maximum points, in the vendor's order. 36 total.
_KOOTAS = [
    ("varna", "Varna", 1), ("vashya", "Vashya", 2), ("tara", "Tara", 3),
    ("yoni", "Yoni", 4), ("graha_maitri", "Graha Maitri", 5), ("gana", "Gana", 6),
    ("bhakoot", "Bhakoot", 7), ("nadi", "Nadi", 8),
]

_IST = timezone(timedelta(hours=5, minutes=30))


def _band(score):
    if score >= 85:
        return "strong"
    if score >= 65:
        return "favorable"
    if score >= 45:
        return "mixed"
    return "challenging"


def _recommendation(total):
    if total < 18:
        return "Not Recommended"
    if total < 25:
        return "Average Match"
    if total < 32:
        return "Good Match"
    return "Excellent Match"


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
        # The reader's own birth drives the reading now, so the seed carries
        # the birth as well as the day: two readers differ, one reader's day
        # is stable.
        target = str(body["target_date"])
        seed = _seed("horoscope", json.dumps(body, sort_keys=True, default=str))
        # MockProvider.chart, not self.chart: deriving the reading from the
        # same birth happens inside this one answer, and a test that counts
        # upstream calls must not see a second one.
        chart = MockProvider.chart(self, body)
        moon = next(p for p in chart["planets"] if p["name"] == "Moon")
        lord = PLANETS[seed % 7]
        scores = {area: 35 + _seed(seed, area) % 61 for area in _AREAS}
        overall = sum(scores.values()) // len(scores)
        best, worst = max(scores, key=scores.get), min(scores, key=scores.get)
        return {
            "meta": {"target_date": target},
            "profile": {
                "lagna": {"sign": chart["ascendant"]["sign"]},
                "moon": {"sign": moon["sign"], "nakshatra": moon["nakshatra"]},
                "active_dasha_stack": [{"level": "Mahadasha", "lord": lord}],
            },
            "theme": {"headline": f"{lord} sets the pace of the day"},
            "scores": {
                "overall": {"score": overall, "band": _band(overall)},
                **{area: {"score": s, "band": _band(s)} for area, s in scores.items()},
            },
            "narrative": {
                "summary": f"The {lord} period colours the day. {_AREAS[best]} carries it; "
                           f"{_AREAS[worst].lower()} needs the slower hand.",
                "opportunity": f"The cleanest opening is {_AREAS[best].lower()}.",
                "caution": f"Go carefully with {_AREAS[worst].lower()} during Rahu Kalam.",
                "best_use": DAY_SENTENCES[seed % len(DAY_SENTENCES)],
            },
            "remedy": {
                "focus": "Guidance",
                "simple_action": "Finish one task you have been circling before noon.",
                "avoid": "Avoid promising more than the week can carry.",
                "reflection": "What would steady progress look like today?",
            },
            "sections": [
                {
                    "key": area, "title": title, "score": scores[area], "band": _band(scores[area]),
                    "summary": f"{title} rates {_band(scores[area])} at {scores[area]}/100.",
                    "advice": "Sequence the work; do the part that needs you first.",
                }
                for area, title in _AREAS.items()
            ],
            "influences": {
                "all_ranked": [
                    {
                        "id": f"daily_fact_0{rank}", "rank": rank, "polarity": polarity,
                        "title": f"{planet} transits your {moon['sign']} Moon",
                        "summary": f"{planet} brings {_AREAS[area].lower()} into focus.",
                    }
                    for rank, (planet, area, polarity) in enumerate(
                        [(lord, best, "supportive"), (PLANETS[(seed >> 3) % 7], worst, "challenging")],
                        start=1,
                    )
                ],
            },
            "timing": {
                "abhijit": {"key": "abhijit_muhurat", "label": "Abhijit Muhurat", **_window(seed, 48)},
                "rahu_kalam": {"key": "rahu_kalam", "label": "Rahu Kalam", **_window(seed >> 8, 90)},
                "yamaganda": {"key": "yamaganda", "label": "Yamaganda", **_window(seed >> 16, 90)},
                "gulika": {"key": "gulika", "label": "Gulika", **_window(seed >> 24, 90)},
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

    def match(self, body):
        seed = _seed("match", json.dumps(body, sort_keys=True, default=str))
        persons = []
        for index, side in enumerate(("person1", "person2"), start=1):
            moon = next(p for p in self.chart(body[side])["planets"] if p["name"] == "Moon")
            persons.append({
                "label": f"Person {index}",
                "input_mode": "birth_chart",
                "moon_sign": {"name": moon["sign"]},
                "moon_nakshatra": {"name": moon["nakshatra"], "pada": moon["pada"],
                                   "lord": moon["nakshatra_lord"]},
            })

        kootas = []
        for koota_id, name, top in _KOOTAS:
            score = (_seed(seed, koota_id) % (2 * top + 1)) / 2  # half points, 0..top
            if score >= top * 0.75:
                status = "strong"
            elif score == 0 and koota_id in ("bhakoot", "nadi"):
                status = "dosha"
            else:
                status = "moderate" if score else "weak"
            kootas.append({
                "id": koota_id, "name": name, "score": score, "max_score": top, "status": status,
                "evidence": [{"kind": "rule_evaluation", "message": f"{name} read from both Moons."}],
            })
        by_id = {k["id"]: k for k in kootas}
        total = sum(k["score"] for k in kootas)

        def manglik(side):
            active = _seed(seed, "manglik", side) % 3 == 0
            severity = "Low Mangal Dosha" if active else "No Mangal Dosha"
            return {"available": True, "active": active, "severity": severity,
                    "cancellations": [], "message": f"{severity}."}

        first, second = manglik(1), manglik(2)
        balanced = first["active"] == second["active"]
        flags = [f"{k}_dosha" for k in ("bhakoot", "nadi") if by_id[k]["score"] == 0]
        if not balanced:
            flags.append("manglik_requires_review")

        def dosha(koota_id):
            k = by_id[koota_id]
            return {"active": k["score"] == 0, "score": k["score"], "max_score": k["max_score"],
                    "message": f"{k['name']} score is {k['score']:g} out of {k['max_score']}."}

        return {
            "persons": persons,
            "ashtakoota": {
                "score": total, "max_score": 36, "percentage": round(total / 36 * 100, 1),
                "recommendation": _recommendation(total), "kootas": kootas,
            },
            "doshas": {
                "manglik": {
                    "person1": first, "person2": second,
                    "compatibility": {
                        "available": True,
                        "status": "balanced" if balanced else "imbalanced",
                        "message": "Mangal Dosha levels are balanced between both charts."
                        if balanced else "Mangal Dosha is present in one chart only.",
                    },
                },
                "nadi": dosha("nadi"),
                "bhakoot": dosha("bhakoot"),
            },
            "summary": {
                "total_score": total, "max_score": 36, "minimum_traditional_threshold": 18,
                "passes_minimum_threshold": total >= 18, "risk_flags": flags,
            },
        }

    def muhurat(self, body):
        return self._muhurat(body, personal=False)

    def muhurat_personal(self, body):
        return self._muhurat(body, personal=True)

    def _muhurat(self, body, personal):
        seed = _seed("muhurat", personal, json.dumps(body, sort_keys=True, default=str))
        start, end = date.fromisoformat(body["start_date"]), date.fromisoformat(body["end_date"])
        purpose = body.get("purpose") or "general_work"
        label = purpose.replace("_", " ").title()

        windows = []
        day = start
        while day <= end:
            s = _seed(seed, day.isoformat())
            if s % 3 == 0:  # about ten days a month carry a window
                begin = datetime(day.year, day.month, day.day, tzinfo=_IST) + timedelta(minutes=300 + s % 900)
                length = 60 + (s >> 8) % 480
                window = {
                    "date": day.isoformat(),
                    "start": begin.isoformat(),
                    "end": (begin + timedelta(minutes=length)).isoformat(),
                    "duration_minutes": float(length),
                    "score": 60 + (s >> 16) % 40,
                    "quality": "auspicious",
                    "reasons": [f"{label} Muhurat", f"{TITHI_NAMES[s % 14]} Tithi",
                                f"{NAKSHATRAS[(s >> 4) % 27]} Nakshatra"],
                    "warnings": ["Overlaps Rahu Kaal."] if s % 2 else [],
                }
                if personal:
                    window["public_score"] = window["score"]
                    window["personal_score"] = 40 + (s >> 24) % 60
                    window["score"] = (window["public_score"] + window["personal_score"]) // 2
                windows.append(window)
            day += timedelta(days=1)
        windows.sort(key=lambda w: w["score"], reverse=True)

        result = {
            "purpose": purpose,
            "range": {"start_date": start.isoformat(), "end_date": end.isoformat(),
                      "day_count": (end - start).days + 1},
            "best_windows": windows[: int(body.get("limit", 10))],
            "best_moment": None,
            "rejected_windows": [],
        }
        if personal:
            # Like the vendor, the personal search often promotes nothing and
            # says why — the screen has to render that, so the mock does it
            # for half of all searches.
            top = result["best_windows"][0] if result["best_windows"] and seed % 2 == 0 else None
            if top:
                result["best_moment"] = {
                    "datetime": top["start"], "score": top["score"], "quality": "excellent",
                    "explanation": {
                        "headline": f"{top['start'][11:16]} on {top['date']} is an excellent "
                                    f"personalized {label} moment.",
                        "decision": "recommended",
                    },
                }
            result["selection_explanation"] = {
                "decision": "best_moment_found" if top else "no_best_moment",
                "headline": result["best_moment"]["explanation"]["headline"] if top
                else f"No strict {label} moment survived this search.",
                "summary": "The windows below pass the public rules; your chart decided the ranking.",
            }
        return result
