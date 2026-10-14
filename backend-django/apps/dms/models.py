"""Person-to-person messages (13 Oct 2026, docs/06 Phase 15b).

Free, and kept apart from the paid chat on purpose: `threads` and `messages`
belong to a consultation, where the meter decides who may write. Nothing
here touches a session, a wallet or a rate.

A pair has one conversation, stored with the two ids in sorted order so it
cannot exist twice. A first message to somebody who does not follow you is a
request: `accepted_at` stays empty until they reply or accept, and until then
you have said your one message.
"""

import uuid

from django.db import models
from django.utils import timezone


class DmThread(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # The pair, smaller id first, so (a, b) and (b, a) are one row.
    a_id = models.UUIDField()
    b_id = models.UUIDField()
    started_by = models.UUIDField()
    # Empty while it is a request to the other person; set when they reply
    # or accept, or at once when they already follow the starter.
    accepted_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    last_preview = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "dm_threads"
        constraints = [
            models.UniqueConstraint(fields=["a_id", "b_id"], name="dm_threads_pair_key"),
        ]
        indexes = [
            models.Index(fields=["a_id", "-last_message_at"], name="dm_threads_a_idx"),
            models.Index(fields=["b_id", "-last_message_at"], name="dm_threads_b_idx"),
            models.Index(fields=["started_by", "created_at"], name="dm_threads_starter_idx"),
        ]


class DmMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(DmThread, on_delete=models.CASCADE, related_name="messages")
    sender_id = models.UUIDField()
    body = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "dm_messages"
        constraints = [
            models.CheckConstraint(condition=~models.Q(body=""), name="dm_messages_body_check"),
        ]
        indexes = [
            models.Index(fields=["thread", "created_at"], name="dm_messages_thread_idx"),
            # The writing limit's count (apps/core/limits.py, Phase 15d).
            models.Index(fields=["sender_id", "created_at"], name="dm_messages_sender_idx"),
        ]


class DmBlock(models.Model):
    """`blocker` blocked `blocked` from the conversation. Neither may then
    write to the other, whoever started it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    blocker_id = models.UUIDField()
    blocked_id = models.UUIDField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "dm_blocks"
        constraints = [
            models.UniqueConstraint(fields=["blocker_id", "blocked_id"], name="dm_blocks_pair_key"),
        ]
