"""Multipart uploads to R2 for the video pipeline (17 Oct 2026).

The phone sends the file in 5 MB parts, each to its own presigned URL, so
a dropped part is retried alone and an upload survives the app being
closed: `parts_done` lists what R2 already has. Video bytes never pass
through the API.

The raw upload goes to the private uploads bucket (VIDEO_UPLOADS_BUCKET,
falling back to R2_PRIVATE_BUCKET) under `uploads/`; the worker reads it,
writes the HLS versions to the public media bucket, and deletes it.
`MEDIA_PROVIDER=local` (dev and tests) fakes every call.
"""

import boto3
from botocore.config import Config as BotoConfig
from django.conf import settings

PART_BYTES = 5 * 1024 * 1024
URL_SECONDS = 15 * 60


def uploads_bucket():
    return getattr(settings, "VIDEO_UPLOADS_BUCKET", "") or settings.R2_PRIVATE_BUCKET


def part_count(size_bytes):
    return max(1, -(-int(size_bytes) // PART_BYTES))


def get_store():
    if settings.MEDIA_PROVIDER == "r2":
        return R2Store()
    return LocalStore()


class R2Store:
    def _client(self):
        return boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT,
            aws_access_key_id=settings.R2_ACCESS_KEY,
            aws_secret_access_key=settings.R2_SECRET_KEY,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )

    def start(self, key, mime):
        made = self._client().create_multipart_upload(Bucket=uploads_bucket(), Key=key, ContentType=mime)
        return made["UploadId"]

    def part_urls(self, key, upload_id, numbers):
        client = self._client()
        return [
            {
                "part_number": n,
                "url": client.generate_presigned_url(
                    "upload_part",
                    Params={"Bucket": uploads_bucket(), "Key": key, "UploadId": upload_id, "PartNumber": n},
                    ExpiresIn=URL_SECONDS,
                ),
            }
            for n in numbers
        ]

    def parts_done(self, key, upload_id):
        """{part_number: etag} for the parts R2 already holds."""
        client = self._client()
        done, marker = {}, 0
        while True:
            page = client.list_parts(Bucket=uploads_bucket(), Key=key, UploadId=upload_id,
                                     PartNumberMarker=marker)
            for p in page.get("Parts", []):
                done[p["PartNumber"]] = p["ETag"]
            if not page.get("IsTruncated"):
                return done
            marker = page.get("NextPartNumberMarker", 0)

    def finish(self, key, upload_id, parts):
        """Join the parts; returns the stored object's size."""
        client = self._client()
        client.complete_multipart_upload(
            Bucket=uploads_bucket(), Key=key, UploadId=upload_id,
            MultipartUpload={"Parts": [{"PartNumber": n, "ETag": e} for n, e in sorted(parts.items())]},
        )
        return client.head_object(Bucket=uploads_bucket(), Key=key)["ContentLength"]

    def abort(self, key, upload_id):
        try:
            self._client().abort_multipart_upload(Bucket=uploads_bucket(), Key=key, UploadId=upload_id)
        except Exception:  # noqa: BLE001 — already gone is fine
            pass

    def copy_in(self, source_key, key):
        """A file already in the public media bucket, copied to the uploads
        bucket for the worker; returns its (size, type)."""
        client = self._client()
        head = client.head_object(Bucket=settings.R2_BUCKET, Key=source_key)
        client.copy_object(Bucket=uploads_bucket(), Key=key,
                           CopySource={"Bucket": settings.R2_BUCKET, "Key": source_key})
        return head["ContentLength"], head.get("ContentType") or "video/mp4"

    def delete_outputs(self, prefix):
        """Every encoded file of a video (`v/{id}/`) in the public bucket,
        for a rejected one. Returns how many went."""
        client, gone = self._client(), 0
        while True:
            page = client.list_objects_v2(Bucket=settings.R2_BUCKET, Prefix=prefix)
            keys = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if not keys:
                return gone
            client.delete_objects(Bucket=settings.R2_BUCKET, Delete={"Objects": keys, "Quiet": True})
            gone += len(keys)


class LocalStore:
    """Dev and tests: an upload is a dict in memory."""

    uploads = {}
    deleted = []

    def start(self, key, mime):
        upload_id = f"local-{len(self.uploads) + 1}"
        LocalStore.uploads[upload_id] = {"key": key, "parts": {}, "size": None}
        return upload_id

    def part_urls(self, key, upload_id, numbers):
        return [{"part_number": n, "url": f"https://local.test/{key}?part={n}"} for n in numbers]

    def parts_done(self, key, upload_id):
        return dict(LocalStore.uploads.get(upload_id, {}).get("parts", {}))

    def finish(self, key, upload_id, parts):
        found = LocalStore.uploads.get(upload_id)
        if found is None:
            raise KeyError("no such upload")
        return found.get("size")

    def abort(self, key, upload_id):
        LocalStore.uploads.pop(upload_id, None)

    copied = []

    def copy_in(self, source_key, key):
        if "missing" in source_key:
            raise KeyError(source_key)
        LocalStore.copied.append((source_key, key))
        return 1000, "video/mp4"

    def delete_outputs(self, prefix):
        LocalStore.deleted.append(prefix)
        return 0
