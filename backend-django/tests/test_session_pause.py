"""Pause for a recharge (7 Oct 2026, owner): when the money runs out the
session pauses for two minutes instead of ending. A recharge inside them
carries on the same session; none, and it settles at the moment the money
ran out. Either person may end it sooner. Nobody pays for the pause."""

import pytest
from django.utils import timezone

from apps.chat import services
from apps.chat.models import Session
from apps.consultants.models import EarningsLedger

from .test_chat import (  # noqa: F401 — fixtures by name
    MIN, PRO, RATE, SEEKER, _balance, _fund, money_tables, pro_user,
)

PAUSE = timezone.timedelta(seconds=services.PAUSE_SECONDS)


def _live(pro_user, now, minutes=2):
    _, service = pro_user
    _fund(SEEKER, RATE * minutes)
    asked = services.request_chat(SEEKER, PRO, service.id, now=now)
    assert asked["ok"], asked
    accepted = services.accept_chat(PRO, asked["session_id"], now=now)
    assert accepted["ok"], accepted
    return Session.objects.get(pk=asked["session_id"])


def _beat(session, at):
    """Both screens beat every few seconds; the tests stand in for them."""
    Session.objects.filter(pk=session.id).update(heartbeat_at=at)


@pytest.mark.django_db
class TestPause:
    def test_out_of_money_pauses_rather_than_ends(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        at = t0 + 2 * MIN + 10 * timezone.timedelta(seconds=1)
        _beat(session, at)
        beat = services.heartbeat(SEEKER, session.id, now=at)
        assert beat["live"] is True and beat["paused"] is True and beat["seconds_left"] == 0
        assert beat["pause_seconds_left"] == services.PAUSE_SECONDS - 10
        _beat(session, t0 + 3 * MIN)
        services.sweep_sessions(now=t0 + 3 * MIN)
        assert Session.objects.get(pk=session.id).status == Session.Status.LIVE

    def test_no_message_goes_through_while_paused(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        sent = services.send_message(SEEKER, session.thread_id, "still there?", now=t0 + 2 * MIN + MIN / 2)
        assert sent["ok"] is False

    def test_no_recharge_ends_it_after_the_pause_billed_only_to_the_money(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        assert services.sweep_sessions(now=t0 + 2 * MIN + PAUSE)["settled"] == 1
        session.refresh_from_db()
        assert session.status == Session.Status.ENDED and session.charged_paise == 2 * RATE
        assert EarningsLedger.objects.get(consultant_id=PRO).gross_paise == 2 * RATE

    def test_the_heartbeat_settles_it_once_the_pause_is_over(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        beat = services.heartbeat(SEEKER, session.id, now=t0 + 2 * MIN + PAUSE)
        assert beat["live"] is False
        assert Session.objects.get(pk=session.id).status == Session.Status.ENDED

    def test_either_side_may_end_the_pause(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        ended = services.end_session(PRO, session.id, now=t0 + 2 * MIN + MIN)
        assert ended["charged_paise"] == 2 * RATE and _balance(SEEKER) == 0

    def test_a_recharge_while_paused_carries_on_and_the_pause_is_free(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        _fund(SEEKER, RATE * 3)
        resumed_at = t0 + 2 * MIN + MIN  # a minute into the pause
        _beat(session, resumed_at)
        out = services.extend_session(SEEKER, session.id, now=resumed_at)
        assert out["ok"] and out["paused"] is False and out["minutes_added"] == 3
        assert out["seconds_left"] == 180
        session.refresh_from_db()
        assert session.paused_seconds == 60 and session.hold_paise == 5 * RATE
        assert _balance(SEEKER) == 0
        # Talks one more minute, then ends: three minutes used, not four.
        ended = services.end_session(SEEKER, session.id, now=resumed_at + MIN)
        assert ended["charged_paise"] == 3 * RATE
        assert _balance(SEEKER) == 2 * RATE
        assert EarningsLedger.objects.get(consultant_id=PRO).gross_paise == 3 * RATE

    def test_a_recharge_while_running_adds_to_the_end(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        _fund(SEEKER, RATE * 4)
        _beat(session, t0 + MIN)
        out = services.extend_session(SEEKER, session.id, now=t0 + MIN + MIN / 2)
        assert out["ok"] and out["minutes_added"] == 4
        session.refresh_from_db()
        assert session.expires_at == t0 + 6 * MIN and session.paused_seconds == 0

    def test_a_recharge_too_small_for_a_minute_is_refused(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        _fund(SEEKER, RATE - 1)
        at = t0 + 2 * MIN + 5 * timezone.timedelta(seconds=1)
        _beat(session, at)
        out = services.extend_session(SEEKER, session.id, now=at)
        assert out["ok"] is False and out["balance_paise"] == RATE - 1

    def test_too_late_is_refused_and_settled(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        _fund(SEEKER, RATE * 3)
        out = services.extend_session(SEEKER, session.id, now=t0 + 2 * MIN + PAUSE + MIN)
        assert out["ok"] is False
        assert Session.objects.get(pk=session.id).status == Session.Status.ENDED
        assert _balance(SEEKER) == 3 * RATE

    def test_only_the_seeker_extends(self, pro_user):
        t0 = timezone.now()
        session = _live(pro_user, t0)
        assert services.extend_session(PRO, session.id, now=t0 + MIN)["ok"] is False


@pytest.mark.django_db
class TestPausedCallIsSilent:
    def test_a_paused_call_is_muted_and_a_recharge_unmutes_it(self, pro_user, monkeypatch):
        from apps.video import providers

        sent = []
        monkeypatch.setattr(providers, "is_configured", lambda: True)
        monkeypatch.setattr(providers, "set_can_send", lambda name, can: sent.append(can))
        monkeypatch.setattr(providers, "eject", lambda name, ids: None)
        monkeypatch.setattr(providers, "delete_room", lambda name: None)
        _, service = pro_user
        _fund(SEEKER, RATE * 2)
        t0 = timezone.now()
        asked = services.request_chat(SEEKER, PRO, service.id, now=t0, audio_only=True)
        Session.objects.filter(pk=asked["session_id"]).update(mode=Session.Mode.CALL)
        services.accept_chat(PRO, asked["session_id"], now=t0)
        services.start_clock(asked["session_id"], now=t0)
        session = Session.objects.get(pk=asked["session_id"])
        at = t0 + 2 * MIN + 5 * timezone.timedelta(seconds=1)
        _beat(session, at)
        services.heartbeat(SEEKER, session.id, now=at)
        assert sent == [False]
        _fund(SEEKER, RATE * 2)
        assert services.extend_session(SEEKER, session.id, now=at)["ok"]
        assert sent == [False, ["audio"]]
