"""Numerology (docs/02-TRD.md §8): the second vendor, and the cache.

What is worth testing here is not the arithmetic — that is the vendor's —
but the three rules around it:

  the key   -> a reading is a function of a NAME and a DATE and of nothing
               else, so it carries no account id and two people asking about
               the same name share one upstream call
  the name  -> the caller gives it, because numerology counts the name as
               given at birth and the profile may hold another one; spacing
               and case must not split the cache
  refusals  -> a missing birth DATE is a 409 that asks for a date, not for a
               birthplace: this endpoint never touches a coordinate
"""

import pytest

from apps.astro import numerology as numero
from apps.astro.models import AstroCache
from apps.astro.providers import UpstreamError
from apps.profiles.models import Profile

from .conftest import TEST_USER, make_claims

BIRTH_DATE = "1990-04-17"


class CountingProvider(numero.MockNumerologyProvider):
    """The mock, with a call counter: the point of the cache is that the
    second reader costs nothing."""

    def __init__(self):
        self.calls = 0

    def profile(self, name, day, month, year, lang):
        self.calls += 1
        return super().profile(name, day, month, year, lang)


class FailingProvider(numero.MockNumerologyProvider):
    def profile(self, name, day, month, year, lang):
        raise UpstreamError("refused")


@pytest.fixture
def provider(monkeypatch):
    counting = CountingProvider()
    monkeypatch.setattr(numero, "get_provider", lambda: counting)
    return counting


@pytest.fixture
def user_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


@pytest.fixture(autouse=True)
def clean(db):
    Profile.objects.all().delete()
    AstroCache.objects.all().delete()
    yield


def insert_profile(user_id=TEST_USER, name="Ravi Kumar", birth_date=BIRTH_DATE):
    Profile.objects.update_or_create(
        id=user_id,
        defaults=dict(phone=f"+{str(user_id).replace('-', '')}", name=name, birth_date=birth_date),
    )


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.mark.django_db
class TestService:
    def test_a_reading_is_cached_forever_and_shared(self, provider):
        first, cached_first = numero.numerology("Ravi Kumar", BIRTH_DATE)
        second, cached_second = numero.numerology("Ravi Kumar", BIRTH_DATE)
        assert (cached_first, cached_second) == (False, True)
        assert first == second
        assert provider.calls == 1
        # No account id in the key: the answer belongs to a name and a date.
        key = AstroCache.objects.get().key
        assert key.startswith("numerology:")
        assert str(TEST_USER) not in key and "Ravi" not in key and "1990" not in key

    def test_spacing_and_case_do_not_split_the_cache(self, provider):
        numero.numerology("Ravi Kumar", BIRTH_DATE)
        numero.numerology("  ravi   kumar ", BIRTH_DATE)
        assert provider.calls == 1
        assert AstroCache.objects.count() == 1

    def test_a_different_name_date_or_language_is_a_different_reading(self, provider):
        numero.numerology("Ravi Kumar", BIRTH_DATE)
        numero.numerology("Ravi Kumar Singh", BIRTH_DATE)
        numero.numerology("Ravi Kumar", "1991-04-17")
        numero.numerology("Ravi Kumar", BIRTH_DATE, lang="hi")
        assert provider.calls == 4
        assert AstroCache.objects.count() == 4

    def test_the_numbers_that_are_arithmetic_are_right(self):
        # The mock computes the two that are plain digit sums, so a screen
        # built against it is not built against nonsense.
        #   radical: the birth day, 17 -> 1+7 -> 8
        #   destiny: 17 + 4 + (1+9+9+0 = 19) = 40 -> 4+0 -> 4
        payload, _ = numero.numerology("Ravi Kumar", BIRTH_DATE)
        assert payload["table"]["radical_number"] == 8
        assert payload["table"]["destiny_number"] == 4
        assert payload["numbers"]["lifepath_number"] == 4

    def test_master_numbers_are_not_reduced(self):
        assert numero._reduce(29) == 11   # 2+9 = 11, and 11 stays 11
        assert numero._reduce(39) == 3    # 3+9 = 12 -> 3
        assert numero._reduce(4) == 4


@pytest.mark.django_db
class TestEndpoint:
    URL = "/v1/astro/numerology/"

    def test_it_reads_the_profile_name_and_birth_date(self, api_client, provider, user_token):
        insert_profile()
        response = api_client.get(self.URL, **auth(user_token))
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["ok"] is True
        assert body["name"] == "Ravi Kumar"
        assert body["birth_date"] == BIRTH_DATE
        assert body["lang"] == "en" and body["cached"] is False
        assert body["data"]["table"]["destiny_number"]
        assert body["data"]["numbers"]["lifepath_number"]

    def test_a_typed_name_wins(self, api_client, provider, user_token):
        # The name on the row is the married one; numerology counts the one
        # given at birth, and only the caller knows which that is.
        insert_profile(name="Ravi Kumar Shah")
        body = api_client.get(f"{self.URL}?name=Ravi%20Kumar", **auth(user_token)).json()
        assert body["name"] == "Ravi Kumar"
        assert provider.calls == 1

    def test_hindi_is_a_different_reading(self, api_client, provider, user_token):
        insert_profile()
        api_client.get(self.URL, **auth(user_token))
        body = api_client.get(f"{self.URL}?lang=hi", **auth(user_token)).json()
        assert body["lang"] == "hi"
        assert provider.calls == 2

    def test_two_people_with_one_name_and_date_share_the_row(
        self, api_client, provider, sign_hs256, hs256_mode,
    ):
        for index in range(2):
            sub = f"00000000-0000-4000-8000-{index:012d}"
            insert_profile(user_id=sub)
            token = sign_hs256(claims=make_claims(sub=sub))
            assert api_client.get(self.URL, **auth(token)).status_code == 200
        assert provider.calls == 1
        assert AstroCache.objects.count() == 1

    def test_no_birth_date_asks_for_a_date_not_a_birthplace(
        self, api_client, provider, user_token,
    ):
        insert_profile(birth_date=None)
        response = api_client.get(self.URL, **auth(user_token))
        assert response.status_code == 409
        body = response.json()
        assert body["reason"] == "no_birth"
        # This endpoint never touches a coordinate, so it must not send
        # somebody off to fix a birthplace that is not its business.
        assert "date" in body["message"].lower()
        assert "place" not in body["message"].lower()
        assert provider.calls == 0

    def test_a_profile_with_no_name_asks_for_one(self, api_client, provider, user_token):
        insert_profile(name="")
        response = api_client.get(self.URL, **auth(user_token))
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"
        assert provider.calls == 0

    def test_anonymous_is_401(self, api_client, provider):
        assert api_client.get(self.URL).status_code == 401

    def test_upstream_failure_is_a_clean_502(self, api_client, monkeypatch, user_token):
        insert_profile()
        monkeypatch.setattr(numero, "get_provider", FailingProvider)
        response = api_client.get(self.URL, **auth(user_token))
        assert response.status_code == 502
        text = response.content.decode()
        assert response.json()["reason"] == "upstream"
        # Rule 7: neither vendor's credentials nor its host in a response body.
        for secret in ("astrologyapi", "ASTROLOGY_API_KEY", "Basic ", "json.astrologyapi.com"):
            assert secret not in text
        assert AstroCache.objects.count() == 0  # failures are never cached
