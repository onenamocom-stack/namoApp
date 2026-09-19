"""Outbox services (docs/07 §3.1). Callable inside any transaction; the row
rides or dies with the business write — no dual writes anywhere."""

import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import OutboxEvent

logger = logging.getLogger("apps.core.outbox")

# Handlers are registered here by later modules:
#   HANDLERS["chat.session_expired"] = some_callable(event)
# A handler takes the event and performs the side effect; raising marks the
# event for backoff. Phase 1 ships none — dispatch marks placeholder events
# dispatched to prove the pipeline.
HANDLERS = {}

# Exponential backoff: 1min, 2min, 4min ... capped at 1 hour.
BACKOFF_BASE_SECONDS = 60
BACKOFF_CAP_SECONDS = 3600
MAX_ATTEMPTS = 10


def enqueue_outbox(kind, payload, dedupe_key=None, delay=None, using="default"):
    """Write an outbox row in the caller's transaction.

    dedupe_key (optional) makes the enqueue idempotent — a second call with
    the same key inside a later transaction raises IntegrityError, which the
    caller can catch to detect an already-queued side effect. delay (seconds)
    postpones availability without delaying the business write.
    """
    event = OutboxEvent(kind=kind, payload=payload, dedupe_key=dedupe_key)
    if delay:
        event.available_at = timezone.now() + timedelta(seconds=delay)
    event.save(using=using)
    return event


def dispatch_batch(limit=100, now=None):
    """Claim up to `limit` due, undispatched events and dispatch them.

    FOR UPDATE SKIP LOCKED gives disjoint slices to two overlapping
    dispatchers on Postgres. The attempts increment is an optimistic claim
    on top — `WHERE attempts = <seen>` fails for whoever lost the row — so
    exactly-once handler execution holds on every backend, including the
    SQLite the tests run on. Per-item errors are logged, counted on attempts
    and pushed back by backoff; they never abort the batch.
    Returns (dispatched, failed) counts.
    """
    now = now or timezone.now()
    dispatched = 0
    failed = 0
    with transaction.atomic():
        events = list(
            OutboxEvent.objects.select_for_update(skip_locked=True)
            .filter(dispatched_at__isnull=True, available_at__lte=now)
            .order_by("created_at")[:limit]
        )
        for event in events:
            claimed = OutboxEvent.objects.filter(
                pk=event.pk, dispatched_at__isnull=True, attempts=event.attempts
            ).update(attempts=event.attempts + 1)
            if claimed == 0:
                # Another dispatcher took this row after our snapshot.
                continue
            handler = HANDLERS.get(event.kind)
            try:
                if handler is None:
                    raise LookupError(f"no handler registered for kind {event.kind!r}")
                handler(event)
            except Exception as exc:
                failed += 1
                attempts = event.attempts + 1
                last_error = str(exc)[:4000]
                if attempts >= MAX_ATTEMPTS:
                    # Dead letter: stop retrying, keep the row for forensics.
                    OutboxEvent.objects.filter(pk=event.pk).update(
                        attempts=attempts, last_error=last_error, dispatched_at=now
                    )
                    logger.error(
                        "outbox event dead-lettered",
                        extra={"extra": {"event_id": str(event.id), "kind": event.kind,
                                         "attempts": attempts, "error": last_error}},
                    )
                else:
                    backoff = min(BACKOFF_BASE_SECONDS * (2 ** (attempts - 1)), BACKOFF_CAP_SECONDS)
                    OutboxEvent.objects.filter(pk=event.pk, dispatched_at__isnull=True).update(
                        attempts=attempts, last_error=last_error, available_at=now + timedelta(seconds=backoff)
                    )
                    logger.warning(
                        "outbox dispatch failed; backing off",
                        extra={"extra": {"event_id": str(event.id), "kind": event.kind,
                                         "attempts": attempts, "error": last_error}},
                    )
            else:
                OutboxEvent.objects.filter(pk=event.pk).update(dispatched_at=now, last_error="")
                dispatched += 1
    return dispatched, failed
