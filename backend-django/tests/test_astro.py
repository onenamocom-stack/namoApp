"""Module 3 — astro (docs/07 §6 step 3): the pytest port of
backend/schema/019_astro_cache_check.sql plus the endpoint contract of
src/lib/astro.js (and its staged Django rewrite, cutovers/astro.clientlib.js)
and the behaviour of backend/functions/astro/index.ts it replaces.

019 check coverage:
  1/4. the shape (key/payload/fetched_at) and a write landing
  5.   the same key twice is one row — primary key + catch-IntegrityError-
       read-winner under a real two-thread race
  2/3/6. service-role-only: no Django RLS exists, so the invariant is
       re-expressed — only services touch astro_cache, no endpoint exposes
       a raw row, and there is no cache route at all

Edge-function behaviour replicated (asserted here):
  - cache keys: panchang:<date>, chart:<id>:<digest>, canon-chart:<rashi>,
    rashifal:<rashi>:<date>; the digest changes with any birth column
  - no TTL: a row written for a key is served for that key forever; the
    date clamp (yesterday/today/tomorrow, IST) is the only freshness rule
  - auth: geo + panchang anonymous (the anon key passed verify_jwt there),
    chart + horoscope require a signed-in user
  - refusals: 400 invalid (bad date / short query), 401 unauthenticated,
    409 no_birth, 500 unavailable (profile read failure, missing key),
    502 upstream — and no response body ever carries the API key or the
    upstream URL (rule 7)
  - concurrency: two simultaneous misses for one key = ONE upstream call
"""

import hashlib
import json
import threading
from datetime import datetime, timedelta, timezone

import pytest
import requests
from django.db import connection
from django.test import Client

from apps.astro import services
from apps.astro.models import AstroCache
from apps.astro.providers import (
    AstroProvider,
    FreeAstroApiProvider,
    MockProvider,
    UpstreamError,
)
from apps.profiles import services as profile_services
from apps.profiles.models import Profile

from .conftest import TEST_USER, make_claims

BIRTH = {
    "birth_date": "1990-04-17",
    "birth_time": "14:30:00",
    "birth_time_known": True,
    "birth_lat": 23.1765,
    "birth_lon": 75.7885,
    "birth_zone": "Asia/Kolkata",
}


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


class CountingProvider(MockProvider):
    """MockProvider with per-method call counters — proves how many upstream
    calls a flow actually cost."""

    def __init__(self):
        self.calls = {"chart": 0, "panchang": 0, "daily_horoscope": 0, "geo_search": 0}
        self._lock = threading.Lock()

    def _count(self, name):
        with self._lock:
            self.calls[name] += 1

    def chart(self, body):
        self._count("chart")
        return super().chart(body)

    def panchang(self, body):
        self._count("panchang")
        return super().panchang(body)

    def daily_horoscope(self, body):
        self._count("daily_horoscope")
        return super().daily_horoscope(body)

    def geo_search(self, query):
        self._count("geo_search")
        return super().geo_search(query)


class FailingProvider(MockProvider):
    """Every upstream call refuses — the provider-failure path."""

    def chart(self, body):
        raise UpstreamError("refused")

    def panchang(self, body):
        raise UpstreamError("refused")

    def daily_horoscope(self, body):
        raise UpstreamError("refused")

    def geo_search(self, query):
        raise UpstreamError("refused")


@pytest.fixture
def provider(monkeypatch):
    """The module-wide provider: a counting mock. Tests read call counts off
    the same instance every thread sees (get_provider builds per call, so
    monkeypatch the factory, not the instance)."""
    counting = CountingProvider()
    monkeypatch.setattr(services, "get_provider", lambda: counting)
    return counting


@pytest.fixture
def profiles_table():
    """`profiles` is a real Django table now — module 9 (the profile module)
    owns it, and astro reads the caller's own birth row through
    apps.profiles.services. The fixture keeps its name (every astro test
    asks for it) and its contract — a profiles table scoped to this test —
    but now that means an empty real table."""
    Profile.objects.all().delete()
    yield


def insert_profile(user_id=TEST_USER, **overrides):
    row = dict(BIRTH, **overrides)
    Profile.objects.update_or_create(
        id=user_id,
        defaults=dict(
            phone=f"+{str(user_id).replace('-', '')}",  # unique per uuid; never read here
            name="Chart Person",
            birth_date=row["birth_date"],
            birth_time=row["birth_time"],
            birth_time_known=row["birth_time_known"],
            birth_lat=row["birth_lat"],
            birth_lon=row["birth_lon"],
            birth_zone=row["birth_zone"],
        ),
    )


@pytest.fixture
def user_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


@pytest.fixture
def frozen_utcnow(monkeypatch):
    """Freeze the service clock at 2026-09-19 01:00 UTC = 06:30 IST, so
    'today' is 2026-09-19 in IST and yesterday/tomorrow are deterministic."""
    moment = datetime(2026, 9, 19, 1, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(services, "_utcnow", lambda: moment)
    return moment


def shift(days):
    return (datetime(2026, 9, 19, 1, 0, tzinfo=timezone.utc) + timedelta(days=days)).date().isoformat()


def assert_no_secret_leak(body_text):
    assert "freeastroapi" not in body_text
    assert "FREE_ASTRO_API_KEY" not in body_text
    assert "x-api-key" not in body_text


@pytest.mark.django_db
class TestProviderInterface:
    """The ABC contract: MockProvider is a real AstroProvider, the ABC itself
    cannot be instantiated, and the mock is deterministic — same input, same
    output, no clock."""

    def test_mock_provider_satisfies_the_abc(self):
        assert isinstance(MockProvider(), AstroProvider)

    def test_abc_cannot_be_instantiated(self):
        with pytest.raises(TypeError):
            AstroProvider()

    def test_mock_chart_is_deterministic(self):
        body = services.birth_body(BIRTH)
        first = MockProvider().chart(body)
        second = MockProvider().chart(body)
        assert first == second  # a fresh instance must answer identically

    def test_mock_chart_varies_with_input(self):
        other = dict(BIRTH, birth_date="1988-01-02")
        assert MockProvider().chart(services.birth_body(BIRTH)) != MockProvider().chart(
            services.birth_body(other)
        )

    def test_mock_canonical_births_land_in_their_rashis(self):
        # The service refuses when a canonical chart's Moon is not in its
        # rashi; the mock must not trip that check for any of the twelve.
        provider = MockProvider()
        for rashi, birth in services.CANONICAL_BIRTHS.items():
            payload = provider.chart({**birth, **services.CANONICAL_PLACE, **services.RECKONING})
            assert services.moon_sign(payload) == rashi, rashi

    def test_mock_panchang_and_horoscope_shapes(self):
        provider = MockProvider()
        p = provider.panchang({**services.date_parts("2026-09-19"), "lat": 23.1765,
                               "lng": 75.7885, "tz_str": "Asia/Kolkata", **services.RECKONING})
        assert p["weekday"]["name"] and p["tithi"]["name"] and p["nakshatra"]["name"]
        assert p["sunrise"] and p["sunset"] and p["rahu_kalam"]["start"]
        assert p["request_time_panchang"]["moon_sign"]["name"] in services.CANONICAL_BIRTHS
        h = provider.daily_horoscope({"target_date": "2026-09-19"})
        assert h["meta"]["target_date"] == "2026-09-19"
        assert h["narrative"]["best_use"] and h["timing"]["rahu_kalam"]["end"]

    def test_real_provider_never_leaks_key_or_url_on_failure(self, monkeypatch):
        # requests exceptions embed the URL in their message; the provider
        # must swallow them whole and raise its generic refusal instead.
        def timeout_post(*args, **kwargs):
            raise requests.ConnectionError(
                "HTTPSConnectionPool(host='api.freeastroapi.com', port=443): timed out."
            )

        monkeypatch.setattr("apps.astro.providers.requests.post", timeout_post)
        provider = FreeAstroApiProvider("super-secret-key")
        with pytest.raises(UpstreamError) as excinfo:
            provider.chart({"year": 1990})
        assert str(excinfo.value) == "unreachable"
        assert "super-secret-key" not in str(excinfo.value)
        assert "freeastroapi" not in str(excinfo.value)

    def test_real_provider_requires_a_key(self):
        with pytest.raises(UpstreamError):
            FreeAstroApiProvider("")


@pytest.mark.django_db
class TestKeysAndDates:
    """Cache-key construction and the date clamp — the no-TTL design's whole
    freshness story."""

    def test_ist_today_and_the_clamp(self, frozen_utcnow):
        assert services.ist_today() == "2026-09-19"
        assert services.allowed_date(None) == "2026-09-19"
        assert services.allowed_date("") == "2026-09-19"
        assert services.allowed_date("2026-09-18") == "2026-09-18"  # yesterday
        assert services.allowed_date("2026-09-19") == "2026-09-19"
        assert services.allowed_date("2026-09-20") == "2026-09-20"  # tomorrow
        assert services.allowed_date("2026-09-21") is None  # walked the calendar
        assert services.allowed_date("2026-09-17") is None
        assert services.allowed_date("not-a-date") is None

    def test_birth_digest_matches_sha256_first_8_bytes(self):
        # Independent recomputation of the edge function's digest: the six
        # columns joined with '|' in its order, JS String() rendering.
        material = "1990-04-17|14:30:00|true|23.1765|75.7885|Asia/Kolkata"
        expected = hashlib.sha256(material.encode()).digest()[:8].hex()
        assert services.birth_digest(BIRTH) == expected

    def test_every_birth_column_moves_the_digest(self):
        base = services.birth_digest(BIRTH)
        variants = [
            dict(BIRTH, birth_time="14:31:00"),
            dict(BIRTH, birth_date="1990-04-18"),
            dict(BIRTH, birth_time_known=False),
            dict(BIRTH, birth_lat=23.1766),
            dict(BIRTH, birth_lon=75.7886),
            dict(BIRTH, birth_zone="Asia/Dhaka"),
        ]
        assert len({services.birth_digest(v) for v in variants} | {base}) == 7

    def test_unknown_birth_time_substitutes_noon_but_reports_time_unknown(self):
        body = services.birth_body(dict(BIRTH, birth_time=None, birth_time_known=False))
        assert (body["hour"], body["minute"]) == (12, 0)
        assert services.time_known(dict(BIRTH, birth_time=None, birth_time_known=False)) is False
        assert services.time_known(BIRTH) is True

    def test_memo_has_no_ttl_rows_do_not_expire(self, provider, frozen_utcnow, monkeypatch):
        # 019's deliberate design: no TTL, no sweeper. A row is served for
        # its key no matter how much time passes — freshness lives in the key.
        payload, cached = services.memo("probe:no-expiry", lambda: {"answer": 1})
        assert cached is False and payload == {"answer": 1}

        later = datetime(2026, 9, 23, 1, 0, tzinfo=timezone.utc)  # four days on
        monkeypatch.setattr(services, "_utcnow", lambda: later)
        payload, cached = services.memo("probe:no-expiry", lambda: {"answer": 2})

        assert cached is True
        assert payload == {"answer": 1}  # the original row, not a recompute
        assert provider.calls["panchang"] == 0


@pytest.mark.django_db
class TestCacheShape:
    """The 019 check's table invariants in pytest."""

    def test_row_shape_and_write(self, provider, frozen_utcnow):
        services.panchang("2026-09-19")
        row = AstroCache.objects.get()
        assert row.key == "panchang:2026-09-19"
        assert row.payload["weekday"]["name"] == "Saturday"
        assert row.fetched_at is not None

    def test_same_key_twice_is_one_row(self, provider, frozen_utcnow):
        services.panchang("2026-09-19")
        services.panchang("2026-09-19")
        assert AstroCache.objects.count() == 1
        assert provider.calls["panchang"] == 1  # the second call was a hit


@pytest.mark.django_db
class TestPanchang:
    def test_anonymous_and_signed_in_both_read(self, api_client, provider, user_token, frozen_utcnow):
        anon = api_client.get("/v1/astro/panchang/")
        assert anon.status_code == 200
        body = anon.json()
        assert body["ok"] is True
        assert body["city"] == "Ujjain"  # the anchor is always named
        assert body["date"] == "2026-09-19"
        assert body["data"]["weekday"]["name"] == "Saturday"
        assert "key" not in json.dumps(body)  # never a raw cache row

        authed = api_client.get("/v1/astro/panchang/", **auth(user_token))
        assert authed.status_code == 200
        assert authed.json()["data"] == body["data"]  # one row a day for everybody

    def test_date_param_and_clamp(self, api_client, provider, frozen_utcnow):
        yesterday = api_client.get("/v1/astro/panchang/?date=2026-09-18")
        assert yesterday.status_code == 200
        assert yesterday.json()["date"] == "2026-09-18"

        walked = api_client.get("/v1/astro/panchang/?date=2026-09-22")
        assert walked.status_code == 400
        assert walked.json()["reason"] == "invalid"

    def test_second_call_is_a_cache_hit(self, api_client, provider, frozen_utcnow):
        first = api_client.get("/v1/astro/panchang/")
        second = api_client.get("/v1/astro/panchang/")
        assert first.json()["cached"] is False
        assert second.json()["cached"] is True
        assert provider.calls["panchang"] == 1

    def test_one_key_a_day_for_everybody(self, api_client, provider, frozen_utcnow):
        api_client.get("/v1/astro/panchang/")
        api_client.get("/v1/astro/panchang/", **auth("x" * 30))
        # the key carries no user — a signed-in caller and anon share the row
        assert list(AstroCache.objects.values_list("key", flat=True)) == ["panchang:2026-09-19"]
        assert provider.calls["panchang"] == 1

    def test_provider_failure_is_a_clean_502(self, api_client, monkeypatch, frozen_utcnow):
        monkeypatch.setattr(services, "get_provider", FailingProvider)
        response = api_client.get("/v1/astro/panchang/")
        assert response.status_code == 502
        body = response.json()
        assert body["ok"] is False and body["reason"] == "upstream"
        assert "Try again shortly" in body["message"]
        assert_no_secret_leak(response.content.decode())


@pytest.mark.django_db
class TestGeo:
    def test_anonymous_search_ranks_and_dedups(self, api_client, provider):
        response = api_client.get("/v1/astro/geo/?q=Pune")
        assert response.status_code == 200
        results = response.json()["results"]
        populations = [r["population"] for r in results]
        assert populations == sorted(populations, reverse=True)  # largest first
        rendered = {
            (r["name"], r["district"], r["state"], round(r["lat"], 2), round(r["lng"], 2))
            for r in results
        }
        assert len(rendered) == len(results)  # no two rows render identically
        assert provider.calls["geo_search"] == 1

    def test_short_query_refused(self, api_client, provider):
        response = api_client.get("/v1/astro/geo/?q=a")
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"
        assert provider.calls["geo_search"] == 0  # nothing upstream for a refused query

    def test_provider_failure_message(self, api_client, monkeypatch):
        monkeypatch.setattr(services, "get_provider", FailingProvider)
        response = api_client.get("/v1/astro/geo/?q=Varanasi")
        assert response.status_code == 502
        body = response.json()
        assert body["reason"] == "upstream"
        assert body["message"] == "Could not reach place search. Try again."
        assert_no_secret_leak(response.content.decode())

    def test_missing_key_is_500_not_502(self, api_client, settings, monkeypatch, frozen_utcnow):
        settings.ASTRO_PROVIDER = "freeastroapi"
        settings.FREE_ASTRO_API_KEY = ""
        response = api_client.get("/v1/astro/geo/?q=Pune")
        assert response.status_code == 500
        assert response.json()["reason"] == "upstream"
        assert_no_secret_leak(response.content.decode())


@pytest.mark.django_db
class TestChart:
    def test_signed_in_user_gets_their_chart(self, api_client, provider, user_token,
                                             profiles_table, frozen_utcnow):
        insert_profile()
        response = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True and body["time_known"] is True
        assert {p["name"] for p in body["data"]["planets"]} >= {"Sun", "Moon", "Rahu", "Ketu"}
        assert len(body["data"]["houses"]) == 12
        # the cache key is chart:<id>:<digest> — deterministic per birth
        row = AstroCache.objects.get()
        assert row.key == f"chart:{TEST_USER}:{services.birth_digest(BIRTH)}"

    def test_second_call_is_served_from_postgres(self, api_client, provider, user_token,
                                                 profiles_table, frozen_utcnow):
        insert_profile()
        first = api_client.get("/v1/astro/chart/", **auth(user_token))
        second = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert first.json()["cached"] is False
        assert second.json()["cached"] is True
        assert provider.calls["chart"] == 1
        assert second.json()["data"] == first.json()["data"]

    def test_unknown_birth_time_suppresses_nothing_but_says_so(self, api_client, provider,
                                                               user_token, profiles_table,
                                                               frozen_utcnow):
        insert_profile(birth_time=None, birth_time_known=False)
        response = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert response.status_code == 200
        assert response.json()["time_known"] is False  # the caller decides what to hide

    def test_edited_birth_details_miss_and_recompute(self, api_client, provider, user_token,
                                                     profiles_table, frozen_utcnow):
        insert_profile()
        api_client.get("/v1/astro/chart/", **auth(user_token))
        Profile.objects.filter(pk=TEST_USER).update(birth_time="15:45:00")
        response = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert response.status_code == 200
        assert provider.calls["chart"] == 2  # new digest, new key, one more upstream call
        assert AstroCache.objects.count() == 2  # both rows stay; nothing is stale, only unused

    def test_no_birth_row_is_409_not_500(self, api_client, provider, user_token,
                                         profiles_table, frozen_utcnow):
        response = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert response.status_code == 409
        body = response.json()
        assert body["ok"] is False and body["reason"] == "no_birth"
        assert body["message"] == "Add your birth details to see your chart."

    def test_partial_birth_row_is_also_no_birth(self, api_client, provider, user_token,
                                                profiles_table, frozen_utcnow):
        insert_profile(birth_lat=None, birth_lon=None)
        response = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert response.status_code == 409
        assert response.json()["reason"] == "no_birth"

    def test_profile_read_failure_is_500_unavailable(self, api_client, provider,
                                                     user_token, profiles_table,
                                                     frozen_utcnow, monkeypatch):
        # The table is always there now (module 9 owns it), so a FAILED read
        # is simulated at the seam: the profiles read raising must not read
        # as an absent row.
        def boom(user_id):
            raise RuntimeError("database gone")

        monkeypatch.setattr(profile_services, "get_birth_details", boom)
        response = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert response.status_code == 500
        assert response.json()["reason"] == "unavailable"

    def test_anonymous_is_401(self, api_client, provider, profiles_table, frozen_utcnow):
        insert_profile()
        response = api_client.get("/v1/astro/chart/")
        assert response.status_code == 401
        assert response.json()["reason"] == "unauthenticated"
        assert AstroCache.objects.count() == 0

    def test_bad_date_refused_before_any_upstream(self, api_client, provider, user_token,
                                                  profiles_table, frozen_utcnow):
        insert_profile()
        response = api_client.get("/v1/astro/chart/?date=2027-01-01", **auth(user_token))
        assert response.status_code == 400
        assert provider.calls["chart"] == 0

    def test_upstream_failure_is_clean(self, api_client, monkeypatch, user_token,
                                       profiles_table, frozen_utcnow):
        monkeypatch.setattr(services, "get_provider", FailingProvider)
        insert_profile()
        response = api_client.get("/v1/astro/chart/", **auth(user_token))
        assert response.status_code == 502
        assert response.json()["reason"] == "upstream"
        assert_no_secret_leak(response.content.decode())
        assert AstroCache.objects.count() == 0  # failures are never cached


@pytest.mark.django_db
class TestHoroscope:
    def test_reading_carries_its_rashi(self, api_client, provider, user_token,
                                       profiles_table, frozen_utcnow):
        insert_profile()
        chart_response = api_client.get("/v1/astro/chart/", **auth(user_token))
        chart_data = chart_response.json()["data"]
        expected_rashi = services.moon_sign(chart_data)

        response = api_client.get("/v1/astro/horoscope/", **auth(user_token))
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["rashi"] == expected_rashi  # named on the response, as the function did
        assert body["date"] == "2026-09-19"
        assert body["data"]["meta"]["target_date"] == "2026-09-19"
        assert body["data"]["narrative"]["best_use"]
        assert body["data"]["timing"]["rahu_kalam"]["start"]

        keys = set(AstroCache.objects.values_list("key", flat=True))
        assert f"rashifal:{expected_rashi}:2026-09-19" in keys
        assert f"canon-chart:{expected_rashi}" in keys
        # two chart fetches total: the reader's and their rashi's canonical
        # one — the reader's chart was the memoised pick, not a recompute
        assert provider.calls["chart"] == 2

    def test_readers_share_canonical_and_rashifal_rows(self, api_client, provider,
                                                       sign_hs256, hs256_mode,
                                                       profiles_table,
                                                       frozen_utcnow):
        # Twelve distinct births produce at most twelve rashis; whatever the
        # mock's moons pick, the canonical charts and day-rows are shared —
        # one row per rashi per day, not one per reader.
        rashis = set()
        for index in range(12):
            birth = dict(
                BIRTH,
                birth_date=f"199{index % 10}-0{(index % 8) + 1}-{(index % 27) + 1:02d}",
                birth_time=f"{index:02d}:{(index * 5) % 60:02d}:00",
            )
            sub = f"00000000-0000-4000-8000-{index:012d}"
            token = sign_hs256(claims=make_claims(sub=sub))
            insert_profile(
                user_id=sub,
                birth_date=birth["birth_date"],
                birth_time=birth["birth_time"],
            )
            response = api_client.get("/v1/astro/horoscope/", **auth(token))
            assert response.status_code == 200, response.content
            rashis.add(response.json()["rashi"])

        keys = list(AstroCache.objects.values_list("key", flat=True))
        rashifal_rows = [k for k in keys if k.startswith("rashifal:")]
        canon_rows = [k for k in keys if k.startswith("canon-chart:")]
        assert len(rashifal_rows) == len(rashis)       # one reading row per rashi, shared
        assert len(canon_rows) == len(rashis)          # each canonical chart fetched once
        assert all(k.endswith(":2026-09-19") for k in rashifal_rows)

        calls_after_first_round = dict(provider.calls)
        repeat = api_client.get("/v1/astro/horoscope/", **auth(token))
        assert repeat.status_code == 200
        assert provider.calls == calls_after_first_round  # every read was a cache hit

    def test_second_call_hits_the_rashifal_row(self, api_client, provider, user_token,
                                               profiles_table, frozen_utcnow):
        insert_profile()
        api_client.get("/v1/astro/horoscope/", **auth(user_token))
        calls_after_first = dict(provider.calls)
        second = api_client.get("/v1/astro/horoscope/", **auth(user_token))
        assert second.json()["cached"] is True
        assert provider.calls == calls_after_first  # nothing upstream at all

    def test_canonical_moon_mismatch_is_a_refusal(self, api_client, provider, user_token,
                                                  profiles_table, frozen_utcnow):
        insert_profile()
        # A drifted canonical birth would hand every reader of one rashi the
        # neighbour's reading, forever, silently — poison every canon row with
        # a Moon one sign off and whichever rashi the reader's chart picks
        # must refuse, not guess.
        from apps.astro.providers import SIGNS

        for index, rashi in enumerate(services.CANONICAL_BIRTHS):
            wrong_sign = SIGNS[(SIGNS.index(rashi) + 1) % 12]
            AstroCache.objects.create(
                key=f"canon-chart:{rashi}", payload={"planets": [{"name": "Moon", "sign": wrong_sign}]}
            )
        response = api_client.get("/v1/astro/horoscope/", **auth(user_token))
        assert response.status_code == 502
        assert response.json()["reason"] == "upstream"

    def test_auth_and_birth_matrix(self, api_client, provider, sign_hs256, hs256_mode,
                                   profiles_table, frozen_utcnow):
        # anonymous: 401 before anything else happens
        assert api_client.get("/v1/astro/horoscope/").status_code == 401
        assert AstroCache.objects.count() == 0
        # well-formed token, no birth row: 409, and nothing was computed for them
        token = sign_hs256(claims=make_claims())
        response = api_client.get("/v1/astro/horoscope/", **auth(token))
        assert response.status_code == 409
        assert response.json()["reason"] == "no_birth"
        assert provider.calls["chart"] == 0
        # and the refusal bodies carry no birth-derived data
        assert_no_secret_leak(response.content.decode())


@pytest.mark.django_db
class TestServiceRoleOnly:
    """019's core invariant ported: astro_cache is reachable only through the
    service layer — no endpoint exposes a raw row, and no cache route exists."""

    def test_no_cache_route(self, api_client, user_token):
        for method in ("get", "post"):
            response = getattr(api_client, method)("/v1/astro/cache/", **auth(user_token))
            assert response.status_code == 404

    def test_responses_never_expose_row_metadata(self, api_client, provider, user_token,
                                                 profiles_table, frozen_utcnow):
        insert_profile()
        for url in ("/v1/astro/panchang/", "/v1/astro/chart/", "/v1/astro/horoscope/"):
            response = api_client.get(url, **auth(user_token))
            text = response.content.decode()
            assert '"key"' not in text
            assert "fetched_at" not in text


@pytest.mark.django_db(transaction=True)
class TestConcurrentMiss:
    """Two simultaneous misses for one key = ONE upstream call, one row."""

    def _fire(self, barrier, results):
        connection.close()  # each thread gets its own connection
        client = Client()
        barrier.wait(timeout=10)
        results.append(client.get("/v1/astro/panchang/"))

    def test_two_readers_one_upstream_call(self, provider, frozen_utcnow):
        barrier = threading.Barrier(2)
        results = []
        threads = [threading.Thread(target=self._fire, args=(barrier, results)) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)

        assert sorted(r.status_code for r in results) == [200, 200]
        assert provider.calls["panchang"] == 1  # the loser waited, not recomputed
        assert AstroCache.objects.count() == 1  # the unique key collapsed the race
        assert results[0].json()["data"] == results[1].json()["data"]
