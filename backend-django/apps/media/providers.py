"""Storage providers for presigned uploads (docs/07 §4).

Exactly one provider is active per environment, selected by MEDIA_PROVIDER:
  - "r2":    Cloudflare R2 via boto3 presigned PUT. Bytes never touch Django.
  - "local": dev fake — returns a fabricated URL, stores nothing anywhere.

The R2 client is built lazily per call so tests can patch boto3 at module
level and so a missing R2_ config fails at request time, not import time.
"""

import logging
import uuid

import boto3
from botocore.config import Config as BotoConfig
from django.conf import settings

logger = logging.getLogger("apps.media.providers")


class ValidationError(ValueError):
    """Bad kind/mime/size — the view turns this into a 400 refusal."""


KIND_RULES = {
    # kind: (mime prefix, max size bytes)
    "reel": ("video/", 100 * 1024 * 1024),  # 100 MB
    "image": ("image/", 10 * 1024 * 1024),  # 10 MB
    "audio": ("audio/", 25 * 1024 * 1024),  # 25 MB
}


def validate_upload(kind, filename, size_bytes, mime):
    """Gate per docs/07 §4: the presign endpoint is size- and mime-gated."""
    if kind not in KIND_RULES:
        raise ValidationError(f"unknown kind {kind!r}")
    prefix, max_bytes = KIND_RULES[kind]
    if not mime.startswith(prefix):
        raise ValidationError(f"{kind} uploads must be {prefix}* (got {mime!r})")
    if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
        raise ValidationError("bad filename")
    if not isinstance(size_bytes, int) or isinstance(size_bytes, bool) or size_bytes <= 0:
        raise ValidationError("size_bytes must be a positive integer")
    if size_bytes > max_bytes:
        raise ValidationError(
            f"{kind} uploads are capped at {max_bytes // (1024 * 1024)} MB (got {size_bytes} bytes)"
        )


def make_bucket_key(owner, kind, filename):
    safe_name = filename.replace(" ", "-")
    return f"{kind}s/{owner}/{uuid.uuid4()}/{safe_name}"


def get_provider():
    provider = settings.MEDIA_PROVIDER
    if provider == "r2":
        return R2Provider()
    if provider == "local":
        return LocalProvider()
    raise RuntimeError(f"unknown MEDIA_PROVIDER {provider!r}")


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT,
        aws_access_key_id=settings.R2_ACCESS_KEY,
        aws_secret_access_key=settings.R2_SECRET_KEY,
        config=BotoConfig(signature_version="s3v4"),
        region_name="auto",
    )


def presign_get(bucket, key, expires_in):
    """A time-limited read of one object in a PRIVATE bucket (Academy PDFs).
    The caller decides who may have it; this only signs."""
    return _r2_client().generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires_in
    )


class R2Provider:
    """Cloudflare R2, S3-compatible. Presigned PUT, 15-minute expiry."""

    def presign_put(self, bucket_key, mime, size_bytes):
        client = _r2_client()
        upload_url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.R2_BUCKET,
                "Key": bucket_key,
                "ContentType": mime,
                "ContentLength": size_bytes,
            },
            ExpiresIn=900,
        )
        return {
            "upload_url": upload_url,
            "headers": {"Content-Type": mime, "Content-Length": str(size_bytes)},
        }


class LocalProvider:
    """Dev stand-in: the URL is fabricated, the row is real. Lets the whole
    upload→confirm flow run without R2 credentials."""

    def presign_put(self, bucket_key, mime, size_bytes):
        return {
            "upload_url": f"{settings.MEDIA_PUBLIC_BASE_URL}/local-upload/{bucket_key}",
            "headers": {"Content-Type": mime, "Content-Length": str(size_bytes)},
        }
