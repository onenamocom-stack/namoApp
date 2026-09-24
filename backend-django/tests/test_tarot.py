"""Tarot (docs/01-PRD.md §4.2): the draw, the money and the free pulls.

The money is the part worth testing hardest, and for the same reason Namo
AI's quota was: the count used to live in the browser. `tarot:free1` and
`tarot:free2` were flags in the store's `flags` Set, which does not survive
a reload — so "two free pulls a week" was in fact unlimited and the ₹11 was
never reached. Every assertion here is about the server holding the count.

  the draw      -> TestDraw: the card comes from the deck that was asked
                   for, the client never sends one, and an unknown deck is
                   refused before any money moves
  the money     -> TestMoney: two free pulls a week, then ₹11; an empty
                   wallet is refused and writes no ledger row; the week
                   rolls over
  the model     -> TestReading: the answer splits into the three parts the
                   screen shows (meaning, conclusion, what to do), a
                   provider failure refunds the money but not the free
                   pull, and no key ever reaches a response body
"""

import pytest
from django.db import connection
from django.utils import timezone

from apps.ai import providers, services, tarot, tarot_decks
from apps.ai.models import Quota
from apps.wallet import services as wallet_services

from .conftest import TEST_USER

SEEKER = TEST_USER
PRICE = 1100  # ₹11 a pull


def _wallet(pid, balance=0):
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise, created_at)"
            " values (%s, %s, %s)",
            [str(pid), balance, timezone.now()],
        )


def _fund(pid, amount):
    wallet_services.insert_ledger(pid, amount, "Added money", ref_type="adjustment")


def _ledger_rows(pid):
    # `ledger.wallet_id` carries the PROFILE id in this codebase — see
    # wallet_services.insert_ledger, which matches wallets on profile_id.
    with connection.cursor() as cursor:
        cursor.execute("select count(*) from ledger where wallet_id = %s", [str(pid)])
        return cursor.fetchone()[0]


@pytest.fixture(autouse=True)
def money_tables(db):
    """prod's append-only ledger, emulated — test_ai.py's fixture, because a
    refund that silently updated a row instead of appending one would pass
    every assertion below."""
    with connection.cursor() as cursor:
        cursor.execute(
            "create trigger ledger_immutable before update on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
    yield
    with connection.cursor() as cursor:
        cursor.execute("drop trigger if exists ledger_immutable")


@pytest.fixture(autouse=True)
def _mock_provider(settings):
    settings.AI_PROVIDER = "mock"
    settings.TAROT_PRICE_PAISE = PRICE
    settings.TAROT_FREE_WEEKLY = 2


@pytest.fixture(autouse=True)
def _no_chart(monkeypatch):
    """A pull does not need a chart and the prompt says so out loud when
    there is none. Pinned here so these tests are about the cards."""
    monkeypatch.setattr(services, "_chart_for", lambda pid: None)


def pull(deck="bhaktamar", question="Should I take the offer?"):
    return services.tarot_pull(SEEKER, deck, question)


@pytest.mark.django_db
class TestDraw:
    def test_the_card_comes_from_the_deck_asked_for(self):
        _wallet(SEEKER, 0)
        _fund(SEEKER, 10000)  # two decks, and only two pulls are free
        for deck in ("bhaktamar", "yesno"):
            result = services.tarot_pull(SEEKER, deck, "Will this work out?")
            assert result["ok"] is True, result
            ids = {c[0] for c in tarot_decks.DECKS[deck]["cards"]}
            assert result["card"]["id"] in ids
            assert result["card"]["deck"] == deck

    def test_the_yesno_deck_answers_yes_no_or_wait(self):
        _wallet(SEEKER, 0)
        result = services.tarot_pull(SEEKER, "yesno", "Should I call him?")
        assert result["card"]["verdict"] in ("Yes", "No", "Wait")

    def test_the_yesno_deck_is_an_even_split(self):
        # Nine of each, from the partner's sheet. A deck that drifts towards
        # one answer is a deck that is telling people what they want to hear.
        from collections import Counter

        spread = Counter(card[2] for card in tarot_decks.YESNO)
        assert spread == {"Yes": 9, "No": 9, "Wait": 9}

    def test_every_card_in_every_deck_can_be_drawn(self):
        # Ids are unique within a deck and the draw covers the deck: a
        # duplicate id would silently halve a deck's range.
        for key, deck in tarot_decks.DECKS.items():
            ids = [c[0] for c in deck["cards"]]
            assert len(ids) == len(set(ids)), key
            assert all(len(c) == 3 and all(c) for c in deck["cards"]), key

    def test_an_unknown_deck_is_refused_before_any_money_moves(self):
        _wallet(SEEKER, 10000)
        # The Vedic Kipper deck is written down but not in DECKS until its art
        # lands: a deck nothing can deal must refuse like any unknown name.
        assert "hindu" not in tarot_decks.DECKS
        result = services.tarot_pull(SEEKER, "hindu", "Anything?")
        assert result["ok"] is False
        assert result["reason"] == services.REFUSAL_DECK
        assert wallet_services.balance_of(SEEKER) == 10000
        assert _ledger_rows(SEEKER) == 0  # refused before the ledger

    def test_an_empty_question_is_refused(self):
        _wallet(SEEKER, 10000)
        result = services.tarot_pull(SEEKER, "bhaktamar", "   ")
        assert result["ok"] is False
        assert result["reason"] == services.REFUSAL_EMPTY
        assert wallet_services.balance_of(SEEKER) == 10000


@pytest.mark.django_db
class TestMoney:
    def test_two_free_pulls_then_the_price(self):
        _wallet(SEEKER, 0)
        first, second = pull(), pull()
        assert (first["ok"], second["ok"]) == (True, True)
        assert (first["charged_paise"], second["charged_paise"]) == (0, 0)
        assert second["free_left"] == 0

        # The third needs money, and there is none.
        third = pull()
        assert third["ok"] is False
        assert third["needs_money"] is True
        assert third["price_paise"] == PRICE
        assert _ledger_rows(SEEKER) == 0  # nothing was written

        _fund(SEEKER, 5000)
        fourth = pull()
        assert fourth["ok"] is True
        assert fourth["charged_paise"] == PRICE
        assert wallet_services.balance_of(SEEKER) == 5000 - PRICE

    def test_the_free_count_survives_a_reload(self):
        # The whole point of moving it off the client: a fresh service call
        # is a reloaded app, and it must not hand out two more.
        _wallet(SEEKER, 0)
        pull(), pull()
        assert services.tarot_state(SEEKER)["free_left"] == 0
        assert pull()["ok"] is False

    def test_the_week_rolls_over(self):
        _wallet(SEEKER, 0)
        pull(), pull()
        assert services.tarot_state(SEEKER)["free_left"] == 0
        # Last week's row: the count resets on the stamp, not on a timer.
        Quota.objects.filter(profile_id=SEEKER).update(
            tarot_week=services._ist_week() - timezone.timedelta(days=7)
        )
        assert services.tarot_state(SEEKER)["free_left"] == 2
        assert pull()["charged_paise"] == 0

    def test_the_ai_allowance_is_untouched(self):
        # Two products, one model. Spending this week's pulls must not cost
        # somebody their daily question.
        _wallet(SEEKER, 0)
        before = services.quota_state(SEEKER)
        pull(), pull()
        assert services.quota_state(SEEKER) == before

    def test_state_reports_the_price(self):
        _wallet(SEEKER, 0)
        assert services.tarot_state(SEEKER) == {"free_left": 2, "price_paise": PRICE}


@pytest.mark.django_db
class TestReading:
    def test_the_answer_splits_into_the_three_parts_the_screen_shows(self):
        _wallet(SEEKER, 0)
        result = pull()
        assert result["meaning"] and result["conclusion"] and result["todo"]
        for part in ("meaning", "conclusion", "todo"):
            for label in tarot.SECTIONS:
                assert label not in result[part]  # the labels are not content

    def test_an_unlabelled_answer_is_all_meaning(self):
        # The part that must never be empty is the one the pull was for.
        parts = tarot.split_sections("The card is plain about this.")
        assert parts["meaning"] == "The card is plain about this."
        assert parts["conclusion"] is None and parts["do"] is None

    def test_a_label_mid_sentence_does_not_split(self):
        parts = tarot.split_sections(
            "MEANING:\nThe conclusion you reached is the wrong one.\n"
            "DO:\nSay so."
        )
        assert parts["meaning"] == "The conclusion you reached is the wrong one."
        assert parts["conclusion"] is None
        assert parts["do"] == "Say so."

    def test_a_provider_failure_refunds_the_money(self, monkeypatch):
        def boom(block, question):
            raise providers.UpstreamError("gemini unreachable")

        _wallet(SEEKER, 5000)
        pull(), pull()  # spend the free ones
        monkeypatch.setattr(providers, "read_card", boom)
        result = pull()
        assert result["ok"] is False
        assert result["retryable"] is True
        assert result["refunded_paise"] == PRICE
        # Charged then credited back: two rows, and the balance is whole.
        assert wallet_services.balance_of(SEEKER) == 5000
        # Charged then credited back — two appended rows, not an edit.
        assert _ledger_rows(SEEKER) == 2

    def test_a_provider_failure_does_not_refund_a_free_pull(self, monkeypatch):
        def boom(block, question):
            raise providers.UpstreamError("gemini unreachable")

        _wallet(SEEKER, 0)
        monkeypatch.setattr(providers, "read_card", boom)
        result = pull()
        assert result["ok"] is False
        assert result["refunded_paise"] == 0
        # Spent, deliberately: refunding it on every failure is a free-pull
        # generator for anybody who can cause a timeout.
        assert services.tarot_state(SEEKER)["free_left"] == 1

    def test_the_prompt_names_the_card_and_never_the_key(self):
        card = tarot_decks.draw("yesno")
        block = tarot.card_block(card, "no chart on file")
        assert card["name"] in block
        assert "CARD DRAWN" in block  # what the mock provider branches on
        assert card["verdict"] in block
        for secret in ("GEMINI_API_KEY", "api_key", "Bearer "):
            assert secret not in block


@pytest.mark.django_db
class TestEndpoint:
    URL = "/v1/ai/tarot/"

    def test_a_pull_over_http(self, authed_client):
        _wallet(SEEKER, 0)
        response = authed_client.post(
            self.URL, {"deck": "bhaktamar", "question": "Is this the right month?"},
            format="json",
        )
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["ok"] is True
        assert body["card"]["deck"] == "bhaktamar"
        assert body["meaning"] and body["conclusion"] and body["todo"]
        assert body["free_left"] == 1

    def test_state_over_http(self, authed_client):
        _wallet(SEEKER, 0)
        body = authed_client.get("/v1/ai/tarot/state/").json()
        assert body == {"ok": True, "free_left": 2, "price_paise": PRICE}

    def test_a_card_sent_by_the_client_is_ignored(self, authed_client):
        # Rule 3: the client sends a deck and a question. Anything else it
        # sends about the draw is not read — a seeker who picks their own
        # card picks their own answer.
        _wallet(SEEKER, 0)
        body = authed_client.post(
            self.URL,
            {"deck": "yesno", "question": "Will it be yes?", "card": "y20",
             "verdict": "Yes"},
            format="json",
        ).json()
        assert body["ok"] is True
        assert body["card"]["id"] in {c[0] for c in tarot_decks.YESNO}

    def test_refusals(self, api_client, authed_client):
        _wallet(SEEKER, 0)
        assert api_client.post(self.URL, {"deck": "yesno", "question": "x"},
                               format="json").status_code == 401
        for payload in (
            {"question": "no deck named"},
            {"deck": "bhaktamar"},
            {"deck": "bhaktamar", "question": ""},
            {"deck": "bhaktamar", "question": "x" * 201},
        ):
            response = authed_client.post(self.URL, payload, format="json")
            assert response.status_code == 400, payload
            assert response.json()["reason"] == "invalid"
