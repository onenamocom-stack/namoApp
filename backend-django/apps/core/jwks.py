"""Supabase JWT verification (docs/07 §7 step 5).

Two modes, selected by environment:
  - SUPABASE_URL set      -> RS256/ES256 against Supabase's JWKS endpoint,
                             cached by kid (1h TTL, thread-safe).
  - SUPABASE_JWT_SECRET   -> HS256 against the shared secret (legacy projects).

Dependency note: PyJWT's asymmetric algorithms need the `cryptography`
package, which is deliberately not an M1 dependency. RS256 is therefore
verified here in pure Python (PKCS#1 v1.5 + SHA-256 over the JWK's n/e) —
deterministic and testable against openssl-generated signatures. ES256
routes through PyJWK and requires `pip install PyJWT[crypto]` at deploy
time; without it the error is explicit, not silent.
"""

import base64
import hashlib
import hmac
import threading
import time

import jwt
import requests
from django.conf import settings
from django.core.cache import cache
from jwt.exceptions import InvalidTokenError

RSA_PKCS1_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")


class JWKSFetchError(Exception):
    pass


def _b64url_uint(value):
    return int.from_bytes(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)), "big")


def rsa_sha256_verify(signing_input: bytes, signature: bytes, n: int, e: int) -> bool:
    """PKCS#1 v1.5 RSA signature verification, pure Python."""
    k = (n.bit_length() + 7) // 8
    if len(signature) != k:
        return False
    digest = hashlib.sha256(signing_input).digest()
    expected = (
        b"\x00\x01"
        + b"\xff" * (k - len(digest) - len(RSA_PKCS1_PREFIX) - 3)
        + b"\x00"
        + RSA_PKCS1_PREFIX
        + digest
    )
    actual = pow(int.from_bytes(signature, "big"), e, n).to_bytes(k, "big")
    return hmac.compare_digest(actual, expected)


class JWKSCache:
    """Fetches and caches Supabase's JWKS, keyed by kid, thread-safe.

    Cache entry shape: {"fetched_at": epoch, "keys": {kid: jwk dict}}.
    A 1-hour TTL bounds staleness when Supabase rotates keys; an unknown kid
    forces one refetch before failing, which covers rotation inside the TTL.
    """

    def __init__(self, jwks_url=None, ttl=None, fetcher=None):
        self.jwks_url = jwks_url or f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        self.ttl = ttl if ttl is not None else settings.JWKS_CACHE_TTL_SECONDS
        self._fetcher = fetcher or self._default_fetch
        self._lock = threading.Lock()

    def _default_fetch(self, url):
        response = requests.get(url, timeout=5)
        response.raise_for_status()
        return response.json()

    def get_key(self, kid):
        keys = self._get_keys(force_refresh=False)
        jwk = keys.get(kid)
        if jwk is None:
            keys = self._get_keys(force_refresh=True)
            jwk = keys.get(kid)
        if jwk is None:
            raise JWKSFetchError(f"no JWKS key for kid {kid!r}")
        return jwk

    def _get_keys(self, force_refresh):
        with self._lock:
            entry = None if force_refresh else cache.get(self._cache_key())
            if entry is None or time.time() - entry["fetched_at"] > self.ttl:
                entry = {"fetched_at": time.time(), "keys": self._load()}
                cache.set(self._cache_key(), entry, timeout=self.ttl + 60)
            return entry["keys"]

    def _cache_key(self):
        return f"jwks:{self.jwks_url}"

    def _load(self):
        try:
            document = self._fetcher(self.jwks_url)
        except Exception as exc:
            raise JWKSFetchError(f"JWKS fetch failed: {exc}") from exc
        keys = {}
        for key_data in document.get("keys", []):
            kid = key_data.get("kid")
            if kid:
                keys[kid] = key_data
        if not keys:
            raise JWKSFetchError("JWKS document contained no usable keys")
        return keys


def _split_token(token):
    """Return (header, payload, signing_input, signature) without verifying."""
    parts = token.split(".")
    if len(parts) != 3:
        raise InvalidTokenError("malformed token")
    signing_input = f"{parts[0]}.{parts[1]}".encode()
    try:
        header = jwt.get_unverified_header(token)
        payload = jwt.decode(token, options={"verify_signature": False})
        signature = base64.urlsafe_b64decode(parts[2] + "=" * (-len(parts[2]) % 4))
    except Exception as exc:
        raise InvalidTokenError("malformed token") from exc
    return header, payload, signing_input, signature


def _validate_claims(payload):
    """The jwt.decode options used everywhere: require exp+sub, check aud/iss."""
    now = time.time()
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or now >= exp:
        raise InvalidTokenError("token expired")
    if not payload.get("sub"):
        raise InvalidTokenError("token has no sub")
    audience = settings.SUPABASE_JWT_AUDIENCE
    if audience:
        aud = payload.get("aud")
        aud_list = aud if isinstance(aud, list) else [aud]
        if audience not in aud_list:
            raise InvalidTokenError("audience mismatch")
    if settings.SUPABASE_URL:
        issuer = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"
        if payload.get("iss") != issuer:
            raise InvalidTokenError("issuer mismatch")


def _verify_rs256(token, header):
    kid = header.get("kid")
    if not kid:
        raise InvalidTokenError("token header has no kid")
    jwk = _get_jwks_cache().get_key(kid)
    if jwk.get("kty") != "RSA":
        raise InvalidTokenError(f"JWKS key {kid!r} is not RSA")
    _, _, signing_input, signature = _split_token(token)
    n = _b64url_uint(jwk["n"])
    e = _b64url_uint(jwk["e"])
    if not rsa_sha256_verify(signing_input, signature, n, e):
        raise InvalidTokenError("signature verification failed")


def _verify_es256(token, header):
    kid = header.get("kid")
    if not kid:
        raise InvalidTokenError("token header has no kid")
    jwk = _get_jwks_cache().get_key(kid)
    _, _, signing_input, signature = _split_token(token)
    try:
        from jwt import PyJWK

        key = PyJWK(jwk).key
        jwt.decode(
            token,
            key,
            algorithms=["ES256"],
            options={"verify_aud": False, "verify_iss": False, "verify_exp": False},
        )
    except ImportError as exc:
        raise InvalidTokenError(
            "ES256 requires the cryptography package (pip install PyJWT[crypto])"
        ) from exc
    except jwt.PyJWTError:
        raise InvalidTokenError("signature verification failed")


def decode_supabase_token(token):
    """Verify a Supabase JWT and return its claims. Raises
    jwt.PyJWTError (or JWKSFetchError) on any verification failure."""
    header = jwt.get_unverified_header(token)
    algorithm = header.get("alg", "")

    if settings.SUPABASE_URL:
        payload = jwt.decode(token, options={"verify_signature": False})
        if algorithm == "RS256":
            _verify_rs256(token, header)
        elif algorithm == "ES256":
            _verify_es256(token, header)
        else:
            raise InvalidTokenError(f"unexpected algorithm {algorithm!r}")
        _validate_claims(payload)
        return payload
    if settings.SUPABASE_JWT_SECRET:
        if algorithm != "HS256":
            raise InvalidTokenError(f"unexpected algorithm {algorithm!r}")
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=settings.SUPABASE_JWT_AUDIENCE,
            options={"require": ["exp", "sub"]},
        )
        _validate_claims(payload)
        return payload
    raise InvalidTokenError("no Supabase verification source configured")


_jwks_cache = None
_jwks_lock = threading.Lock()


def _get_jwks_cache():
    global _jwks_cache
    if _jwks_cache is None:
        with _jwks_lock:
            if _jwks_cache is None:
                _jwks_cache = JWKSCache()
    return _jwks_cache


def reset_jwks_cache():
    """Test seam: drop the process-wide cache so a new JWKSCache is built."""
    global _jwks_cache
    with _jwks_lock:
        _jwks_cache = None
