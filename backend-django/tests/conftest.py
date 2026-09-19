import time
import uuid

import jwt as pyjwt
import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.core import jwks as jwks_module

from . import jwtutil

TEST_SUPABASE_URL = "https://test-project.supabase.co"
TEST_HS256_SECRET = "legacy-test-secret"
TEST_USER = "11111111-2222-3333-4444-555555555555"
OTHER_USER = "99999999-8888-7777-6666-555555555555"
TEST_KID = "test-signing-key-1"


def make_claims(sub=TEST_USER, role="authenticated", phone="+919999900001", **overrides):
    now = int(time.time())
    claims = {
        "sub": sub,
        "aud": "authenticated",
        "iss": f"{TEST_SUPABASE_URL}/auth/v1",
        "iat": now - 10,
        "exp": now + 3600,
        "phone": phone,
        "role": role,
    }
    claims.update(overrides)
    return claims


@pytest.fixture(scope="session")
def rsa_keypair():
    return jwtutil.generate_rsa_keypair()


@pytest.fixture(autouse=True)
def _reset_jwks_state():
    """Every test starts with an empty JWKS cache and empty Django cache."""
    jwks_module.reset_jwks_cache()
    cache.clear()
    yield
    jwks_module.reset_jwks_cache()
    cache.clear()


@pytest.fixture
def jwks_mode(settings):
    settings.SUPABASE_URL = TEST_SUPABASE_URL
    settings.SUPABASE_JWT_SECRET = ""
    return settings


@pytest.fixture
def hs256_mode(settings):
    settings.SUPABASE_URL = ""
    settings.SUPABASE_JWT_SECRET = TEST_HS256_SECRET
    return settings


@pytest.fixture
def sign_rs256(rsa_keypair):
    def _sign(claims=None, headers=None, keypair=None):
        return jwtutil.sign_rs256(
            keypair or rsa_keypair,
            claims if claims is not None else make_claims(),
            headers=headers if headers is not None else {"kid": TEST_KID},
        )

    return _sign


@pytest.fixture
def sign_hs256():
    def _sign(claims=None, secret=TEST_HS256_SECRET, headers=None):
        return pyjwt.encode(
            claims if claims is not None else make_claims(),
            secret,
            algorithm="HS256",
            headers=headers,
        )

    return _sign


class FakeJWKSResponse:
    def __init__(self, document):
        self._document = document

    def raise_for_status(self):
        return None

    def json(self):
        return self._document


@pytest.fixture
def jwks_document():
    """Holds the JWKS document the mocked fetcher serves; mutate per test."""
    return {"keys": []}


@pytest.fixture
def mock_jwks_fetch(monkeypatch, jwks_document):
    calls = []

    def fake_get(url, timeout=None):
        calls.append(url)
        return FakeJWKSResponse(jwks_document)

    monkeypatch.setattr(jwks_module.requests, "get", fake_get)
    return calls


@pytest.fixture
def active_jwks(jwks_document, rsa_keypair, mock_jwks_fetch):
    jwks_document["keys"] = [jwtutil.public_jwk(rsa_keypair, TEST_KID)]
    return jwks_document


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_headers():
    def _headers(token):
        return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    return _headers


@pytest.fixture
def authed_client(sign_hs256, hs256_mode):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {sign_hs256()}")
    return client
