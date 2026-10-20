"""The consultant's सुझाव button (20 Oct 2026, Rahul): three replies to the
seeker's last message, for the session's consultant only. Mock provider."""

from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone

from apps.ai import suggest as ai_suggest
from apps.chat import services
from apps.chat.models import Session

from .test_chat import (  # noqa: F401 — fixtures
    PRO, RATE, SEEKER, _live_session, auth, money_tables, pro_token, pro_user, seeker_token,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.clear()


def _url(thread_id):
    return f"/v1/chat/threads/{thread_id}/suggest/"


def _chat(pro_user):
    session, thread_id = _live_session(pro_user, now=timezone.now(), fund=RATE * 30)
    services.send_message(SEEKER, thread_id, "Meri shaadi kab hogi?")
    return session, thread_id


def test_three_replies_for_the_consultant(api_client, pro_user, pro_token):
    _, thread_id = _chat(pro_user)
    got = api_client.post(_url(thread_id), **auth(pro_token))
    assert got.status_code == 200, got.json()
    assert len(got.json()["replies"]) == 3


def test_the_seeker_gets_none(api_client, pro_user, seeker_token):
    _, thread_id = _chat(pro_user)
    assert api_client.post(_url(thread_id), **auth(seeker_token)).status_code == 403


def test_only_in_a_live_session(api_client, pro_user, pro_token):
    session, thread_id = _chat(pro_user)
    Session.objects.filter(pk=session.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert api_client.post(_url(thread_id), **auth(pro_token)).status_code == 409


def test_not_before_the_seeker_writes(api_client, pro_user, pro_token):
    _, thread_id = _live_session(pro_user, now=timezone.now(), fund=RATE * 30)
    got = api_client.post(_url(thread_id), **auth(pro_token))
    assert got.status_code == 409 and got.json()["reason"] == "nothing_yet"


def test_too_soon_and_the_daily_ceiling(api_client, pro_user, pro_token, monkeypatch):
    _, thread_id = _chat(pro_user)
    assert api_client.post(_url(thread_id), **auth(pro_token)).status_code == 200
    assert api_client.post(_url(thread_id), **auth(pro_token)).json()["reason"] == "too_soon"
    cache.delete(f"suggest-wait:{PRO}")
    monkeypatch.setattr(ai_suggest, "DAILY_LIMIT", 1)
    assert api_client.post(_url(thread_id), **auth(pro_token)).json()["reason"] == "daily_limit"


@pytest.mark.parametrize("text,want", [
    ("1. One.\n2. Two.\n3. Three.", ["One.", "Two.", "Three."]),
    ("- One\n- One\n- Two", ["One", "Two"]),
    ('1) "Quoted"\n\n2) Next', ["Quoted", "Next"]),
])
def test_parse(text, want):
    assert ai_suggest._parse(text) == want


@pytest.mark.parametrize("category,chart", [("Astrologer, Tarot, Life Coach", True), ("Counsellor", False),
                                            ("Ayurveda", False), ("Pandit", True)])
def test_the_field_decides_whether_the_chart_goes(api_client, pro_user, pro_token, monkeypatch, category, chart):
    from apps.ai.providers import MockProvider
    from apps.consultants.models import Consultant

    Consultant.objects.filter(profile_id=PRO).update(category=category)
    seen = {}
    real = MockProvider.answer

    def spy(self, system, history, question):
        seen["system"], seen["question"] = system, question
        return real(self, system, history, question)

    monkeypatch.setattr(MockProvider, "answer", spy)
    _, thread_id = _chat(pro_user)
    assert api_client.post(_url(thread_id), **auth(pro_token)).status_code == 200
    assert f"This\none is: {category}." in seen["system"] or f"one is: {category}." in seen["system"]
    assert ("TODAY:" in seen["system"]) is chart
    assert "Seeker: Meri shaadi kab hogi?" in seen["question"]
