"""One Namo AI chat for each kind of Pro on Consult (21 Oct 2026, Rahul):
the astrologer, tarot reader, life coach and therapist. Each talks as that
professional and keeps its own conversation; the free questions are shared."""

import pytest

from apps.ai import personas, providers, services
from apps.ai.models import Message

from .conftest import TEST_USER


@pytest.fixture(autouse=True)
def _free(settings, db):
    settings.AI_PAID = False
    settings.AI_WELCOME_FREE = 5
    settings.AI_DAILY_FREE = 1
    settings.AI_PROVIDER = "mock"
    from apps.profiles.models import Profile

    Profile.objects.get_or_create(id=TEST_USER, defaults={"phone": "9000000001", "name": "Test"})


def test_each_chat_gets_its_own_professional_and_no_chart(monkeypatch):
    seen = []
    real = providers.ask

    def spy(history, question, block, system=providers.SYSTEM):
        seen.append((system, block, history))
        return real(history, question, block, system=system)

    monkeypatch.setattr(providers, "ask", spy)
    services.ask(TEST_USER, "Should I take the job?", persona="life_coach")
    system, block, _ = seen[-1]
    assert system == personas.LIFE_COACH and "life coach" in system
    assert block.startswith("TODAY:") and "CHART" not in block
    services.ask(TEST_USER, "What does my chart say?")
    assert seen[-1][0] == personas.ASTROLOGER and "CHART" in seen[-1][1]


def test_the_conversations_are_separate_and_the_free_questions_shared():
    services.ask(TEST_USER, "I feel low", persona="therapist")
    services.ask(TEST_USER, "Draw for my career", persona="tarot")
    assert [m["text"] for m in services.transcript(TEST_USER, persona="therapist") if m["role"] == "user"] == ["I feel low"]
    assert services.transcript(TEST_USER) == []
    assert Message.objects.filter(persona="tarot").count() == 2
    assert services.quota_state(TEST_USER)["free_left"] == 3


def test_the_therapist_points_to_help_and_every_chat_says_it_is_an_ai():
    assert "14416" in personas.THERAPIST and "diagnose" in personas.THERAPIST
    for key in ("tarot", "life_coach", "therapist"):
        assert "You are an AI" in personas.SYSTEMS[key]


def test_the_api_takes_a_persona_key_and_refuses_anything_else(authed_client):
    asked = authed_client.post("/v1/ai/ask/", {"question": "Hi", "persona": "tarot"}, format="json")
    assert asked.status_code == 200 and asked.json()["ok"]
    state = authed_client.get("/v1/ai/?persona=tarot").json()
    assert len(state["messages"]) == 2 and state["free_left"] == 4
    assert authed_client.get("/v1/ai/").json()["messages"] == []
    bad = authed_client.post("/v1/ai/ask/", {"question": "Hi", "persona": "lawyer"}, format="json")
    assert bad.status_code == 400
