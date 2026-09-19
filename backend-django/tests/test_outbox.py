import threading
from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from apps.core import services
from apps.core.models import OutboxEvent
from apps.core.services import BACKOFF_BASE_SECONDS, MAX_ATTEMPTS, dispatch_batch, enqueue_outbox

KIND = "test.event"
FAIL_KIND = "test.fail"


@pytest.fixture
def handlers(monkeypatch):
    calls = []
    failures = []

    def ok_handler(event):
        calls.append(event.id)

    def fail_handler(event):
        failures.append(event.id)
        raise RuntimeError("handler blew up")

    monkeypatch.setitem(services.HANDLERS, KIND, ok_handler)
    monkeypatch.setitem(services.HANDLERS, FAIL_KIND, fail_handler)
    return calls, failures


@pytest.mark.django_db
class TestEnqueue:
    def test_row_written_in_caller_transaction(self):
        with transaction.atomic():
            enqueue_outbox(KIND, {"a": 1})
            assert OutboxEvent.objects.count() == 1
        assert OutboxEvent.objects.count() == 1

    def test_rollback_takes_the_event_with_it(self):
        try:
            with transaction.atomic():
                enqueue_outbox(KIND, {"a": 1})
                raise RuntimeError("business write failed")
        except RuntimeError:
            pass
        assert OutboxEvent.objects.count() == 0

    def test_dedupe_key_unique(self):
        enqueue_outbox(KIND, {"a": 1}, dedupe_key="once")
        # Inner atomic = savepoint, so the expected IntegrityError does not
        # poison the surrounding transaction.
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                enqueue_outbox(KIND, {"a": 2}, dedupe_key="once")
        assert OutboxEvent.objects.count() == 1

    def test_dedupe_key_nullable(self):
        enqueue_outbox(KIND, {"a": 1})
        enqueue_outbox(KIND, {"a": 2})
        assert OutboxEvent.objects.count() == 2

    def test_delay_pushes_available_at(self):
        before = timezone.now()
        event = enqueue_outbox(KIND, {}, delay=300)
        assert event.available_at >= before + timedelta(seconds=299)


@pytest.mark.django_db
class TestDispatch:
    def test_dispatches_due_events_once(self, handlers):
        calls, _ = handlers
        for i in range(3):
            enqueue_outbox(KIND, {"i": i})
        dispatched, failed = dispatch_batch()
        assert (dispatched, failed) == (3, 0)
        assert len(calls) == 3
        assert OutboxEvent.objects.filter(dispatched_at__isnull=False).count() == 3

    def test_second_pass_finds_nothing(self, handlers):
        enqueue_outbox(KIND, {})
        assert dispatch_batch() == (1, 0)
        assert dispatch_batch() == (0, 0)

    def test_future_available_at_not_picked_up(self, handlers):
        calls, _ = handlers
        enqueue_outbox(KIND, {}, delay=600)
        assert dispatch_batch() == (0, 0)
        assert calls == []
        # Once the window arrives, it dispatches.
        future = timezone.now() + timedelta(seconds=601)
        assert dispatch_batch(now=future) == (1, 0)

    def test_failing_handler_does_not_block_others(self, handlers):
        calls, failures = handlers
        enqueue_outbox(FAIL_KIND, {})
        enqueue_outbox(KIND, {})
        dispatched, failed = dispatch_batch()
        assert (dispatched, failed) == (1, 1)
        assert len(calls) == 1 and len(failures) == 1

        failed_event = OutboxEvent.objects.get(kind=FAIL_KIND)
        assert failed_event.dispatched_at is None
        assert failed_event.attempts == 1
        assert "handler blew up" in failed_event.last_error
        # Backoff pushed it out of the dispatchable window.
        assert failed_event.available_at > timezone.now()

    def test_backoff_respects_available_at(self, handlers):
        enqueue_outbox(FAIL_KIND, {})
        dispatch_batch()
        # Immediate second pass: still backing off, not re-attempted.
        assert dispatch_batch() == (0, 0)
        # Past the backoff window: attempted again.
        later = timezone.now() + timedelta(seconds=BACKOFF_BASE_SECONDS + 1)
        dispatched, failed = dispatch_batch(now=later)
        assert (dispatched, failed) == (0, 1)
        assert OutboxEvent.objects.get().attempts == 2

    def test_unknown_kind_fails_with_backoff(self):
        enqueue_outbox("no.such.handler", {})
        dispatched, failed = dispatch_batch()
        assert (dispatched, failed) == (0, 1)
        event = OutboxEvent.objects.get()
        assert "no handler registered" in event.last_error
        assert event.attempts == 1

    def test_dead_letters_after_max_attempts(self, handlers):
        event = enqueue_outbox(FAIL_KIND, {})
        event.attempts = MAX_ATTEMPTS - 1
        event.save()
        dispatched, failed = dispatch_batch()
        assert (dispatched, failed) == (0, 1)
        event.refresh_from_db()
        assert event.attempts == MAX_ATTEMPTS
        assert event.dispatched_at is not None  # dead-lettered, row kept

    def test_dispatch_marks_dispatched_at_timestamp(self, handlers):
        enqueue_outbox(KIND, {})
        dispatch_batch()
        assert OutboxEvent.objects.get().dispatched_at is not None

    def test_management_command_dispatches(self, handlers):
        enqueue_outbox(KIND, {})
        call_command("dispatch_outbox")
        assert OutboxEvent.objects.get().dispatched_at is not None

    def test_management_command_batch_limit(self, handlers):
        calls, _ = handlers
        for _ in range(3):
            enqueue_outbox(KIND, {})
        call_command("dispatch_outbox", batch=2)
        assert len(calls) == 2
        call_command("dispatch_outbox", batch=2)
        assert len(calls) == 3


@pytest.mark.django_db(transaction=True)
class TestOverlappingDispatchers:
    """Two dispatchers racing on the same due events: every handler runs
    exactly once across both — the optimistic attempts-claim is the
    backstop under SKIP LOCKED."""

    def test_two_overlapping_dispatchers_dispatch_exactly_once(self, monkeypatch):
        handled = []
        handled_lock = threading.Lock()
        started = threading.Barrier(3)

        def slow_handler(event):
            with handled_lock:
                handled.append(event.id)

        monkeypatch.setitem(services.HANDLERS, KIND, slow_handler)
        for _ in range(4):
            enqueue_outbox(KIND, {})

        results = []

        def dispatch():
            connection.close()
            started.wait(timeout=10)
            results.append(dispatch_batch())

        threads = [threading.Thread(target=dispatch) for _ in range(2)]
        for t in threads:
            t.start()
        started.wait(timeout=10)
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)

        assert sorted(results) == sorted([(4, 0), (0, 0)])
        assert len(handled) == 4
        assert OutboxEvent.objects.filter(dispatched_at__isnull=False).count() == 4
