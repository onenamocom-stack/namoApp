import uuid

from django.db import models
from django.utils import timezone


class MediaKind(models.TextChoices):
    REEL = "reel", "Reel"
    IMAGE = "image", "Image"
    AUDIO = "audio", "Audio"


class MediaStatus(models.TextChoices):
    READY = "ready", "Ready"
    PROCESSING = "processing", "Processing"
    FAILED = "failed", "Failed"


class MediaAsset(models.Model):
    """The generic media spine (docs/07 §4 and §5). Bytes live in R2;
    Postgres holds only this row. Business tables (posts, reels, avatars,
    bhakti art) reference it when their modules land — no business FKs in M1.

    owner is the Supabase auth user id stored as uuid text: identity stays in
    Supabase Auth, so there is no local users table to FK yet.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.CharField(max_length=64, db_index=True)  # auth.users id, uuid as text
    kind = models.CharField(max_length=16, choices=MediaKind.choices)
    bucket_key = models.CharField(max_length=1024)
    mime = models.CharField(max_length=255)
    size_bytes = models.BigIntegerField()
    duration_ms = models.IntegerField(null=True, blank=True)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=MediaStatus.choices, default=MediaStatus.PROCESSING)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    # Convenience aliases so call sites read MediaAsset.Status / MediaAsset.Kind.
    Kind = MediaKind
    Status = MediaStatus

    class Meta:
        db_table = "media_assets"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(kind__in=MediaKind.values),
                name="media_kind_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=MediaStatus.values),
                name="media_status_valid",
            ),
            models.CheckConstraint(condition=models.Q(size_bytes__gte=0), name="media_size_nonneg"),
        ]
