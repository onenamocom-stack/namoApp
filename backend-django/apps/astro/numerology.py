"""Numerology, from a SECOND vendor.

`astrologyapi.com` rather than freeastroapi, because freeastroapi does not
compute numerology and this one does it well: a name and a birth date in,
and the destiny, radical and name numbers out with their lucky day, metal,
stone and mantra — plus the life path, expression, soul urge, subconscious
self and challenge numbers from a second endpoint. Basic auth, JSON out,
`Accept-Language: hi` for Hindi (`docs/02-TRD.md` §8 records what was
adopted from that vendor and what was refused).

It lives in the astro app rather than in one of its own for the reasons the
astro module already settled: the cache table, the memo with its
single-flight lock, and the refusal envelope are all here, and a second app
would copy three of them to own one vendor call.

**The name is the input, and it is the caller's to give.** Numerology reads
the name as it was given at birth, which is often not the name on the
profile — a married name, a spelling, an initial. So the screen sends one
(rule 3 is about what the client benefits from changing; nobody gains by
misspelling their own name, and they are the only one who knows it).
"""

import abc
import base64
import hashlib
import json
import logging

import requests
from django.conf import settings

from .providers import UpstreamError
from .services import memo

logger = logging.getLogger("apps.astro")

BASE_URL = "https://json.astrologyapi.com/v1"

# The two endpoints, and what each is for. Both are pure functions of the
# name and the date, which is why a reading is cached forever.
TABLE = "numero_table"                 # destiny/radical/name numbers, lucky things
NUMBERS = "numerological_numbers"      # life path, expression, soul urge, challenges


class NumerologyProvider(abc.ABC):
    @abc.abstractmethod
    def profile(self, name, day, month, year, lang):
        """-> {"table": {...}, "numbers": {...}}"""


class AstrologyApiProvider(NumerologyProvider):
    """The real one. Basic auth with the user id as the username and the API
    key as the password, exactly as their quick-start says."""

    def __init__(self, user_id, api_key, timeout=10):
        if not user_id or not api_key:
            raise UpstreamError("provider not configured")
        token = base64.b64encode(f"{user_id}:{api_key}".encode()).decode()
        self._auth = f"Basic {token}"
        self._timeout = timeout

    def _post(self, path, payload, lang):
        try:
            response = requests.post(
                f"{BASE_URL}/{path}",
                data=payload,
                headers={
                    "Authorization": self._auth,
                    # Their API answers Hindi on this header alone. A key in
                    # the body would be one more thing to keep in step.
                    "Accept-Language": "hi" if lang == "hi" else "en",
                },
                timeout=self._timeout,
            )
        except requests.RequestException:
            # Named by class only: a requests exception carries the URL, and
            # the URL carries the vendor (INSTRUCTIONS.md rule 7).
            logger.error("numerology upstream unreachable (%s)", path)
            raise UpstreamError("unreachable") from None
        if response.status_code != 200:
            logger.error("numerology upstream refused (%s): %s", path, response.status_code)
            raise UpstreamError("refused")
        try:
            return response.json()
        except ValueError:
            logger.error("numerology upstream returned non-JSON (%s)", path)
            raise UpstreamError("bad payload") from None

    def profile(self, name, day, month, year, lang):
        table = self._post(TABLE, {"name": name, "day": day, "month": month, "year": year}, lang)
        numbers = self._post(
            NUMBERS, {"full_name": name, "date": day, "month": month, "year": year}, lang
        )
        return {"table": table, "numbers": numbers}


def _reduce(number):
    """Digit sum down to 1-9, the way numerology counts. 11, 22 and 33 are
    master numbers in most schools and are NOT reduced — the mock keeps them
    so a screen built against it does not assume single digits."""
    while number > 9 and number not in (11, 22, 33):
        number = sum(int(d) for d in str(number))
    return number


class MockNumerologyProvider(NumerologyProvider):
    """Deterministic and offline, for dev and tests.

    The two numbers that are plain arithmetic — the radical (birth day) and
    the destiny (whole date) — are computed properly, because a mock that
    gets those wrong teaches a developer the wrong shape. Everything else is
    derived from a hash of the same inputs: same name and date, same answer,
    no clock and no network.
    """

    COLOURS = ["Red", "White", "Yellow", "Green", "Blue", "Pink", "Grey", "Black", "Maroon"]
    METALS = ["Copper", "Silver", "Gold", "Bronze", "Iron", "Brass", "Steel", "Platinum", "Tin"]
    STONES = ["Ruby", "Pearl", "Coral", "Emerald", "Topaz", "Diamond", "Sapphire", "Agate", "Opal"]
    GODS = ["Surya", "Chandra", "Mangal", "Budh", "Guru", "Shukra", "Shani", "Rahu", "Ketu"]
    DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    def profile(self, name, day, month, year, lang):
        seed = int.from_bytes(
            hashlib.sha256(f"{name.lower()}|{day}|{month}|{year}".encode()).digest()[:8], "big"
        )
        radical = _reduce(day)
        destiny = _reduce(day + month + sum(int(d) for d in str(year)))
        letters = sum(ord(c) - 96 for c in name.lower() if "a" <= c <= "z")
        name_number = _reduce(letters) or 1
        pick = lambda seq, salt: seq[(seed >> salt) % len(seq)]  # noqa: E731

        return {
            "table": {
                "name": name,
                "date": f"{day:02d}-{month:02d}-{year}",
                "destiny_number": destiny,
                "radical_number": radical,
                "name_number": name_number,
                "evil_num": str((radical % 9) + 1),
                "friendly_num": str(((radical + 3) % 9) + 1),
                "neutral_num": str(((radical + 5) % 9) + 1),
                "fav_color": pick(self.COLOURS, 0),
                "fav_day": pick(self.DAYS, 8),
                "fav_god": pick(self.GODS, 16),
                "fav_mantra": f"|| Om {pick(self.GODS, 16)}ay Namah ||",
                "fav_metal": pick(self.METALS, 24),
                "fav_stone": pick(self.STONES, 32),
                "fav_substone": pick(self.STONES, 40),
                "radical_ruler": pick(self.GODS, 16),
            },
            "numbers": {
                "name": name,
                "birth_date": f"{year}-{month:02d}-{day:02d}",
                "lifepath_number": destiny,
                "personality_number": _reduce(name_number + radical),
                "expression_number": name_number,
                "soul_urge_number": _reduce(letters // 2 or 1),
                "subconscious_self_number": _reduce((seed % 8) + 1),
                "challenge_numbers": [
                    abs(day - month) % 9,
                    _reduce((seed >> 4) % 9 + 1),
                    _reduce((seed >> 12) % 9 + 1),
                    _reduce((seed >> 20) % 9 + 1),
                ],
            },
        }


def get_provider():
    if settings.NUMEROLOGY_PROVIDER == "astrologyapi":
        return AstrologyApiProvider(
            settings.ASTROLOGY_API_USER_ID,
            settings.ASTROLOGY_API_KEY,
            timeout=settings.ASTRO_TIMEOUT_SECONDS,
        )
    return MockNumerologyProvider()


def digest(name, birth_date, lang):
    """Half the cache key: everything that moves the answer. The name is
    lowercased and its runs of whitespace collapsed, so "Ravi  Kumar" and
    "ravi kumar" are one cached reading rather than two."""
    material = f"{' '.join(name.lower().split())}|{birth_date}|{lang}"
    return hashlib.sha256(material.encode()).digest()[:8].hex()


def numerology(name, birth_date, lang="en"):
    """A numerology profile for a name and a birth date.

    Cached forever under `numerology:<digest>`, with no account id in the
    key: the answer is a function of a name and a date and of nothing else,
    so two people asking about the same name share one upstream call — the
    same reasoning as a subject chart or a match, and the same consequence
    that no birth record is written down.
    """
    year, month, day = (int(part) for part in str(birth_date).split("-"))

    def compute():
        return get_provider().profile(name.strip(), day, month, year, lang)

    return memo(f"numerology:{digest(name, birth_date, lang)}", compute)
