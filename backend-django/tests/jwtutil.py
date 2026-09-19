"""Test-only helpers: RSA keypair generation and RS256 signing in pure
Python, so the suite needs no `cryptography` package (M1 pins exactly the
seven requirements.txt deps). Keys are 2048-bit; primality is Miller-Rabin
with 32 rounds — session-scoped, generated once per test run.

`verify_against_openssl` cross-checks our signer against the openssl CLI so
the pure-Python RSA code is not merely self-consistent.
"""

import base64
import hashlib
import json
import math
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path

RSA_PKCS1_SHA256_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_uint(value: int) -> str:
    return _b64url(value.to_bytes((value.bit_length() + 7) // 8, "big"))


def _is_probable_prime(n: int, rounds: int = 32) -> bool:
    if n < 2:
        return False
    for small in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % small == 0:
            return n == small
    d, r = n - 1, 0
    while d % 2 == 0:
        r += 1
        d //= 2
    for _ in range(rounds):
        a = secrets.randbelow(n - 3) + 2
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _generate_prime(bits: int, e: int) -> int:
    while True:
        candidate = secrets.randbits(bits) | (1 << (bits - 1)) | 1
        if math.gcd(candidate - 1, e) != 1:
            continue
        if _is_probable_prime(candidate):
            return candidate


def generate_rsa_keypair(bits: int = 2048):
    e = 65537
    p = _generate_prime(bits // 2, e)
    while True:
        q = _generate_prime(bits - bits // 2, e)
        if q != p:
            break
    n = p * q
    phi = (p - 1) * (q - 1)
    d = pow(e, -1, phi)
    return {"n": n, "e": e, "d": d, "bits": bits}


def public_jwk(keypair, kid: str, alg: str = "RS256") -> dict:
    return {
        "kty": "RSA",
        "use": "sig",
        "alg": alg,
        "kid": kid,
        "n": b64url_uint(keypair["n"]),
        "e": b64url_uint(keypair["e"]),
    }


def sign_rs256(keypair, payload: dict, headers: dict | None = None) -> str:
    header = {"typ": "JWT", "alg": "RS256"}
    header.update(headers or {})
    h = _b64url(json.dumps(header, separators=(",", ":")).encode())
    p = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{h}.{p}".encode()
    digest_info = RSA_PKCS1_SHA256_PREFIX + hashlib.sha256(signing_input).digest()
    k = (keypair["n"].bit_length() + 7) // 8
    padded = b"\x00\x01" + b"\xff" * (k - len(digest_info) - 3) + b"\x00" + digest_info
    signature = pow(int.from_bytes(padded, "big"), keypair["d"], keypair["n"]).to_bytes(k, "big")
    return f"{h}.{p}.{_b64url(signature)}"


def _der_length(length: int) -> bytes:
    if length < 128:
        return bytes([length])
    encoded = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(encoded)]) + encoded


def _der_integer(value: int) -> bytes:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    if raw[0] & 0x80:
        raw = b"\x00" + raw
    return b"\x02" + _der_length(len(raw)) + raw


RSA_ALGORITHM_IDENTIFIER = bytes.fromhex("300d06092a864886f70d0101010500")  # rsaEncryption + NULL


def public_key_der(keypair) -> bytes:
    """SubjectPublicKeyInfo (what `openssl pkey -pubin` and x509 expect):
    SEQUENCE { SEQUENCE { rsaEncryption OID, NULL }, BITSTRING { PKCS#1 } }"""
    pkcs1_body = _der_integer(keypair["n"]) + _der_integer(keypair["e"])
    pkcs1 = b"\x30" + _der_length(len(pkcs1_body)) + pkcs1_body
    bitstring = b"\x03" + _der_length(len(pkcs1) + 1) + b"\x00" + pkcs1
    body = RSA_ALGORITHM_IDENTIFIER + bitstring
    return b"\x30" + _der_length(len(body)) + body


def openssl_available() -> bool:
    return shutil.which("openssl") is not None


def verify_with_openssl(keypair, token: str) -> bool:
    """True iff `openssl dgst -sha256 -verify` accepts the token's signature.

    Independent of our signing code: proves the pure-Python RSA path is
    interoperable with the ecosystem's reference implementation.
    """
    header_b64, payload_b64, signature_b64 = token.split(".")
    signature = base64.urlsafe_b64decode(signature_b64 + "=" * (-len(signature_b64) % 4))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        pem = b"-----BEGIN PUBLIC KEY-----\n"
        pem += base64.encodebytes(public_key_der(keypair))
        pem += b"-----END PUBLIC KEY-----\n"
        (tmp / "pub.pem").write_bytes(pem)
        (tmp / "data.bin").write_bytes(f"{header_b64}.{payload_b64}".encode())
        (tmp / "sig.bin").write_bytes(signature)
        result = subprocess.run(
            [
                "openssl", "dgst", "-sha256", "-verify", str(tmp / "pub.pem"),
                "-signature", str(tmp / "sig.bin"), str(tmp / "data.bin"),
            ],
            capture_output=True,
        )
        return result.returncode == 0
