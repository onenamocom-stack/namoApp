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
  - cache keys: panchang:<date>, chart:<id>:<digest>,
    horoscope:<id>:<digest>:<date>, match:<digest>:<digest>,
    muhurat:<purpose>:<lat>:<lng>:<zone>:<month> (and muhurat-me:<id>:…);
    the digest changes with any birth column
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
    SIGNS,
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
        self.calls = {
            "chart": 0, "panchang": 0, "daily_horoscope": 0, "geo_search": 0,
            "match": 0, "muhurat": 0, "muhurat_personal": 0,
        }
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

    def match(self, body):
        self._count("match")
        return super().match(body)

    def muhurat(self, body):
        self._count("muhurat")
        return super().muhurat(body)

    def muhurat_personal(self, body):
        self._count("muhurat_personal")
        return super().muhurat_personal(body)


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

    def match(self, body):
        raise UpstreamError("refused")

    def muhurat(self, body):
        raise UpstreamError("refused")

    def muhurat_personal(self, body):
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

    def test_mock_panchang_and_horoscope_shapes(self):
        provider = MockProvider()
        p = provider.panchang({**services.date_parts("2026-09-19"), "lat": 23.1765,
                               "lng": 75.7885, "tz_str": "Asia/Kolkata", **services.RECKONING})
        assert p["weekday"]["name"] and p["tithi"]["name"] and p["nakshatra"]["name"]
        assert p["sunrise"] and p["sunset"] and p["rahu_kalam"]["start"]
        assert p["request_time_panchang"]["moon_sign"]["name"] in SIGNS
        h = provider.daily_horoscope(
            {**services.birth_body(BIRTH), "target_date": "2026-09-19"}
        )
        assert h["meta"]["target_date"] == "2026-09-19"
        assert h["narrative"]["best_use"] and h["timing"]["rahu_kalam"]["end"]
        # the fields the full reading renders, all present (docs/02-TRD.md §8)
        assert h["theme"]["headline"] and h["narrative"]["summary"]
        assert 0 <= h["scores"]["overall"]["score"] <= 100
        assert len(h["sections"]) == 6 and h["remedy"]["simple_action"]

    def test_mock_reading_is_the_reader_s_own(self):
        # Two births, two readings — the whole point of the 22 Sep reversal.
        provider = MockProvider()
        mine = provider.daily_horoscope(
            {**services.birth_body(BIRTH), "target_date": "2026-09-19"}
        )
        theirs = provider.daily_horoscope(
            {**services.birth_body(dict(BIRTH, birth_date="1988-01-02")),
             "target_date": "2026-09-19"}
        )
        assert mine != theirs

    def test_mock_match_and_muhurat_shapes(self):
        provider = MockProvider()
        m = provider.match({
            "person1": services.birth_body(BIRTH),
            "person2": services.birth_body(dict(BIRTH, birth_date="1988-01-02")),
        })
        assert [k["id"] for k in m["ashtakoota"]["kootas"]] == [
            "varna", "vashya", "tara", "yoni", "graha_maitri", "gana", "bhakoot", "nadi",
        ]
        assert sum(k["max_score"] for k in m["ashtakoota"]["kootas"]) == 36
        assert 0 <= m["summary"]["total_score"] <= 36
        assert m["summary"]["minimum_traditional_threshold"] == 18
        assert set(m["doshas"]) == {"manglik", "nadi", "bhakoot"}

        body = {"purpose": "namkaran", "start_date": "2026-10-01",
                "end_date": "2026-10-31", "lat": 18.5, "lng": 73.9, "limit": 20}
        public = provider.muhurat(body)
        assert public["best_moment"] is None  # public search promotes nothing
        for window in public["best_windows"]:
            assert window["date"].startswith("2026-10")
            assert window["start"] < window["end"]
        personal = provider.muhurat_personal({**body, "subject": services.birth_body(BIRTH)})
        # A personal search either promotes a moment or says why it did not,
        # and the screen renders whichever it gets.
        assert personal["selection_explanation"]["headline"]
        assert (personal["best_moment"] is None) == (
            personal["selection_explanation"]["decision"] == "no_best_moment"
        )

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
    def test_the_reading_is_computed_from_the_readers_own_birth(
        self, api_client, provider, user_token, profiles_table, frozen_utcnow
    ):
        insert_profile()
        chart_response = api_client.get("/v1/astro/chart/", **auth(user_token))
        expected_rashi = services.moon_sign(chart_response.json()["data"])

        response = api_client.get("/v1/astro/horoscope/", **auth(user_token))
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["rashi"] == expected_rashi  # off their own chart, as before
        assert body["date"] == "2026-09-19"
        assert body["data"]["meta"]["target_date"] == "2026-09-19"
        # the fields that came back on 22 Sep, now that the birth is theirs
        assert body["data"]["theme"]["headline"]
        assert body["data"]["scores"]["overall"]["score"] >= 0
        assert body["data"]["sections"]

        # the key carries the reader and the day — not a rashi, and no
        # canonical chart was fetched for anybody
        keys = set(AstroCache.objects.values_list("key", flat=True))
        assert f"horoscope:{TEST_USER}:{services.birth_digest(BIRTH)}:2026-09-19" in keys
        assert not [k for k in keys if k.startswith(("canon-chart:", "rashifal:"))]
        assert provider.calls["chart"] == 1  # the reader's own, memoised

    def test_two_readers_get_two_readings(self, api_client, provider, sign_hs256,
                                          hs256_mode, profiles_table, frozen_utcnow):
        # The cost of the reversal, stated as a test: readings no longer
        # collapse onto twelve rows a day. One reader, one row, one call.
        readings = []
        for index in range(2):
            sub = f"00000000-0000-4000-8000-{index:012d}"
            token = sign_hs256(claims=make_claims(sub=sub))
            insert_profile(user_id=sub, birth_date=f"199{index}-04-17")
            response = api_client.get("/v1/astro/horoscope/", **auth(token))
            assert response.status_code == 200, response.content
            readings.append(response.json()["data"])

        assert readings[0] != readings[1]
        rows = [k for k in AstroCache.objects.values_list("key", flat=True)
                if k.startswith("horoscope:")]
        assert len(rows) == 2
        assert all(k.endswith(":2026-09-19") for k in rows)
        assert provider.calls["daily_horoscope"] == 2

    def test_second_call_hits_the_stored_reading(self, api_client, provider, user_token,
                                                 profiles_table, frozen_utcnow):
        insert_profile()
        api_client.get("/v1/astro/horoscope/", **auth(user_token))
        calls_after_first = dict(provider.calls)
        second = api_client.get("/v1/astro/horoscope/", **auth(user_token))
        assert second.json()["cached"] is True
        assert provider.calls == calls_after_first  # nothing upstream at all

    def test_corrected_birth_details_get_a_new_reading(self, api_client, provider,
                                                       user_token, profiles_table,
                                                       frozen_utcnow):
        insert_profile()
        first = api_client.get("/v1/astro/horoscope/", **auth(user_token))
        Profile.objects.filter(pk=TEST_USER).update(birth_time="15:45:00")
        second = api_client.get("/v1/astro/horoscope/", **auth(user_token))
        assert second.status_code == 200
        # the digest is in the key, so a corrected birth cannot be served
        # yesterday's answer
        assert second.json()["data"] != first.json()["data"]
        assert provider.calls["daily_horoscope"] == 2

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


OTHER = {
    "name": "Amma",
    "birth_date": "1992-08-03",
    "birth_time": "09:15:00",
    "birth_time_known": True,
    "birth_place": "Pune, Maharashtra, India",
    # Six decimals, the column's precision. The geocoder's eight round to
    # this at the door — apps/core/fields.py, covered in test_profiles.
    "birth_lat": "18.523222",
    "birth_lon": "73.875861",
    "birth_zone": "Asia/Kolkata",
}


def as_birth(subject):
    """The subject dict as services.match stores it — what subject_birth
    produces, for building the expected cache key in a test."""
    return {k: v for k, v in subject.items() if k != "name"}


@pytest.mark.django_db
class TestMatch:
    """Ashtakoota: the caller or a typed person against a typed person, and
    nothing typed is ever written down."""

    def test_me_against_a_typed_person(self, api_client, provider, user_token,
                                       profiles_table, frozen_utcnow):
        insert_profile()
        response = api_client.post(
            "/v1/astro/match/", {"person2": OTHER},
            content_type="application/json", **auth(user_token),
        )
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["ok"] is True and body["cached"] is False
        assert body["data"]["summary"]["max_score"] == 36
        assert len(body["data"]["ashtakoota"]["kootas"]) == 8
        assert body["time_known"] == {"person1": True, "person2": True}
        assert body["names"] == {"person1": None, "person2": "Amma"}
        assert provider.calls["match"] == 1

    def test_two_typed_people_need_no_birth_row(self, api_client, provider, user_token,
                                                profiles_table, frozen_utcnow):
        # A parent matching two other people: the caller's own row is never
        # read, so an empty profile is not a refusal here.
        response = api_client.post(
            "/v1/astro/match/",
            {"person1": dict(OTHER, name="Ravi"), "person2": OTHER},
            content_type="application/json", **auth(user_token),
        )
        assert response.status_code == 200, response.content
        assert response.json()["names"] == {"person1": "Ravi", "person2": "Amma"}

    def test_no_birth_row_refuses_the_me_slot(self, api_client, provider, user_token,
                                              profiles_table, frozen_utcnow):
        response = api_client.post(
            "/v1/astro/match/", {"person2": OTHER},
            content_type="application/json", **auth(user_token),
        )
        assert response.status_code == 409
        assert response.json()["reason"] == "no_birth"
        assert provider.calls["match"] == 0

    def test_nothing_about_the_typed_person_is_stored(self, api_client, provider,
                                                      user_token, profiles_table,
                                                      frozen_utcnow):
        insert_profile()
        api_client.post(
            "/v1/astro/match/", {"person2": OTHER},
            content_type="application/json", **auth(user_token),
        )
        # no profile row for them, and the cache key is two hashes: no name,
        # no date, no place, no account id (docs/01-PRD.md §4.4)
        assert Profile.objects.count() == 1
        key = AstroCache.objects.get(key__startswith="match:").key
        assert key == (
            f"match:{services.birth_digest(BIRTH)}:"
            f"{services.birth_digest(as_birth(OTHER))}"
        )
        assert "Amma" not in key and "1992" not in key and str(TEST_USER) not in key

    def test_the_order_is_part_of_the_answer(self, api_client, provider, user_token,
                                             profiles_table, frozen_utcnow):
        # Ashtakoota is not symmetric — Tara and Vashya read differently from
        # each side — so the reversed pair is a different key, not a hit.
        first = dict(OTHER, name="Ravi", birth_date="1989-01-23")
        second = OTHER
        for pair in ((first, second), (second, first)):
            response = api_client.post(
                "/v1/astro/match/", {"person1": pair[0], "person2": pair[1]},
                content_type="application/json", **auth(user_token),
            )
            assert response.status_code == 200, response.content
        assert provider.calls["match"] == 2
        assert AstroCache.objects.filter(key__startswith="match:").count() == 2

    def test_second_identical_match_is_a_cache_hit(self, api_client, provider, user_token,
                                                   profiles_table, frozen_utcnow):
        insert_profile()
        body = {"person2": OTHER}
        first = api_client.post("/v1/astro/match/", body,
                                content_type="application/json", **auth(user_token))
        second = api_client.post("/v1/astro/match/", body,
                                 content_type="application/json", **auth(user_token))
        assert second.json()["cached"] is True
        assert second.json()["data"] == first.json()["data"]
        assert provider.calls["match"] == 1

    def test_unknown_birth_time_is_reported_per_person(self, api_client, provider,
                                                       user_token, profiles_table,
                                                       frozen_utcnow):
        # The Moon crosses a nakshatra in about a day, and the kootas are read
        # off it, so a substituted noon has to be visible on the answer.
        insert_profile()
        response = api_client.post(
            "/v1/astro/match/",
            {"person2": dict(OTHER, birth_time=None, birth_time_known=False)},
            content_type="application/json", **auth(user_token),
        )
        assert response.status_code == 200, response.content
        assert response.json()["time_known"] == {"person1": True, "person2": False}

    def test_refusals(self, api_client, provider, user_token, profiles_table,
                      frozen_utcnow):
        insert_profile()
        # anonymous
        assert api_client.post("/v1/astro/match/", {"person2": OTHER},
                               content_type="application/json").status_code == 401
        # no second person
        missing = api_client.post("/v1/astro/match/", {},
                                  content_type="application/json", **auth(user_token))
        assert missing.status_code == 400 and missing.json()["reason"] == "invalid"
        # "I know the time" with no time given
        no_time = api_client.post(
            "/v1/astro/match/", {"person2": dict(OTHER, birth_time=None)},
            content_type="application/json", **auth(user_token),
        )
        assert no_time.status_code == 400
        assert provider.calls["match"] == 0
        assert AstroCache.objects.count() == 0

    def test_upstream_failure_is_clean(self, api_client, monkeypatch, user_token,
                                       profiles_table, frozen_utcnow):
        monkeypatch.setattr(services, "get_provider", FailingProvider)
        insert_profile()
        response = api_client.post("/v1/astro/match/", {"person2": OTHER},
                                   content_type="application/json", **auth(user_token))
        assert response.status_code == 502
        assert response.json()["reason"] == "upstream"
        assert_no_secret_leak(response.content.decode())


@pytest.mark.django_db
class TestMuhurat:
    """A purpose, a month and a place — shared by everybody in the same cell,
    unless it is judged against the caller's own chart."""

    URL = "/v1/astro/muhurat/?purpose=griha_pravesh&lat=18.5232&lng=73.8758"

    def test_public_search_is_shared_and_keyed_by_place_and_month(
        self, api_client, provider, user_token, profiles_table, frozen_utcnow
    ):
        response = api_client.get(self.URL, **auth(user_token))
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["ok"] is True and body["personal"] is False
        assert body["month"] == "2026-09" and body["purpose"] == "griha_pravesh"
        assert body["time_known"] is None
        for window in body["data"]["best_windows"]:
            assert window["date"].startswith("2026-09")
        # rounded to one decimal, about 11 km, so a city shares one row
        assert AstroCache.objects.get().key == "muhurat:griha_pravesh:18.5:73.9:Asia/Kolkata:2026-09"

    def test_a_neighbour_shares_the_row(self, api_client, provider, user_token,
                                        profiles_table, frozen_utcnow):
        api_client.get(self.URL, **auth(user_token))
        # 4 km away: the same cell, the same sunrise to within seconds
        api_client.get(
            "/v1/astro/muhurat/?purpose=griha_pravesh&lat=18.4987&lng=73.9012",
            **auth(user_token),
        )
        assert provider.calls["muhurat"] == 1
        assert AstroCache.objects.count() == 1

    def test_a_different_month_or_purpose_is_a_different_row(
        self, api_client, provider, user_token, profiles_table, frozen_utcnow
    ):
        api_client.get(self.URL, **auth(user_token))
        api_client.get(f"{self.URL}&month=2026-10", **auth(user_token))
        api_client.get(self.URL.replace("griha_pravesh", "namkaran"), **auth(user_token))
        assert provider.calls["muhurat"] == 3
        assert AstroCache.objects.count() == 3

    def test_mine_uses_the_callers_chart_and_is_theirs_alone(
        self, api_client, provider, user_token, profiles_table, frozen_utcnow
    ):
        insert_profile()
        response = api_client.get(f"{self.URL}&mine=1", **auth(user_token))
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["personal"] is True and body["time_known"] is True
        assert body["data"]["selection_explanation"]["headline"]
        assert provider.calls["muhurat_personal"] == 1
        assert provider.calls["muhurat"] == 0
        key = AstroCache.objects.get().key
        assert key.startswith(f"muhurat-me:{TEST_USER}:{services.birth_digest(BIRTH)}:")
        # and a second person's personal search does not read it
        api_client.get(self.URL, **auth(user_token))
        assert AstroCache.objects.count() == 2

    def test_mine_without_a_birth_row_is_409(self, api_client, provider, user_token,
                                             profiles_table, frozen_utcnow):
        response = api_client.get(f"{self.URL}&mine=1", **auth(user_token))
        assert response.status_code == 409
        assert response.json()["reason"] == "no_birth"
        assert provider.calls["muhurat_personal"] == 0

    def test_refusals_before_any_upstream(self, api_client, provider, user_token,
                                          profiles_table, frozen_utcnow):
        cases = [
            ("/v1/astro/muhurat/?lat=18.5&lng=73.9", "Say what the muhurat is for."),
            ("/v1/astro/muhurat/?purpose=wedding&lat=18.5&lng=73.9",
             "Say what the muhurat is for."),
            (f"{self.URL}&month=2027-04", "That month is outside what we compute."),
            (f"{self.URL}&month=2026-08", "That month is outside what we compute."),
            ("/v1/astro/muhurat/?purpose=namkaran", "Pick a place."),
            ("/v1/astro/muhurat/?purpose=namkaran&lat=99&lng=73.9", "Pick a place."),
        ]
        for url, message in cases:
            response = api_client.get(url, **auth(user_token))
            assert response.status_code == 400, url
            assert response.json()["message"] == message, url
        assert api_client.get(self.URL).status_code == 401  # anonymous
        assert provider.calls["muhurat"] == 0
        assert AstroCache.objects.count() == 0

    def test_upstream_failure_is_clean(self, api_client, monkeypatch, user_token,
                                       profiles_table, frozen_utcnow):
        monkeypatch.setattr(services, "get_provider", FailingProvider)
        response = api_client.get(self.URL, **auth(user_token))
        assert response.status_code == 502
        assert response.json()["reason"] == "upstream"
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
            # The row's own columns, not any field named "key" — the reading
            # has six sections and each carries one.
            assert "fetched_at" not in text
            for cache_key in AstroCache.objects.values_list("key", flat=True):
                assert cache_key not in text


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
