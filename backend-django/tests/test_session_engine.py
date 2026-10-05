"""The session engine's 5 Oct 2026 rules (apps/chat/services.py header):

1. One ringing request and one live session per consultant — a second
   caller hears "busy", nothing is written, nothing is charged.
2. A call's clock starts when both people are in the room, by the room's
   own participant list; a call that never connects costs ₹0.
3. Nothing waits for a scheduler: stale rings and dead connects are settled
   by whoever next touches that consultant.

Fixtures and helpers come from test_chat, which owns the money tables.
"""

import threading

import pytest
from django.utils import timezone

from apps.chat import services
from apps.chat.models import Session
from apps.consultants.models import EarningsLedger

from .test_chat import (  # noqa: F401  (fixtures are used by name)
    PRO, RATE, SEC, SECOND_SEEKER, SEEKER, _balance, _counts, _fund, _t0,
    money_tables, pro_user,
)


def _call_session(pro_user, seeker=SEEKER, fund=RATE * 10, channel="video", now=None):
    _, service = pro_user
    if fund:
        _fund(seeker, fund)
    requested = services.request_chat(seeker, PRO, service.id, channel=channel)
    assert requested["ok"], requested
    accepted = services.accept_chat(PRO, requested["session_id"], now=now or _t0())
    assert accepted["ok"], accepted
    return Session.objects.get(pk=accepted["session_id"])


@pytest.mark.django_db
class TestConnectPhase:
    def test_the_channel_sets_the_mode(self, pro_user):
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        video = services.request_chat(SEEKER, PRO, service.id, channel="video")
        assert video["mode"] == "call"
        services.cancel_request(SEEKER, video["session_id"])
        audio = services.request_chat(SEEKER, PRO, service.id, channel="audio")
        row = Session.objects.get(pk=audio["session_id"])
        assert row.mode == "call" and row.audio_only is True
        services.cancel_request(SEEKER, audio["session_id"])
        chat = services.request_chat(SEEKER, PRO, service.id, channel="chat")
        assert chat["mode"] == "chat"

    def test_a_call_holds_the_money_but_the_clock_waits(self, pro_user):
        session = _call_session(pro_user)
        assert session.status == "live" and session.accepted_at is not None
        assert session.started_at is None and session.expires_at is None
        assert _balance(SEEKER) == RATE * 10 - session.hold_paise

    def test_the_clock_starts_when_both_are_in_the_room(self, pro_user, monkeypatch):
        from apps.video import services as video_services

        session = _call_session(pro_user)
        monkeypatch.setattr(video_services, "both_present", lambda s: False)
        assert services.heartbeat(SEEKER, session.id)["connecting"] is True
        monkeypatch.setattr(video_services, "both_present", lambda s: True)
        moved = []
        monkeypatch.setattr(video_services, "clock_started", lambda s: moved.append(s.id))
        result = services.heartbeat(SEEKER, session.id)
        assert result["connecting"] is False and result["seconds_left"] > 0
        session.refresh_from_db()
        minutes = session.hold_paise // session.rate_paise
        assert session.expires_at - session.started_at == timezone.timedelta(minutes=minutes)
        assert moved == [session.id]  # the room's end moved to the paid end

    def test_starting_twice_starts_once(self, pro_user):
        session = _call_session(pro_user)
        t0 = _t0()
        assert services.start_clock(session.id, now=t0) is True
        assert services.start_clock(session.id, now=t0 + 5 * SEC) is False
        assert Session.objects.get(pk=session.id).started_at == t0

    def test_a_call_that_never_connects_costs_nothing(self, pro_user, monkeypatch):
        from apps.video import services as video_services

        monkeypatch.setattr(video_services, "both_present", lambda s: False)
        t0 = _t0()
        session = _call_session(pro_user, now=t0)
        later = t0 + (services.CONNECT_SECONDS + 1) * SEC
        result = services.heartbeat(SEEKER, session.id, now=later)
        assert result["live"] is False and result["never_connected"] is True
        session.refresh_from_db()
        assert session.status == "ended" and session.charged_paise == 0
        assert _balance(SEEKER) == RATE * 10  # every paisa back
        assert not EarningsLedger.objects.filter(consultant_id=PRO).exists()

    def test_the_sweeper_also_settles_a_dead_connect(self, pro_user):
        t0 = _t0()
        session = _call_session(pro_user, now=t0)
        later = t0 + (services.CONNECT_SECONDS + 1) * SEC
        assert services.sweep_sessions(now=later)["settled"] == 1
        assert Session.objects.get(pk=session.id).charged_paise == 0

    def test_ending_before_the_clock_starts_refunds_everything(self, pro_user):
        session = _call_session(pro_user)
        result = services.end_session(SEEKER, session.id)
        assert result["charged_paise"] == 0
        assert result["refunded_paise"] == session.hold_paise
        assert _balance(SEEKER) == RATE * 10

    def test_a_chat_starts_on_accept(self, pro_user):
        session = _call_session(pro_user, channel="chat")
        assert session.started_at is not None and session.expires_at is not None


@pytest.mark.django_db
class TestOneCallerAtATime:
    def test_a_second_caller_hears_busy_while_the_first_rings(self, pro_user):
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        _fund(SECOND_SEEKER, RATE * 5)
        first = services.request_chat(SEEKER, PRO, service.id)
        before = _counts(SECOND_SEEKER)
        second = services.request_chat(SECOND_SEEKER, PRO, service.id)
        assert first["ok"] is True
        assert second == {"ok": False, "busy": True, "reason": services.REFUSAL_BUSY,
                          "retry_after": 5}
        assert _counts(SECOND_SEEKER) == before  # nothing written, nothing charged

    def test_busy_while_in_a_session_and_free_after(self, pro_user):
        _, service = pro_user
        session = _call_session(pro_user, channel="chat")
        _fund(SECOND_SEEKER, RATE * 5)
        assert services.request_chat(SECOND_SEEKER, PRO, service.id)["busy"] is True
        assert services.is_busy(PRO) is True
        services.end_session(PRO, session.id)
        assert services.is_busy(PRO) is False
        assert services.request_chat(SECOND_SEEKER, PRO, service.id)["ok"] is True

    def test_a_stale_ring_frees_the_consultant_without_a_sweeper(self, pro_user):
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        _fund(SECOND_SEEKER, RATE * 5)
        first = services.request_chat(SEEKER, PRO, service.id)
        Session.objects.filter(pk=first["session_id"]).update(
            requested_at=_t0() - (services.RING_SECONDS + 1) * SEC)
        # No sweep runs: the next request settles the stale ring itself.
        second = services.request_chat(SECOND_SEEKER, PRO, service.id)
        assert second["ok"] is True
        assert Session.objects.get(pk=first["session_id"]).status == "expired"

    def test_a_ring_that_stopped_cannot_be_answered(self, pro_user):
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        req = services.request_chat(SEEKER, PRO, service.id)
        Session.objects.filter(pk=req["session_id"]).update(
            requested_at=_t0() - (services.RING_SECONDS + 1) * SEC)
        bal = _balance(SEEKER)
        assert services.accept_chat(PRO, req["session_id"]) == {
            "ok": False, "reason": services.REFUSAL_RING_OVER}
        assert _balance(SEEKER) == bal

    def test_asking_twice_is_the_same_ask(self, pro_user):
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        a = services.request_chat(SEEKER, PRO, service.id)
        b = services.request_chat(SEEKER, PRO, service.id)
        assert a["session_id"] == b["session_id"]


@pytest.mark.django_db(transaction=True)
class TestCallerRace:
    def test_two_seekers_ring_one_consultant_at_once(self, pro_user):
        """Two people press Call on the same consultant in the same instant.
        Exactly one rings; the other hears busy; nobody is charged."""
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        _fund(SECOND_SEEKER, RATE * 5)
        barrier, results = threading.Barrier(2), []

        def fire(pid):
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.request_chat(pid, PRO, service.id))

        threads = [threading.Thread(target=fire, args=(p,)) for p in (SEEKER, SECOND_SEEKER)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert len(results) == 2
        assert sum(1 for r in results if r.get("ok")) == 1
        assert sum(1 for r in results if r.get("busy")) == 1
        assert Session.objects.filter(consultant_id=PRO, status="requested").count() == 1


@pytest.mark.django_db
class TestBusyOnTheRoster:
    def test_the_public_list_says_busy(self, pro_user):
        from apps.consultants import services as consultant_services

        def busy():
            return consultant_services.public_consultants().get(profile_id=PRO).busy

        assert busy() is False
        _call_session(pro_user, channel="chat")
        assert busy() is True


@pytest.mark.django_db
class TestSweepEndpoint:
    def test_without_the_token_it_refuses(self, settings, client):
        settings.SWEEP_TOKEN = "s3cret"
        assert client.post("/v1/chat/sweep/").status_code == 401
        assert client.post("/v1/chat/sweep/", HTTP_X_SWEEP_TOKEN="nope").status_code == 401

    def test_with_the_token_it_sweeps(self, settings, client):
        settings.SWEEP_TOKEN = "s3cret"
        body = client.post("/v1/chat/sweep/", HTTP_X_SWEEP_TOKEN="s3cret").json()
        assert body["ok"] is True and "settled" in body and "alerts_flushed" in body

    def test_unset_token_means_off(self, settings, client):
        settings.SWEEP_TOKEN = ""
        assert client.post("/v1/chat/sweep/", HTTP_X_SWEEP_TOKEN="").status_code == 401


@pytest.mark.django_db
class TestMissedCalls:
    def _ring_out(self, pro_user, seeker):
        _, service = pro_user
        r = services.request_chat(seeker, PRO, service.id)
        assert r["ok"], r
        Session.objects.filter(pk=r["session_id"]).update(
            requested_at=_t0() - (services.RING_SECONDS + 2) * SEC)
        services.sweep_sessions()
        return r["session_id"]

    def test_three_rings_out_in_a_row_switch_the_consultant_off(self, pro_user):
        from apps.consultants.models import Consultant

        _fund(SEEKER, RATE * 5)
        for _ in range(3):
            self._ring_out(pro_user, SEEKER)
        assert Consultant.objects.get(profile_id=PRO).accepting_now is False

    def test_two_missed_then_an_answer_keeps_them_online(self, pro_user):
        from apps.consultants.models import Consultant

        _fund(SEEKER, RATE * 5)
        self._ring_out(pro_user, SEEKER)
        self._ring_out(pro_user, SEEKER)
        s = _call_session(pro_user, channel="chat", fund=0)
        services.end_session(PRO, s.id)
        self._ring_out(pro_user, SEEKER)
        assert Consultant.objects.get(profile_id=PRO).accepting_now is True

    def test_a_seeker_cancelling_is_not_a_missed_call(self, pro_user):
        from apps.consultants.models import Consultant

        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        for _ in range(3):
            r = services.request_chat(SEEKER, PRO, service.id)
            services.cancel_request(SEEKER, r["session_id"])
        services.sweep_sessions()
        assert Consultant.objects.get(profile_id=PRO).accepting_now is True


@pytest.mark.django_db
class TestRinging:
    def test_a_request_rings_the_consultants_phones(self, pro_user, monkeypatch, django_capture_on_commit_callbacks):
        from apps.notifications import push

        rung = []
        monkeypatch.setattr(push, "ring", lambda s, name: rung.append((str(s.id), name)))
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        with django_capture_on_commit_callbacks(execute=True):
            r = services.request_chat(SEEKER, PRO, service.id, channel="video")
        assert rung == [(r["session_id"], "Tara Verma")]

    def test_a_busy_answer_rings_nobody(self, pro_user, monkeypatch, django_capture_on_commit_callbacks):
        from apps.notifications import push

        rung = []
        monkeypatch.setattr(push, "ring", lambda s, name: rung.append(s.id))
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        _fund(SECOND_SEEKER, RATE * 5)
        with django_capture_on_commit_callbacks(execute=True):
            services.request_chat(SEEKER, PRO, service.id)
            services.request_chat(SECOND_SEEKER, PRO, service.id)
        assert len(rung) == 1

    def test_push_failures_never_break_a_request(self, pro_user, monkeypatch, django_capture_on_commit_callbacks):
        from apps.notifications import push

        def boom(*a, **k):
            raise RuntimeError("push service down")

        monkeypatch.setattr(push, "ring", boom)
        _, service = pro_user
        _fund(SEEKER, RATE * 5)
        with django_capture_on_commit_callbacks(execute=True):
            assert services.request_chat(SEEKER, PRO, service.id)["ok"] is True
