"""Namo AI — the three tables the chatbot needs.

Deliberately NOT reusing `chat.Session`. That table's `consultant_id` is a
non-null FK, and widening it so the AI can sit in the same rows would make
every consultant query carry a null case forever, for a product that shares
the meter's arithmetic and nothing else. The arithmetic is imported from
`chat.services`; only the rows are separate.
"""

import uuid

from django.db import models
from django.utils import timezone


class Session(models.Model):
    """A paid, metered conversation with the model.

    Mirrors `chat.Session`'s money shape exactly — hold at start, settle at
    end, refund the unused minutes — because it is the same meter and the
    same ledger. What it does not have is a request/accept dance: there is
    nobody to accept. A seeker starts it and the clock starts.
    """

    class Status(models.TextChoices):
        LIVE = "live"
        ENDED = "ended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    rate_paise = models.IntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.LIVE)
    started_at = models.DateTimeField(default=timezone.now)
    # started_at + the minutes the wallet could pay for. The clock never runs
    # past what was held, so an abandoned tab cannot spend more than this.
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    heartbeat_at = models.DateTimeField(null=True, blank=True)
    hold_paise = models.IntegerField()
    charged_paise = models.IntegerField(null=True, blank=True)
    order_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "ai_sessions"
        indexes = [
            models.Index(fields=["profile_id", "-started_at"], name="ai_sessions_mine_idx"),
            # The sweeper's read: everything still live and past its expiry.
            models.Index(fields=["status", "expires_at"], name="ai_sessions_sweep_idx"),
        ]


class Message(models.Model):
    """The transcript. `session` is null for a free message — the free ones
    are not metered and belong to nobody's clock, but they are the same
    conversation and the model must see them."""

    class Role(models.TextChoices):
        USER = "user"
        MODEL = "model"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    session = models.ForeignKey(
        Session, null=True, blank=True, on_delete=models.SET_NULL, related_name="messages"
    )
    role = models.CharField(max_length=8, choices=Role.choices)
    body = models.TextField()
    # What the answer cost us, in the provider's own units. Not shown to
    # anyone; it is how "is this priced sanely" stops being a guess.
    tokens_in = models.IntegerField(null=True, blank=True)
    tokens_out = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "ai_messages"
        indexes = [
            models.Index(fields=["profile_id", "created_at"], name="ai_messages_mine_idx"),
            # flush_ai_messages sweeps on this alone.
            models.Index(fields=["created_at"], name="ai_messages_age_idx"),
        ]


class Quota(models.Model):
    """One row per person: what is still free.

    Two allowances, and they are not the same thing. `welcome_used` counts
    down the five that arrive with the account and never come back. After
    those, one free message a day — `last_free_on` is an IST date, because
    "a day" here is the calendar the product already uses everywhere else
    (docs/02-TRD.md §10) and not a rolling 24 hours the seeker cannot see.
    """

    profile_id = models.UUIDField(primary_key=True)
    welcome_used = models.IntegerField(default=0)
    last_free_on = models.DateField(null=True, blank=True)
    # How many free messages were taken ON `last_free_on`. A date stamp alone
    # could only ever express "one a day"; this makes the daily allowance a
    # number, which is what let it be raised for testing without a flag that
    # bypasses billing — and what will let it be three a day if that ever
    # becomes the product.
    daily_used = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "ai_quota"
