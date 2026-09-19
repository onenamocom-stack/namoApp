"""Module 7 — chat (docs/07-DJANGO-MIGRATION.md §6 step 7), the metered-chat
billing engine. The highest correctness bar in the migration: every rule of
`backend/schema/014_metered_chat.sql` as amended by `017_no_hold_cap.sql` and
`018_session_review_fixes.sql`, re-expressed in code. One model per table,
1:1 onto the existing Supabase schema, so the initial migration is faked in
at cutover (`migrate --fake-initial`) — every constraint and index name below
is the name Postgres already carries, nothing here creates anything new on
the real database. Owned here:

  sessions    014_metered_chat.sql, accept re-written by 017 and 018
              (the row lock), one-open-request index and the sweeper's
              request-expiry from 018
  threads     014 (one per pair, forever)
  messages    014 (sender_id ONLY — role is derived, the mock's bug), the
              preview cache columns 016 maintains by trigger

Deliberately NOT owned here (raw-SQL gateway, the consultants pattern):
  profiles    — the profile module (9)
  wallets, ledger, orders, order_items — the wallet module (8); the metering
              writes go through apps.consultants.gateway exactly as module 6
              established, and prod's phase-2 triggers stay in force until
              that cutover
  consultant_services, consultants, earnings_ledger — module 6 owns them;
              chat reads the first two and appends EarningsLedger rows the
              same way 014's function does
  threads_view (014's read view) — replicated in services, the same way
              module 6 replicates consultants_public / bookings_view

016's `touch_thread` trigger maintains threads.last_message_at /
last_preview in prod; the service emulates that update on SQLite (no
triggers there), the consultants-gateway precedent for the phase-2
balance trigger.
"""

import uuid

from django.db import models
from django.utils import timezone


class SessionStatus(models.TextChoices):
    REQUESTED = "requested", "Requested"
    LIVE = "live", "Live"
    ENDED = "ended", "Ended"
    DECLINED = "declined", "Declined"
    EXPIRED = "expired", "Expired"


class SessionMode(models.TextChoices):
    CHAT = "chat", "Chat"
    CALL = "call", "Call"
    LIVE = "live", "Live"


class Session(models.Model):
    """One row of `sessions` (014): the PAID WINDOW, not the conversation.
    `rate_paise` is a frozen copy of the band rate at request time, exactly
    as bookings freeze their amount — a consultant changing tier must not
    re-price a session already under way.

    The conflict checks are partial unique indexes, not application logic
    (014/018): `sessions_one_live_per_consultant` refuses a second live
    session on 23505 exactly like the booking slot claim, and
    `sessions_one_open_request` (018 fix 2) makes a repeated ask the same
    ask. `sessions_live_idx` is the sweeper's whole query cost."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seeker_id = models.UUIDField()  # profiles id; FK deferred to module 9
    consultant = models.ForeignKey(
        "consultants.Consultant",
        to_field="profile_id",
        db_column="consultant_id",
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    service = models.ForeignKey(
        "consultants.ConsultantService",
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    # 014 adds this FK by a separate ALTER TABLE named sessions_thread_fkey;
    # Django's auto-generated FK constraint name differs cosmetically, which
    # --fake-initial does not check. The on_delete mirrors 014's plain
    # REFERENCES (no cascade): sessions are never deleted.
    thread = models.ForeignKey(
        "chat.Thread",
        db_column="thread_id",
        on_delete=models.DO_NOTHING,
        related_name="sessions",
        null=True,
        blank=True,
    )
    order_id = models.UUIDField(null=True, blank=True)  # orders.id; module 8
    mode = models.CharField(max_length=16, choices=SessionMode.choices)
    rate_paise = models.IntegerField()
    status = models.CharField(
        max_length=16, choices=SessionStatus.choices, default=SessionStatus.REQUESTED
    )
    requested_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)  # consultant joined; clock starts
    expires_at = models.DateTimeField(null=True, blank=True)  # started_at + the minutes held
    ended_at = models.DateTimeField(null=True, blank=True)
    heartbeat_at = models.DateTimeField(null=True, blank=True)
    hold_paise = models.IntegerField(null=True, blank=True)  # taken at accept
    charged_paise = models.IntegerField(null=True, blank=True)  # worked out at end
    created_at = models.DateTimeField(default=timezone.now)

    Status = SessionStatus
    Mode = SessionMode

    class Meta:
        db_table = "sessions"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(mode__in=SessionMode.values),
                name="sessions_mode_check",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=SessionStatus.values),
                name="sessions_status_check",
            ),
            models.CheckConstraint(
                condition=models.Q(rate_paise__gt=0),
                name="sessions_rate_paise_check",
            ),
            # THE live-session conflict check (014): a consultant cannot be
            # in two paid conversations at once; the second accept loses on
            # 23505, caught and translated, exactly as the slot claim.
            models.UniqueConstraint(
                fields=["consultant_id"],
                condition=models.Q(status=SessionStatus.LIVE),
                name="sessions_one_live_per_consultant",
            ),
            # 018 fix 2: one open request per pair, enforced by the index —
            # asking twice is the same ask, not a second row on the queue.
            models.UniqueConstraint(
                fields=["seeker_id", "consultant_id"],
                condition=models.Q(status=SessionStatus.REQUESTED),
                name="sessions_one_open_request",
            ),
        ]
        indexes = [
            models.Index(fields=["seeker_id", "-requested_at"], name="sessions_seeker_idx"),
            models.Index(fields=["consultant_id", "-requested_at"], name="sessions_consultant_idx"),
            # The sweeper's query, and the only index it needs (014).
            models.Index(
                fields=["expires_at"],
                condition=models.Q(status=SessionStatus.LIVE),
                name="sessions_live_idx",
            ),
        ]


class Thread(models.Model):
    """One row of `threads` (014): the TRANSCRIPT, and it outlives every
    session. One per (seeker, consultant) pair, forever — a second session
    between the same two people continues the same conversation.

    `last_message_at` / `last_preview` are the §1.3 cache exception by name:
    prod's 016 trigger maintains them on every insert (a cache each writer
    must remember to update is one that eventually disagrees); the service
    emulates that write on SQLite, where test fixtures carry no triggers.
    `left(body, 120)` counts CHARACTERS, not bytes — the preview is enough
    to recognise the conversation, not enough to leak it into a notification
    (016)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seeker_id = models.UUIDField()  # profiles id; FK deferred to module 9
    consultant = models.ForeignKey(
        "consultants.Consultant",
        to_field="profile_id",
        db_column="consultant_id",
        on_delete=models.CASCADE,
        related_name="threads",
    )
    last_message_at = models.DateTimeField(null=True, blank=True)
    last_preview = models.TextField(null=True, blank=True)
    legacy_id = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "threads"
        constraints = [
            models.UniqueConstraint(
                fields=["seeker_id", "consultant_id"],
                name="threads_seeker_id_consultant_id_key",
            ),
        ]
        indexes = [
            models.Index(
                fields=["consultant_id", "-last_message_at"],
                name="threads_consultant_idx",
            ),
            models.Index(
                fields=["seeker_id", "-last_message_at"],
                name="threads_seeker_idx",
            ),
        ]


class Message(models.Model):
    """One row of `messages` (014). `sender_id` ONLY — there is no role
    column: role is `sender_id = threads.consultant_id`, derived. Storing it
    is how a message comes to disagree with its own thread, which is exactly
    the bug the mock has. "Mine" is `sender_id === myId` and cannot be
    backwards (HANDOFF phase 6).

    Prod's body check is `btrim(body) <> ''`; ORM check constraints cannot
    express btrim portably, so the model carries `body <> ''` and the
    service layer enforces the trim — the refusal happens before any write
    either way. Reading the transcript is always allowed to its two
    participants; the money gates WRITING, not remembering (014)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    thread = models.ForeignKey(
        Thread, on_delete=models.CASCADE, related_name="messages"
    )
    sender_id = models.UUIDField()  # profiles id; FK deferred to module 9
    body = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "messages"
        constraints = [
            # `body <> ''` of prod's `btrim(body) <> ''`; the trim half is
            # the service layer's, since a check constraint cannot call
            # btrim portably across backends.
            models.CheckConstraint(
                condition=~models.Q(body=""),
                name="messages_body_check",
            ),
        ]
        indexes = [
            models.Index(fields=["thread_id", "-created_at"], name="messages_thread_idx"),
            models.Index(
                fields=["thread_id"],
                condition=models.Q(read_at__isnull=True),
                name="messages_unread_idx",
            ),
        ]
