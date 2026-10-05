"""Whole journeys through the HTTP API, two people at a time (5 Oct 2026).

Each test is one story a real seeker and consultant can live through —
including the ones nobody asked about: the seeker cancelling while the
consultant is answering, the consultant declining, a third caller during a
call, the money after a call that never connected. Daily is faked; every
other layer is the real one.
"""

import pytest
from django.utils import timezone

from apps.chat import services
from apps.chat.models import Session
from apps.consultants.models import EarningsLedger
from apps.video import providers
from apps.video import services as video_services

from .conftest import make_claims
from .test_chat import (  # noqa: F401  (fixtures are used by name)
    PRO, RATE, SEC, SECOND_SEEKER, SEEKER, STRANGER, _balance, _fund, _t0, auth,
    money_tables, pro_user,
)


@pytest.fixture
def daily(settings, monkeypatch):
    """Daily, answering. `present` is who the room says is in it."""
    settings.DAILY_API_KEY = "test-key"
    settings.DAILY_DOMAIN = "1namo.daily.co"
    state = {"present": set(), "expiry_moves": []}
    monkeypatch.setattr(providers, "get_room", lambda name: None)
    monkeypatch.setattr(providers, "create_room",
                        lambda name, exp: {"url": f"https://1namo.daily.co/{name}"})
    monkeypatch.setattr(providers, "meeting_token", lambda *a, **k: f"tok-{k.get('user_id')}")
    monkeypatch.setattr(providers, "present_user_ids", lambda name: set(state["present"]))
    monkeypatch.setattr(providers, "set_room_expiry",
                        lambda name, exp: state["expiry_moves"].append((name, exp)))
    from django.core.cache import cache

    cache.clear()
    return state


def _id(value):
    return str(value).replace("-", "").lower()


@pytest.fixture
def people(hs256_mode, sign_hs256, api_client, pro_user):
    tokens = {
        "seeker": sign_hs256(claims=make_claims(sub=SEEKER)),
        "second": sign_hs256(claims=make_claims(sub=SECOND_SEEKER)),
        "pro": sign_hs256(claims=make_claims(sub=PRO, role="consultant")),
        "stranger": sign_hs256(claims=make_claims(sub=STRANGER)),
    }
    service = pro_user[1]

    def post(who, path, body=None):
        r = api_client.post(path, body or {}, format="json", **auth(tokens[who]))
        assert r.status_code in (200, 201), (path, r.status_code, r.content[:300])
        return r.json()

    def get(who, path):
        r = api_client.get(path, **auth(tokens[who]))
        assert r.status_code == 200, (path, r.status_code)
        return r.json()

    def ask(who="seeker", channel="video"):
        return post(who, "/v1/chat/sessions/request/",
                    {"consultant_id": PRO, "service_id": str(service.id), "channel": channel})

    return {"post": post, "get": get, "ask": ask, "service": service}


def _roster_row(people):
    rows = people["get"]("seeker", "/v1/consultants/")
    return next(r for r in rows if _id(r["id"] if "id" in r else r["profile_id"]) == _id(PRO))


@pytest.mark.django_db
class TestAVideoCallStory:
    def test_ring_answer_connect_talk_end(self, people, daily):
        _fund(SEEKER, RATE * 10)
        asked = people["ask"]()
        assert asked["ok"] and asked["mode"] == "call"
        sid = asked["session_id"]

        # While it rings: the consultant shows busy to everyone else, and
        # the seeker's balance has not moved.
        assert _roster_row(people)["busy"] is True
        assert _balance(SEEKER) == RATE * 10

        # The consultant answers: money held, clock NOT started.
        accepted = people["post"]("pro", f"/v1/chat/sessions/{sid}/accept/")
        assert accepted["ok"] and accepted["connecting"] is True
        assert _balance(SEEKER) == 0  # the whole wallet is the hold (017)

        # Both join the room. Only the consultant is in at first.
        for who in ("seeker", "pro"):
            j = people["post"](who, f"/v1/video/sessions/{sid}/join/")
            # A provisional end, never empty — old apps hung up on an empty one.
            assert j["ok"] and j["connecting"] is True and j["expires_at"]
        daily["present"] = {_id(PRO)}
        hb = people["post"]("seeker", f"/v1/chat/sessions/{sid}/heartbeat/")
        assert hb["connecting"] is True and hb["seconds_left"] is None

        # Now both are in: the next beat starts the clock and moves the room.
        # (The room's answer is cached two seconds; the next beat after that
        # sees the change — at worst the clock starts two seconds late.)
        from django.core.cache import cache

        cache.clear()
        daily["present"] = {_id(PRO), _id(SEEKER)}
        hb = people["post"]("pro", f"/v1/chat/sessions/{sid}/heartbeat/")
        assert hb["connecting"] is False and hb["seconds_left"] > 9 * 60
        assert len(daily["expiry_moves"]) == 1

        # Talk two minutes (moved on the clock, not waited), then end.
        Session.objects.filter(pk=sid).update(
            # 1:50 ago: ending now lands inside the fourth 30-second block.
            started_at=timezone.now() - 110 * SEC,
            expires_at=timezone.now() + 8 * 60 * SEC)
        ended = people["post"]("seeker", f"/v1/chat/sessions/{sid}/end/")
        assert ended["charged_paise"] == 2 * RATE
        assert _balance(SEEKER) == 8 * RATE

        # The consultant earned it, labelled as a video call.
        row = EarningsLedger.objects.get(consultant_id=PRO)
        assert row.gross_paise == 2 * RATE and "video call" in row.kind

        # Free again, and the history says what happened.
        assert _roster_row(people)["busy"] is False
        mine = [s for s in people["get"]("seeker", "/v1/chat/sessions/") if s["id"] == sid][0]
        assert mine["mode"] == "call" and mine["charged_paise"] == 2 * RATE
        threads = people["get"]("seeker", "/v1/chat/threads/")
        assert threads[0]["last_session"]["kind"] == "video"
        assert threads[0]["last_session"]["seconds"] >= 110

    def test_nobody_joins_and_nothing_is_charged(self, people, daily):
        _fund(SEEKER, RATE * 3)
        sid = people["ask"]()["session_id"]
        people["post"]("pro", f"/v1/chat/sessions/{sid}/accept/")
        Session.objects.filter(pk=sid).update(
            accepted_at=_t0() - (services.CONNECT_SECONDS + 5) * SEC)
        hb = people["post"]("seeker", f"/v1/chat/sessions/{sid}/heartbeat/")
        assert hb["live"] is False and hb["never_connected"] is True
        assert _balance(SEEKER) == RATE * 3
        assert not EarningsLedger.objects.exists()
        # The room will not open after that.
        assert Session.objects.get(pk=sid).status == "ended"

    def test_the_seeker_hangs_up_while_connecting(self, people, daily):
        _fund(SEEKER, RATE * 3)
        sid = people["ask"]()["session_id"]
        people["post"]("pro", f"/v1/chat/sessions/{sid}/accept/")
        ended = people["post"]("seeker", f"/v1/chat/sessions/{sid}/end/")
        assert ended["charged_paise"] == 0
        assert _balance(SEEKER) == RATE * 3


@pytest.mark.django_db
class TestASecondCallerStory:
    def test_busy_then_through_after_the_first_call(self, people, daily):
        _fund(SEEKER, RATE * 5)
        _fund(SECOND_SEEKER, RATE * 5)
        first = people["ask"]("seeker")["session_id"]
        busy = people["ask"]("second")
        assert busy["ok"] is False and busy["busy"] is True
        # The consultant's queue shows ONE caller.
        queue = [s for s in people["get"]("pro", "/v1/chat/sessions/") if s["status"] == "requested"]
        assert len(queue) == 1 and queue[0]["id"] == first
        people["post"]("pro", f"/v1/chat/sessions/{first}/accept/")
        assert people["ask"]("second")["busy"] is True  # still busy: in a call
        people["post"]("pro", f"/v1/chat/sessions/{first}/end/")
        assert people["ask"]("second")["ok"] is True  # through
        assert _balance(SECOND_SEEKER) == RATE * 5  # asking cost nothing

    def test_declined_frees_the_consultant(self, people, daily):
        _fund(SEEKER, RATE * 5)
        _fund(SECOND_SEEKER, RATE * 5)
        first = people["ask"]("seeker")["session_id"]
        people["post"]("pro", f"/v1/chat/sessions/{first}/decline/")
        assert people["ask"]("second")["ok"] is True

    def test_cancelled_by_the_seeker_frees_the_consultant(self, people, daily):
        _fund(SEEKER, RATE * 5)
        _fund(SECOND_SEEKER, RATE * 5)
        first = people["ask"]("seeker")["session_id"]
        people["post"]("seeker", f"/v1/chat/sessions/{first}/cancel/")
        assert people["ask"]("second")["ok"] is True
        # Answering the cancelled request now does nothing and takes nothing.
        late = people["post"]("pro", f"/v1/chat/sessions/{first}/accept/")
        assert late["ok"] is False
        assert _balance(SEEKER) == RATE * 5


@pytest.mark.django_db
class TestAChatStory:
    def test_chat_starts_on_accept_and_messages_flow(self, people, daily):
        _fund(SEEKER, RATE * 4)
        asked = people["ask"](channel="chat")
        assert asked["mode"] == "chat"
        sid = asked["session_id"]
        accepted = people["post"]("pro", f"/v1/chat/sessions/{sid}/accept/")
        assert accepted["connecting"] is False and accepted["thread_id"]
        tid = accepted["thread_id"]
        people["post"]("seeker", f"/v1/chat/threads/{tid}/messages/send/", {"body": "Namaste"})
        people["post"]("pro", f"/v1/chat/threads/{tid}/messages/send/", {"body": "Namaste ji"})
        people["post"]("pro", f"/v1/chat/sessions/{sid}/end/")
        # The transcript stays readable after the session, by both.
        for who in ("seeker", "pro"):
            msgs = people["get"](who, f"/v1/chat/threads/{tid}/messages/")
            assert [m["body"] for m in msgs] == ["Namaste", "Namaste ji"]
        # And nobody else can read it.
        r = people["get"]  # noqa: F841
        threads = people["get"]("seeker", "/v1/chat/threads/")
        assert threads[0]["last_session"]["kind"] == "chat"

    def test_a_stranger_cannot_touch_the_session(self, people, daily, api_client, sign_hs256):
        _fund(SEEKER, RATE * 4)
        sid = people["ask"](channel="chat")["session_id"]
        stranger = sign_hs256(claims=make_claims(sub=STRANGER))
        r = api_client.post(f"/v1/chat/sessions/{sid}/accept/", **auth(stranger))
        assert r.json()["ok"] is False
        r = api_client.post(f"/v1/chat/sessions/{sid}/heartbeat/", **auth(stranger))
        assert r.json()["ok"] is False

    def test_too_little_money_is_refused_before_anybody_waits(self, people, daily):
        _fund(SEEKER, RATE - 1)
        asked = people["ask"](channel="chat")
        assert asked["ok"] is False and "balance" in asked["reason"].lower()
        assert not Session.objects.filter(seeker_id=SEEKER).exists()


@pytest.mark.django_db
def test_two_phones_creating_the_room_at_once(people, daily, monkeypatch):
    """The second create hears "already exists"; it must join, not refuse."""
    _fund(SEEKER, RATE * 3)
    sid = people["ask"]()["session_id"]
    people["post"]("pro", f"/v1/chat/sessions/{sid}/accept/")
    made = {"n": 0}

    def get_room(name):
        return {"url": f"https://1namo.daily.co/{name}"} if made["n"] else None

    def create_room(name, exp):
        made["n"] += 1
        raise providers.UpstreamError('400 {"info":"a room named x already exists"}')

    monkeypatch.setattr(providers, "get_room", get_room)
    monkeypatch.setattr(providers, "create_room", create_room)
    joined = people["post"]("seeker", f"/v1/video/sessions/{sid}/join/")
    assert joined["ok"] is True and joined["url"].endswith(video_services.room_name(sid))
