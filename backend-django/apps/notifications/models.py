"""One person's alerts.

THE ALERTS TAB READ `mock.js` UNTIL TODAY. Seven hard-coded strings that
were the same for every account and never changed. This is the table
behind it.

DELIVERY IS POLLING, not push, and that is this codebase's existing
answer rather than a shortcut taken here: `src/lib/chat.js` says so at
the top — the Supabase Realtime subscriptions became pollers at the
cutover, and WebSocket delivery is a later phase (docs/07 §6 step 7).
Chat has run on a three-second poll since, so alerts do too. When
Channels lands, the rows do not move.
"""

import uuid

from django.db import models
from django.utils import timezone


class Notification(models.Model):
    """`kind` is a dotted string rather than a choices list on purpose.

    Every module that wants to tell somebody something would otherwise
    have to edit an enum in this one, and a shared enum across eight apps
    is a merge conflict waiting on every feature. The client renders
    `title` and `body` and groups on the prefix before the dot.

    `dedupe_key` is what makes a notification safe to write from a retried
    job: the same key twice is one row, so a maturation sweep that runs
    again after a crash does not tell somebody about their cashback five
    times.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    kind = models.CharField(max_length=64)
    title = models.TextField()
    body = models.TextField(null=True, blank=True)
    # What it is about, so a tap can go somewhere. Deliberately loose —
    # an FK per kind would make this table know about every other app.
    ref_type = models.CharField(max_length=32, null=True, blank=True)
    ref_id = models.CharField(max_length=64, null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    dedupe_key = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "notifications"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["dedupe_key"],
                name="notifications_dedupe_uniq",
                condition=models.Q(dedupe_key__isnull=False),
            ),
        ]
        indexes = [
            # The list, and the unread badge. Both are always scoped to one
            # person, which is why profile_id leads.
            models.Index(fields=["profile_id", "-created_at"], name="notif_owner_idx"),
            models.Index(
                fields=["profile_id"],
                name="notif_unread_idx",
                condition=models.Q(read_at__isnull=True),
            ),
        ]

    def __str__(self):
        return f"{self.kind} · {self.title[:40]}"
