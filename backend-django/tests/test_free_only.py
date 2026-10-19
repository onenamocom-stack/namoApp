"""Namo AI and tarot are free only for now (19 Oct 2026, Rahul): the welcome
five and one question a day (and a referral boost), one card a day; past
them, "come back tomorrow" and no money moves. No price reaches the app."""

import pytest

from apps.ai import services
from apps.ai.models import Quota

from .conftest import TEST_USER


@pytest.fixture(autouse=True)
def _free_only(settings, db):
    settings.AI_PAID = False
    settings.AI_WELCOME_FREE = 5
    settings.AI_DAILY_FREE = 1
    settings.TAROT_FREE_DAILY = 1
    settings.AI_PROVIDER = "mock"
    from apps.profiles.models import Profile

    Profile.objects.get_or_create(id=TEST_USER, defaults={"phone": "9000000001", "name": "Test"})


def _spent_today():
    Quota.objects.update_or_create(profile_id=TEST_USER, defaults={"welcome_used": 5})


def test_past_the_free_question_it_is_come_back_tomorrow_and_nothing_is_charged(monkeypatch):
    def no_debit(*a, **k):
        raise AssertionError("charged while free only")

    monkeypatch.setattr(services.wallet_services, "debit", no_debit)
    _spent_today()
    first = services.ask(TEST_USER, "Will it rain?")
    assert first["ok"]
    again = services.ask(TEST_USER, "And tomorrow?")
    assert not again["ok"] and again["come_back"] and again["price_paise"] is None
    assert "tomorrow" in again["reason"]


def test_one_card_a_day_then_come_back_tomorrow(monkeypatch):
    monkeypatch.setattr(services.wallet_services, "debit", lambda *a, **k: (_ for _ in ()).throw(AssertionError()))
    deck = next(iter(services.tarot_decks.DECKS))
    assert services.tarot_state(TEST_USER) == {"free_left": 1, "price_paise": None, "per": "day"}
    services.tarot_pull(TEST_USER, deck, "")
    refused = services.tarot_pull(TEST_USER, deck, "")
    assert not refused["ok"] and refused["come_back"] and refused["price_paise"] is None
