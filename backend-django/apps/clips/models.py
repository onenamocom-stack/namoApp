"""The video pipeline's own table (17 Oct 2026, Rahul's "NAMO Video Pipeline
– Technical Spec"). One row per uploaded video, from the first byte to its
HLS versions, for the web app and the Android app alike: the phone asks to
start (`init`), sends the file in 5 MB parts straight to R2, says it is
done (`complete`), and a worker turns it into HLS, a thumbnail and a
moderation verdict.

Named `clips` because `apps.video` is the calls' Daily rooms; the table is
`videos`, the spec's name.
"""

import uuid

from django.db import models
from django.utils import timezone


class VideoStatus(models.TextChoices):
    UPLOADING = "uploading", "Uploading"
    PROCESSING = "processing", "Processing"
    IN_REVIEW = "in_review", "Waiting for a moderator"
    LIVE = "live", "Live"
    REJECTED = "rejected", "Rejected"
    DELETED = "deleted", "Deleted"


class StorageTier(models.TextChoices):
    STANDARD = "standard", "Standard"
    INFREQUENT = "infrequent", "Infrequent access"


class Video(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField(db_index=True)  # profiles id
    status = models.CharField(max_length=16, choices=VideoStatus.choices, default=VideoStatus.UPLOADING)
    # SHA-256 of the file as uploaded (hex), for the duplicate check.
    source_hash = models.CharField(max_length=64, db_index=True)
    duration_s = models.FloatField()
    size_bytes = models.BigIntegerField()
    mime = models.CharField(max_length=64, default="video/mp4")
    # The phone could not compress it: the original went up (up to 150 MB)
    # and the worker compresses it (the spec's fallback).
    needs_compress = models.BooleanField(default=False)
    # Another row with the same file: this one shares its outputs and no
    # bytes were uploaded for it.
    source_video = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name="copies")
    # The raw upload in the private uploads bucket, and R2's multipart id.
    upload_key = models.TextField(default="", blank=True)
    upload_id = models.TextField(default="", blank=True)
    parts = models.IntegerField(default=0)
    storage_tier = models.CharField(max_length=16, choices=StorageTier.choices, default=StorageTier.STANDARD)
    # Set by the worker, relative to the public media base (v/{id}/...).
    hls_path = models.TextField(default="", blank=True)
    thumb_path = models.TextField(default="", blank=True)
    preview_path = models.TextField(default="", blank=True)
    # The encoded size, after the phone's rotation, for the player's frame.
    width = models.IntegerField(default=0)
    height = models.IntegerField(default=0)
    category = models.CharField(max_length=24, default="content", blank=True)
    moderation = models.JSONField(default=dict, blank=True)
    error = models.TextField(default="", blank=True)
    view_count = models.IntegerField(default=0)
    last_viewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    # The worker's hold: when it was last handed to the worker, and how many
    # times. The sweep hands a stuck one over again, up to three times.
    claimed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.IntegerField(default=0)

    Status = VideoStatus

    class Meta:
        db_table = "videos"
        indexes = [
            models.Index(fields=["user_id", "created_at"], name="videos_user_created_idx"),
            models.Index(fields=["status", "created_at"], name="videos_status_created_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(status__in=VideoStatus.values), name="videos_status_valid"),
            models.CheckConstraint(condition=models.Q(size_bytes__gt=0), name="videos_size_positive"),
        ]
