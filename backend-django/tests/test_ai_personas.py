"""The AI Pros on Consult (21 Oct 2026, Rahul): a box over every category,
each talking as that professional, its own conversation, set in the console
(name, picture, AI line). They share the Namo AI allowance — the welcome
five, then one a day with any of them — and are never paid."""

import pytest

from apps.ai import personas, providers, services
from apps.ai.models import AiBot, Message, Quota
from apps.consultants.models import Consultant

from .conftest import TEST_USER


@pytest.fixture(autouse=True)
def _free(settings, db):
    settings.AI_PAID = False
    settings.AI_WELCOME_FREE = 5
    settings.AI_DAILY_FREE = 1
    settings.AI_PROVIDER = "mock"
    from apps.profiles.models import Profile

    Profile.objects.get_or_create(id=TEST_USER, defaults={"phone": "9000000001", "name": "Test"})


def _spy(monkeypatch):
    seen = []
    real = providers.ask

    def spy(history, question, block, system=providers.SYSTEM):
        seen.append((system, block))
        return real(history, question, block, system=system)

    monkeypatch.setattr(providers, "ask", spy)
    return seen


def test_every_category_has_an_ai_pro_and_a_new_one_gets_its_own():
    keys = [b["key"] for b in services.bots_state(None)["bots"]]
    assert keys == ["astrologer", "tarot", "life_coach", "therapist"]
    Consultant.objects.create(profile_id=TEST_USER, category="Numerologist, Tarot", status="approved")
    services.ai_bots()
    bot = AiBot.objects.get(category="Numerologist")
    assert bot.key == "numerologist" and bot.name == "NAMO AI · Numerologist"
    assert "numerologist" in services.system_for(bot)


def test_each_chat_talks_as_its_professional_and_reads_no_chart(monkeypatch):
    seen = _spy(monkeypatch)
    services.ai_bots()
    services.ask(TEST_USER, "Should I take the job?", persona="life_coach")
    assert seen[-1][0] == personas.LIFE_COACH and seen[-1][1].startswith("TODAY:")
    services.ask(TEST_USER, "What does my chart say?")
    assert seen[-1][0] == personas.ASTROLOGER and "CHART" in seen[-1][1]


def test_the_consoles_prompt_and_line_are_used_and_the_rules_stay(monkeypatch):
    seen = _spy(monkeypatch)
    services.ai_bots()
    AiBot.objects.filter(key="tarot").update(prompt="You read Lenormand cards.", label="Bot, not a human.")
    services.ask(TEST_USER, "Draw for me", persona="tarot")
    assert seen[-1][0].startswith("You read Lenormand cards.") and "You are an AI" in seen[-1][0]
    assert services.bots_state(TEST_USER)["bots"][1]["label"] == "Bot, not a human."


def test_conversations_are_separate_and_the_five_are_shared():
    services.ai_bots()
    services.ask(TEST_USER, "I feel low", persona="therapist")
    services.ask(TEST_USER, "Draw for my career", persona="tarot")
    assert [m["text"] for m in services.transcript(TEST_USER, persona="therapist") if m["role"] == "user"] == ["I feel low"]
    assert services.transcript(TEST_USER) == []
    assert Message.objects.filter(persona="tarot").count() == 2
    assert services.bots_state(TEST_USER)["free_left"] == 3


def test_after_the_five_one_a_day_with_any_of_them_and_never_paid(settings, monkeypatch):
    settings.AI_PAID = True
    monkeypatch.setattr(services.wallet_services, "debit", lambda *a, **k: (_ for _ in ()).throw(AssertionError()))
    services.ai_bots()
    Quota.objects.create(profile_id=TEST_USER, welcome_used=5)
    state = services.bots_state(TEST_USER)
    assert state["show"] is True and state["free_left"] == 1 and state["free_kind"] == "daily"
    assert services.ask(TEST_USER, "One for today", persona="tarot")["ok"]
    refused = services.ask(TEST_USER, "One more?", persona="life_coach")
    assert not refused["ok"] and refused["come_back"]
    assert services.bots_state(TEST_USER)["free_left"] == 0


def test_signed_out_sees_them_and_a_hidden_one_is_not_offered():
    services.ai_bots()
    AiBot.objects.filter(key="therapist").update(active=False)
    state = services.bots_state(None)
    assert state["show"] is True and "therapist" not in [b["key"] for b in state["bots"]]
    assert services.ask(TEST_USER, "Hi", persona="therapist")["ok"] is False


def test_the_therapist_points_to_help_and_every_chat_says_it_is_an_ai():
    assert "14416" in personas.THERAPIST and "diagnose" in personas.THERAPIST
    for key in ("tarot", "life_coach", "therapist"):
        assert "You are an AI" in personas.SYSTEMS[key]
    assert "You are an AI" in personas.generic("Vastu expert")


def test_the_api(authed_client, api_client):
    assert api_client.get("/v1/ai/bots/").json()["show"] is True
    asked = authed_client.post("/v1/ai/ask/", {"question": "Hi", "persona": "tarot"}, format="json")
    assert asked.status_code == 200 and asked.json()["ok"]
    state = authed_client.get("/v1/ai/?persona=tarot").json()
    assert len(state["messages"]) == 2 and state["free_left"] == 4
    assert authed_client.get("/v1/ai/").json()["messages"] == []
    assert authed_client.get("/v1/ai/bots/").json()["free_left"] == 4
    nobody = authed_client.post("/v1/ai/ask/", {"question": "Hi", "persona": "lawyer"}, format="json")
    assert nobody.json()["ok"] is False
