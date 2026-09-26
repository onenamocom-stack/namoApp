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
    service = ConsultantService.objects.create(
        consultant_id=PRO, band_id=uuid.uuid4(), mode="call",
        billing="per_minute", duration_mins=1, price_paise=5_000,
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
    def test_a_requested_session_has_not_bought_a_window(
        self, people, configured, fake_daily
    ):
        """No money has moved yet, so there is nothing to join."""
        s = _session(status=Session.Status.REQUESTED, minutes=None)
        assert services.join(SEEKER, s.id)["reason"] == services.REFUSAL_NOT_LIVE

    def test_an_ended_session_is_closed(self, people, configured, fake_daily):
        s = _session(status=Session.Status.ENDED)
        assert services.join(SEEKER, s.id)["reason"] == services.REFUSAL_NOT_LIVE

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
        assert out["retryable"] is True
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
