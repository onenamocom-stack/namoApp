"""Joining the call a paid session already bought.

THE RULE THIS FILE EXISTS FOR: the transport is not the money. A failure
to get a room refuses the JOIN and never the session — a consultant who
cannot open a call must not have been paid as though it happened.
"""

import uuid

import pytest
from django.utils import timezone

from apps.chat.models import Session
from apps.consultants.models import Consultant, ConsultantService
from apps.profiles.models import Profile
from apps.video import providers, services

from .conftest import OTHER_USER, TEST_USER

SEEKER = TEST_USER
PRO = OTHER_USER
STRANGER = "cccccccc-9999-8888-7777-666666666666"


@pytest.fixture
def people(db):
    Profile.objects.all().delete()
    for pid, name in ((SEEKER, "A Seeker"), (PRO, "An Astrologer"),
                      (STRANGER, "Somebody Else")):
        Profile.objects.create(id=pid, phone=str(pid), name=name)
    Consultant.objects.create(profile_id=PRO, category="Astrologer", status="approved")
    yield


@pytest.fixture
def configured(settings):
    settings.DAILY_API_KEY = "test-key"
    settings.DAILY_DOMAIN = "1namo.daily.co"
    settings.DAILY_ENABLE_RECORDING = False
    yield


@pytest.fixture
def fake_daily(monkeypatch):
    """Daily, answering. The point of these tests is our rules, not
    theirs — a real call here would test the network."""
    calls = {"rooms": [], "tokens": []}

    def get_room(name):
        return None

    def create_room(name, expires_at):
        calls["rooms"].append((name, expires_at))
        return {"url": f"https://1namo.daily.co/{name}", "name": name}

    def meeting_token(room_name, user_name, is_owner, expires_at):
        calls["tokens"].append((room_name, user_name, is_owner, expires_at))
        return f"token-for-{user_name}"

    monkeypatch.setattr(providers, "get_room", get_room)
    monkeypatch.setattr(providers, "create_room", create_room)
    monkeypatch.setattr(providers, "meeting_token", meeting_token)
    return calls


def _session(status=Session.Status.LIVE, minutes=10):
    # One service per consultant: the table is unique on
    # (consultant, mode, billing, duration), so a test that makes two
    # sessions must reuse it rather than mint a second.
    service, _ = ConsultantService.objects.get_or_create(
        consultant_id=PRO, mode="call", billing="per_minute", duration_mins=1,
        defaults={"band_id": uuid.uuid4(), "price_paise": 5_000},
    )
    now = timezone.now()
    return Session.objects.create(
        seeker_id=SEEKER, consultant_id=PRO, service=service,
        mode="call", rate_paise=5_000, status=status,
        requested_at=now, started_at=now if status == Session.Status.LIVE else None,
        expires_at=now + timezone.timedelta(minutes=minutes) if minutes else None,
    )


@pytest.mark.django_db
class TestWhoMayJoin:
    def test_both_sides_get_their_own_token(self, people, configured, fake_daily):
        s = _session()
        seeker = services.join(SEEKER, s.id)
        pro = services.join(PRO, s.id)

        assert seeker["ok"] and pro["ok"]
        assert seeker["room"] == pro["room"], "same session, same room"
        assert seeker["token"] != pro["token"], "a token is per person"

    def test_the_consultant_owns_the_room_and_the_seeker_does_not(
        self, people, configured, fake_daily
    ):
        """Owner is what lets them end the room. A seeker with owner
        rights could close a call they are paying for and a call they are
        not."""
        s = _session()
        assert services.join(PRO, s.id)["is_owner"] is True
        assert services.join(SEEKER, s.id)["is_owner"] is False

    def test_a_stranger_is_refused(self, people, configured, fake_daily):
        s = _session()
        out = services.join(STRANGER, s.id)
        assert out["ok"] is False
        assert out["reason"] == services.REFUSAL_NOT_YOURS
        assert fake_daily["tokens"] == [], "a refused caller must not mint a token"


@pytest.mark.django_db
class TestWhenThereIsNoDoor:
    def test_a_requested_session_says_WAIT_not_no(
        self, people, configured, fake_daily
    ):
        """The bug that cost real money on 26 Sep.

        The seeker is sent to the call screen the moment they ask, so the
        first join always lands before the consultant has accepted. That
        refusal used to be final — the screen asked once, showed "that
        session is not live", and never asked again. The consultant
        answered seven seconds later, the meter started, and the seeker
        sat looking at an error until the money ran out.
        """
        s = _session(status=Session.Status.REQUESTED, minutes=None)
        out = services.join(SEEKER, s.id)
        assert out["ok"] is False
        assert out["reason"] == services.REFUSAL_WAITING
        assert out["retry"] is True, "the client must know to ask again"
        assert fake_daily["rooms"] == [], "no room until the money is held"

    def test_a_declined_session_does_not_retry(self, people, configured, fake_daily):
        """Not-live-any-more. Waiting for something that will not happen
        is worse than being told."""
        s = _session(status=Session.Status.DECLINED, minutes=None)
        out = services.join(SEEKER, s.id)
        assert out["reason"] == services.REFUSAL_DECLINED
        assert out["retry"] is False

    def test_an_ended_session_is_closed(self, people, configured, fake_daily):
        s = _session(status=Session.Status.ENDED)
        out = services.join(SEEKER, s.id)
        assert out["reason"] == services.REFUSAL_NOT_LIVE
        assert out["retry"] is False

    def test_an_expired_window_is_refused_rather_than_opened(
        self, people, configured, fake_daily
    ):
        """The sweeper settles it within the minute. Opening a room Daily
        would eject them from two seconds later is a worse answer than
        saying so."""
        s = _session(minutes=10)
        s.expires_at = timezone.now() - timezone.timedelta(seconds=1)
        s.save()
        assert services.join(SEEKER, s.id)["reason"] == services.REFUSAL_EXPIRED
        assert fake_daily["rooms"] == []

    def test_no_key_means_unavailable_not_broken(self, people, settings, fake_daily):
        """The transport is not the money. A missing key degrades to
        'video is unavailable' and never to a session that billed for a
        call nobody could join."""
        settings.DAILY_API_KEY = ""
        settings.DAILY_DOMAIN = ""
        s = _session()
        out = services.join(SEEKER, s.id)
        assert out["reason"] == services.REFUSAL_UNAVAILABLE
        assert Session.objects.get(pk=s.id).status == Session.Status.LIVE

    def test_an_upstream_failure_refuses_the_join_not_the_session(
        self, people, configured, monkeypatch
    ):
        def boom(*a, **k):
            raise providers.UpstreamError("daily is down")

        monkeypatch.setattr(providers, "get_room", boom)
        s = _session()
        out = services.join(SEEKER, s.id)
        assert out["reason"] == services.REFUSAL_UPSTREAM
        # RETRY, not just "retryable". Daily hiccuping for one of the two
        # while the meter runs stranded the seeker on an error screen
        # with their money going — a transient failure must not be a
        # terminal answer while a session is live.
        assert out["retry"] is True
        assert Session.objects.get(pk=s.id).status == Session.Status.LIVE


@pytest.mark.django_db
class TestTheRoomDiesWithTheMoney:
    def test_the_room_expires_when_the_hold_does(self, people, configured, fake_daily):
        """The one that makes per-minute billing mean anything. Without
        it the sweeper settles on time and the two of them keep talking
        for free."""
        s = _session(minutes=7)
        services.join(SEEKER, s.id)
        _name, exp = fake_daily["rooms"][0]
        assert exp == s.expires_at

    def test_the_token_expires_with_it(self, people, configured, fake_daily):
        """A token outliving the hold is a way back into a call that has
        been paid for and closed."""
        s = _session(minutes=7)
        services.join(SEEKER, s.id)
        assert fake_daily["tokens"][0][3] == s.expires_at

    def test_the_room_name_is_derived_and_stable(self, people, configured, fake_daily):
        s = _session()
        assert services.join(SEEKER, s.id)["room"] == services.room_name(s.id)
        assert services.room_name(s.id) == services.room_name(s.id)


@pytest.mark.django_db
class TestCancellingAnUnansweredCall:
    """Walking away before anybody answers.

    `end_session` answers `already_ended` for anything that is not live,
    so a seeker who left had their request sitting there for the
    sweeper's fifteen minutes — and a consultant answering inside that
    window would start the meter for somebody who had gone.
    """

    def test_a_requested_session_can_be_withdrawn(self, people):
        from apps.chat import services as chat

        s = _session(status=Session.Status.REQUESTED, minutes=None)
        assert chat.cancel_request(SEEKER, s.id) == {"ok": True}
        s.refresh_from_db()
        assert s.status == Session.Status.EXPIRED

    def test_a_live_session_is_not_cancelled_this_way(self, people):
        """Money is held against a live one. Ending it is a settle, not a
        withdrawal, and that is `end_session`'s job."""
        from apps.chat import services as chat

        s = _session(status=Session.Status.LIVE)
        assert chat.cancel_request(SEEKER, s.id) == {"ok": True, "already": True}
        s.refresh_from_db()
        assert s.status == Session.Status.LIVE

    def test_a_stranger_cannot_cancel_it(self, people):
        from apps.chat import services as chat

        s = _session(status=Session.Status.REQUESTED, minutes=None)
        assert chat.cancel_request(STRANGER, s.id) == {"ok": True, "already": True}
        s.refresh_from_db()
        assert s.status == Session.Status.REQUESTED

    def test_cancelling_twice_is_not_an_error(self, people):
        from apps.chat import services as chat

        s = _session(status=Session.Status.REQUESTED, minutes=None)
        chat.cancel_request(SEEKER, s.id)
        assert chat.cancel_request(SEEKER, s.id)["already"] is True


@pytest.mark.django_db
class TestDecliningACall:
    """The consultant saying no. No money is involved — the hold is taken
    at accept, so a declined request had none."""

    def test_the_consultant_can_decline(self, people):
        from apps.chat import services as chat

        s = _session(status=Session.Status.REQUESTED, minutes=None)
        assert chat.decline_request(PRO, s.id) == {"ok": True}
        s.refresh_from_db()
        assert s.status == Session.Status.DECLINED

    def test_declined_reads_differently_from_expired(self, people):
        """`expired` is what the sweeper writes when nobody answered at
        all. A consultant who said no on purpose did not simply fail to
        reply, and their record should not say they did.

        One at a time: the table is unique on (seeker, consultant) for an
        open request, which is the rule that stops a seeker stacking five
        calls on one astrologer.
        """
        from apps.chat import services as chat

        declined = _session(status=Session.Status.REQUESTED, minutes=None)
        chat.decline_request(PRO, declined.id)
        declined.refresh_from_db()
        assert declined.status == Session.Status.DECLINED

        walked_away = _session(status=Session.Status.REQUESTED, minutes=None)
        chat.cancel_request(SEEKER, walked_away.id)
        walked_away.refresh_from_db()
        assert walked_away.status == Session.Status.EXPIRED

    def test_a_live_session_is_not_declined(self, people):
        """Money is held against a live one. Ending it is a settle."""
        from apps.chat import services as chat

        s = _session(status=Session.Status.LIVE)
        assert chat.decline_request(PRO, s.id)["already"] is True
        s.refresh_from_db()
        assert s.status == Session.Status.LIVE

    def test_nobody_declines_somebody_elses_call(self, people):
        from apps.chat import services as chat

        s = _session(status=Session.Status.REQUESTED, minutes=None)
        assert chat.decline_request(STRANGER, s.id)["already"] is True
        s.refresh_from_db()
        assert s.status == Session.Status.REQUESTED

    def test_the_seeker_is_told_it_was_declined(self, people, configured, fake_daily):
        """Not left ringing. `join` answers DECLINED with retry false, so
        the call screen stops waiting and says so."""
        from apps.chat import services as chat

        s = _session(status=Session.Status.REQUESTED, minutes=None)
        chat.decline_request(PRO, s.id)
        out = services.join(SEEKER, s.id)
        assert out["reason"] == services.REFUSAL_DECLINED
        assert out["retry"] is False


@pytest.mark.django_db
class TestTheConsultantSeesWhoIsCalling:
    def test_the_session_list_carries_the_seeker_name(self, people):
        """It carried None — `profile_names` keys on the canonical uuid,
        dashes and all, and the lookup stripped them. Every name came
        back empty and the incoming call read "Someone is calling"."""
        from apps.chat import services as chat

        _session(status=Session.Status.REQUESTED, minutes=None)
        row = chat.list_sessions(PRO)[0]
        assert row["seeker_name"] == "A Seeker"
        assert row["consultant_name"] == "An Astrologer"
