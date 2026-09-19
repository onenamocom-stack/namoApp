import time

import jwt
import pytest
from django.core.cache import cache

from apps.core import jwks as jwks_module

from . import jwtutil
from .conftest import TEST_KID, TEST_SUPABASE_URL, make_claims


@pytest.mark.django_db
class TestRS256EndToEnd:
    """Accept/reject paths through the real DRF stack, JWKS mocked."""

    def test_valid_token_accepted(self, api_client, jwks_mode, active_jwks, sign_rs256, auth_headers):
        response = api_client.get("/v1/me/", **auth_headers(sign_rs256()))
        assert response.status_code == 200
        assert response.json()["id"] == make_claims()["sub"]
        assert response.json()["phone"] == "+919999900001"
        assert response.json()["role"] == "authenticated"

    def test_expired_token_rejected(self, api_client, jwks_mode, active_jwks, sign_rs256, auth_headers):
        claims = make_claims(exp=int(time.time()) - 60)
        response = api_client.get("/v1/me/", **auth_headers(sign_rs256(claims)))
        assert response.status_code == 401
        assert response.json()["reason"] == "unauthenticated"

    def test_bad_signature_rejected(self, api_client, jwks_mode, active_jwks, sign_rs256, auth_headers):
        other = jwtutil.generate_rsa_keypair()
        token = sign_rs256(keypair=other)  # signed by a key JWKS does not hold
        response = api_client.get("/v1/me/", **auth_headers(token))
        assert response.status_code == 401

    def test_wrong_issuer_rejected(self, api_client, jwks_mode, active_jwks, sign_rs256, auth_headers):
        claims = make_claims(iss="https://evil.example.com/auth/v1")
        response = api_client.get("/v1/me/", **auth_headers(sign_rs256(claims)))
        assert response.status_code == 401

    def test_wrong_audience_rejected(self, api_client, jwks_mode, active_jwks, sign_rs256, auth_headers):
        claims = make_claims(aud="service_role")
        response = api_client.get("/v1/me/", **auth_headers(sign_rs256(claims)))
        assert response.status_code == 401

    def test_hs256_algorithm_rejected_in_jwks_mode(
        self, api_client, jwks_mode, active_jwks, sign_hs256, auth_headers
    ):
        # JWKS mode pins algorithms to RS256/ES256; an HS256 token must not
        # be decodable against a public key.
        response = api_client.get("/v1/me/", **auth_headers(sign_hs256()))
        assert response.status_code == 401

    def test_no_token_rejected(self, api_client, jwks_mode):
        response = api_client.get("/v1/me/")
        assert response.status_code == 401
        body = response.json()
        assert body == {
            "ok": False,
            "reason": "unauthenticated",
            "message": "Authentication credentials were not provided.",
        }

    def test_unknown_kid_rejected(self, api_client, jwks_mode, active_jwks, sign_rs256, auth_headers):
        token = sign_rs256(headers={"kid": "key-that-does-not-exist"})
        response = api_client.get("/v1/me/", **auth_headers(token))
        assert response.status_code == 401

    def test_jwks_fetch_failure_is_401_not_500(
        self, api_client, jwks_mode, monkeypatch, sign_rs256, auth_headers
    ):
        def boom(url, timeout=None):
            raise ConnectionError("no network in tests")

        monkeypatch.setattr(jwks_module.requests, "get", boom)
        response = api_client.get("/v1/me/", **auth_headers(sign_rs256()))
        assert response.status_code == 401

    def test_malformed_token_rejected(self, api_client, jwks_mode, active_jwks, auth_headers):
        response = api_client.get("/v1/me/", **auth_headers("not-a-jwt"))
        assert response.status_code == 401

    def test_kid_rotation_triggers_single_refetch(
        self, api_client, jwks_mode, active_jwks, mock_jwks_fetch, rsa_keypair, sign_rs256, auth_headers
    ):
        # First call caches the document; unknown kid forces exactly one
        # refetch, and a token signed by the rotated key then verifies.
        other = jwtutil.generate_rsa_keypair()
        token = sign_rs256(keypair=other, headers={"kid": "rotated-key"})
        response = api_client.get("/v1/me/", **auth_headers(token))
        assert response.status_code == 401  # rotated key not served yet
        fetch_calls = len(mock_jwks_fetch)
        assert fetch_calls == 2  # initial + one forced refetch

        active_jwks["keys"].append(jwtutil.public_jwk(other, "rotated-key"))
        response = api_client.get("/v1/me/", **auth_headers(token))
        assert response.status_code == 200
        assert len(mock_jwks_fetch) == fetch_calls + 1  # one more refetch, then cached


class TestJWKSCache:
    def test_caches_by_kid_for_ttl(self):
        fetches = []

        def fetcher(url):
            fetches.append(url)
            return {"keys": [{"kty": "RSA", "kid": TEST_KID, "n": "abc", "e": "AQAB"}]}

        jwks_cache = jwks_module.JWKSCache(
            jwks_url=f"{TEST_SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            ttl=3600,
            fetcher=fetcher,
        )
        key = jwks_cache.get_key(TEST_KID)
        assert key["kid"] == TEST_KID
        jwks_cache.get_key(TEST_KID)
        assert len(fetches) == 1

    def test_ttl_expiry_refetches(self):
        fetches = []

        def fetcher(url):
            fetches.append(url)
            return {"keys": [{"kty": "RSA", "kid": TEST_KID, "n": "abc", "e": "AQAB"}]}

        jwks_cache = jwks_module.JWKSCache(jwks_url="https://x/jwks", ttl=-1, fetcher=fetcher)
        jwks_cache.get_key(TEST_KID)
        jwks_cache.get_key(TEST_KID)
        assert len(fetches) == 2  # negative TTL: every read refetches

    def test_fetch_error_raises_jwks_fetch_error(self):
        def fetcher(url):
            raise TimeoutError("slow")

        jwks_cache = jwks_module.JWKSCache(jwks_url="https://x/jwks", fetcher=fetcher)
        with pytest.raises(jwks_module.JWKSFetchError):
            jwks_cache.get_key(TEST_KID)

    def test_empty_document_rejected(self):
        jwks_cache = jwks_module.JWKSCache(jwks_url="https://x/jwks", fetcher=lambda url: {"keys": []})
        with pytest.raises(jwks_module.JWKSFetchError):
            jwks_cache.get_key(TEST_KID)

    def test_unknown_kid_raises(self):
        document = {"keys": [{"kty": "RSA", "kid": "another", "n": "abc", "e": "AQAB"}]}
        jwks_cache = jwks_module.JWKSCache(jwks_url="https://x/jwks", fetcher=lambda url: document)
        with pytest.raises(jwks_module.JWKSFetchError):
            jwks_cache.get_key(TEST_KID)


class TestHS256Fallback:
    def test_hs256_token_accepted(self, api_client, hs256_mode, sign_hs256, auth_headers):
        response = api_client.get("/v1/me/", **auth_headers(sign_hs256()))
        assert response.status_code == 200

    def test_wrong_secret_rejected(self, api_client, hs256_mode, sign_hs256, auth_headers):
        response = api_client.get("/v1/me/", **auth_headers(sign_hs256(secret="wrong-secret")))
        assert response.status_code == 401

    def test_expired_hs256_rejected(self, api_client, hs256_mode, sign_hs256, auth_headers):
        import time as t

        response = api_client.get(
            "/v1/me/", **auth_headers(sign_hs256(claims=make_claims(exp=int(t.time()) - 10)))
        )
        assert response.status_code == 401

    def test_rs256_token_rejected_in_hs256_mode(
        self, api_client, hs256_mode, active_jwks, sign_rs256, auth_headers
    ):
        response = api_client.get("/v1/me/", **auth_headers(sign_rs256()))
        assert response.status_code == 401

    def test_no_verification_source_rejected(self, api_client, settings, sign_hs256, auth_headers):
        settings.SUPABASE_URL = ""
        settings.SUPABASE_JWT_SECRET = ""
        response = api_client.get("/v1/me/", **auth_headers(sign_hs256()))
        assert response.status_code == 401


class TestRSAVerifierInterop:
    """The pure-Python RSA verifier/signer interoperates with openssl."""

    @pytest.mark.skipif(not jwtutil.openssl_available(), reason="openssl not installed")
    def test_signature_verified_by_openssl(self, rsa_keypair):
        token = jwtutil.sign_rs256(rsa_keypair, make_claims(), headers={"kid": TEST_KID})
        assert jwtutil.verify_with_openssl(rsa_keypair, token)

    def test_app_verifier_accepts_signer(self, rsa_keypair):
        token = jwtutil.sign_rs256(rsa_keypair, make_claims(), headers={"kid": TEST_KID})
        header = jwt.get_unverified_header(token)
        _, payload, signing_input, signature = jwks_module._split_token(token)
        assert jwks_module.rsa_sha256_verify(
            signing_input, signature, rsa_keypair["n"], rsa_keypair["e"]
        )
        assert payload["sub"] == make_claims()["sub"]

    def test_app_verifier_rejects_wrong_key_and_tampering(self, rsa_keypair):
        token = jwtutil.sign_rs256(rsa_keypair, make_claims(), headers={"kid": TEST_KID})
        _, _, signing_input, signature = jwks_module._split_token(token)
        other = jwtutil.generate_rsa_keypair()
        assert not jwks_module.rsa_sha256_verify(signing_input, signature, other["n"], other["e"])
        assert not jwks_module.rsa_sha256_verify(
            signing_input + b"x", signature, rsa_keypair["n"], rsa_keypair["e"]
        )
