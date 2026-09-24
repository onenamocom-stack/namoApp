"""Who is online, and what that is allowed to mean.

A green dot is a promise: press this and somebody answers. Every test here
exists because a dot that lies costs a seeker their evening and costs the
product the seeker.

THE TWO-HALF RULE. Online is `accepting_now AND a heartbeat in the last
ninety seconds`. Either half alone produces the same bad ending — a dot,
a call, and nobody there — by a different route, and both routes are
tested below.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.consultants import services
from apps.consultants.models import Consultant, ConsultantService
from apps.chat import services as chat_services
from apps.chat.services import REFUSAL_OFFLINE

from .conftest import OTHER_USER, TEST_USER, make_claims

SEEKER = TEST_USER
PRO = OTHER_USER
RATE = 900


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def pro_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=PRO))


@pytest.fixture
def pro():
    Consultant.objects.all().delete()
    return Consultant.objects.create(
        profile_id=PRO, category="Astrologer", status="approved"
    )


def _online(row, seconds_ago=0):
    row.accepting_now = True
    row.last_seen_at = timezone.now() - timedelta(seconds=seconds_ago)
    row.save()
    return row


@pytest.mark.django_db
class TestOnlineIsBothHalves:
    def test_a_fresh_consultant_is_offline(self, pro):
        """Default off. A consultant who has never opened the app must not
        be advertised as available by the act of being approved."""
        assert services.is_online(PRO) is False

    def test_the_switch_alone_is_not_online(self, pro):
        """They flipped it on this morning, shut the app, and went to
        sleep. The dot has to go dark by itself — nothing is going to
        write "offline" for a phone that is off."""
        pro.accepting_now = True
        pro.last_seen_at = timezone.now() - timedelta(hours=8)
        pro.save()
        assert services.is_online(PRO) is False

    def test_the_heartbeat_alone_is_not_online(self, pro):
        """Their app is open on the earnings screen while they eat dinner.
        Having the app open is not consent to be called."""
        pro.accepting_now = False
        pro.last_seen_at = timezone.now()
        pro.save()
        assert services.is_online(PRO) is False

    def test_both_together_is_online(self, pro):
        _online(pro)
        assert services.is_online(PRO) is True

    def test_a_missed_beat_is_forgiven(self, pro):
        """The app beats every 30s and the grace is 90s, so two dropped
        beats — a wifi-to-mobile handover mid-tap — must not blink the
        dot."""
        _online(pro, seconds_ago=60)
        assert services.is_online(PRO) is True

    def test_a_dead_app_goes_dark(self, pro):
        _online(pro, seconds_ago=services.PRESENCE_GRACE_SECONDS + 5)
        assert services.is_online(PRO) is False

    def test_an_unapproved_consultant_is_never_online(self, pro):
        """Pending and blocked practices are invisible. Presence must not
        be a side door into the roster."""
        _online(pro)
        pro.status = "pending"
        pro.save()
        assert services.is_online(PRO) is False


@pytest.mark.django_db
class TestTheEndpoint:
    def test_a_heartbeat_leaves_the_switch_alone(self, pro, client, pro_token):
        """A bare POST is a beat, not a toggle. If it turned the switch on,
        an app open in a background tab would put somebody online."""
        response = client.post("/v1/consultants/presence/", data={},
                               content_type="application/json", **auth(pro_token))
        assert response.status_code == 200
        assert response.json()["accepting_now"] is False
        assert response.json()["online"] is False

    def test_the_toggle_turns_it_on_and_the_same_call_is_the_beat(
        self, pro, client, pro_token
    ):
        response = client.post("/v1/consultants/presence/", data={"accepting": True},
                               content_type="application/json", **auth(pro_token))
        body = response.json()
        assert body["accepting_now"] is True
        assert body["online"] is True, "the toggle must not need a second call to go live"

    def test_the_toggle_turns_it_off(self, pro, client, pro_token):
        _online(pro)
        client.post("/v1/consultants/presence/", data={"accepting": False},
                    content_type="application/json", **auth(pro_token))
        assert services.is_online(PRO) is False

    def test_it_is_always_about_the_caller(self, pro, client, sign_hs256, hs256_mode):
        """No consultant_id in the body, by design. A route that lets one
        account mark another online lets anybody put a green dot on
        somebody who has gone home."""
        stranger = sign_hs256(claims=make_claims(sub=SEEKER))
        response = client.post("/v1/consultants/presence/", data={"accepting": True},
                               content_type="application/json", **auth(stranger))
        assert response.status_code == 403
        assert services.is_online(PRO) is False

    def test_signing_out_takes_the_dot_down(self, pro):
        _online(pro)
        assert services.go_offline(PRO) is True
        assert services.is_online(PRO) is False


@pytest.mark.django_db
class TestTheRosterAndTheGate:
    def test_the_roster_carries_the_flag(self, pro, client):
        rows = {r["profile_id"]: r for r in client.get("/v1/consultants/").json()}
        assert rows[str(PRO)]["online"] is False
        _online(pro)
        rows = {r["profile_id"]: r for r in client.get("/v1/consultants/").json()}
        assert rows[str(PRO)]["online"] is True

    def test_a_session_request_to_an_offline_consultant_is_refused(self, pro):
        """The gate that matters. The roster's dot was a second old when it
        was drawn; the server re-checks rather than trusting it."""
        service = ConsultantService.objects.create(
            consultant_id=PRO, band_id="11111111-2222-3333-4444-555555555555",
            mode="chat", billing="per_minute", duration_mins=1, price_paise=RATE,
        )
        result = chat_services.request_chat(SEEKER, PRO, service.id)
        assert result == {"ok": False, "reason": REFUSAL_OFFLINE}

    def test_the_refusal_comes_before_any_money_is_looked_at(self, pro):
        """A seeker with an empty wallet asking an offline consultant is
        told the astrologer is offline — the fixable thing, and the true
        one. Telling them to add money would send them to pay for a call
        that still would not connect."""
        service = ConsultantService.objects.create(
            consultant_id=PRO, band_id="11111111-2222-3333-4444-555555555555",
            mode="chat", billing="per_minute", duration_mins=1, price_paise=RATE,
        )
        result = chat_services.request_chat(SEEKER, PRO, service.id)
        assert result["reason"] == REFUSAL_OFFLINE
        assert "balance" not in result
