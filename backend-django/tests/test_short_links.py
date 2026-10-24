"""Short links for shares (24 Oct 2026): one code per path and referral
code, a redirect to our own site, nothing else."""

import pytest

from apps.content.models import ShortLink
from apps.profiles.models import Profile

from .conftest import TEST_USER, make_claims
from .test_astro import auth

REEL = "/reels/2f1c8a7e-93d4-4b1e-a6c2-5e0f7d9b1a34"


@pytest.fixture
def token(sign_hs256, hs256_mode, db):
    Profile.objects.create(id=TEST_USER, phone="9000000001", name="Tara Verma")
    return sign_hs256(claims=make_claims())


def _make(client, token, **body):
    return client.post("/v1/content/links/", body, format="json", **auth(token))


@pytest.mark.django_db
def test_the_same_share_gets_the_same_code(api_client, token, settings):
    settings.APP_PUBLIC_URL = "https://1namo.com"
    first = _make(api_client, token, path=REEL, ref="RAHUL123").json()
    again = _make(api_client, token, path=REEL, ref="RAHUL123").json()
    other = _make(api_client, token, path=REEL).json()
    assert first == again and len(first["code"]) == 6
    assert first["url"] == f"https://1namo.com/s/{first['code']}"
    assert other["code"] != first["code"] and ShortLink.objects.count() == 2


@pytest.mark.django_db
def test_the_short_address_sends_you_to_the_full_one(api_client, token, settings):
    settings.APP_PUBLIC_URL = "https://1namo.com"
    code = _make(api_client, token, path=REEL, ref="RAHUL123").json()["code"]
    got = api_client.get(f"/s/{code}")
    assert got.status_code == 302 and got["Location"] == f"https://1namo.com{REEL}?ref=RAHUL123"
    assert api_client.get("/s/zzzzzz").status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize("path", ["https://evil.test/x", "//evil.test", "reels/x", "/a b", "/x?y=1"])
def test_only_our_own_paths(api_client, token, path):
    assert _make(api_client, token, path=path).status_code == 400


@pytest.mark.django_db
def test_signed_out_cannot_make_one(api_client):
    assert api_client.post("/v1/content/links/", {"path": REEL}, format="json").status_code in (401, 403)
