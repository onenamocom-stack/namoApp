import uuid

from django.db import models
from django.utils import timezone


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class IdempotencyKey(UUIDModel):
    """Stored response per (key, user). First request executes and fills
    status_code/response_body; replays return them untouched (docs/07 §3.1)."""

    key = models.CharField(max_length=255)
    user_id = models.CharField(max_length=64)  # Supabase auth.users id (uuid as text)
    method = models.CharField(max_length=10)
    path = models.CharField(max_length=2048)
    status_code = models.IntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "core_idempotencykey"
        constraints = [
            models.UniqueConstraint(fields=["key", "user_id"], name="core_idem_key_user_uniq"),
        ]
        indexes = [models.Index(fields=["user_id", "created_at"])]


class OutboxEvent(UUIDModel):
    """Append-only outbox (docs/07 §3.1 and §5). Written in the same
    transaction as the business write that demands the side effect;
    dispatched by `manage.py dispatch_outbox` until Celery lands."""

    class Kind(models.TextChoices):
        # Phase 1 ships no handlers; kinds are registered by later modules.
        PLACEHOLDER = "placeholder", "Placeholder"

    kind = models.CharField(max_length=128)
    payload = models.JSONField(default=dict)
    dedupe_key = models.CharField(max_length=255, null=True, blank=True)
    available_at = models.DateTimeField(default=timezone.now, db_index=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    attempts = models.IntegerField(default=0)
    last_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "outbox_events"
        constraints = [
            models.UniqueConstraint(
                fields=["dedupe_key"],
                name="core_outbox_dedupe_uniq",
                condition=~models.Q(dedupe_key="") & models.Q(dedupe_key__isnull=False),
            ),
            models.CheckConstraint(
                condition=models.Q(attempts__gte=0),
                name="core_outbox_attempts_nonneg",
            ),
        ]
        indexes = [
            models.Index(fields=["available_at", "dispatched_at"]),
        ]
