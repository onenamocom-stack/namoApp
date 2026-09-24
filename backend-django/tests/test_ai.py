"""Namo AI (docs/01-PRD.md §4.4): the quota ladder, the meter, and the
guard rails around the model call.

The quota ladder is the part worth testing hardest, because it is the part
that was not enforced at all before this module existed: `questionsLeft`
was React state, so a page reload handed out five more. Every assertion
below is about the server refusing to be talked out of the count.

  welcome five   -> TestQuota: five free per ACCOUNT, not per tab, not per
                    day; the sixth needs something else
  one a day      -> TestQuota: after the welcome five, one free message per
                    IST calendar day — and the second one the same day is
                    refused even across a "reload" (a fresh service call)
  the meter      -> TestMeter: the whole wallet is held floored to minutes,
                    unused minutes come back, a part-minute is a minute,
                    an abandoned session is swept and refunded
  races          -> TestRaces: two simultaneous questions cannot both spend
                    the last free message; a settle racing the sweeper
                    refunds once
  the model      -> TestProvider: an upstream failure does not lose the
                    question and does not fabricate an answer; history is
                    capped; the chart is passed or its absence is stated

TIME IS FAKED by passing `now`, never by waiting — the same discipline
test_chat.py uses, and the reason the minute arithmetic here is exact.
"""

import threading
import uuid

import pytest
from django.db import connection
from django.utils import timezone

from apps.ai import providers, services
from apps.ai.models import Message, Quota, Session
from apps.wallet import services as wallet_services

from .conftest import TEST_USER

SEEKER = TEST_USER
RATE = 900  # ₹9 a minute


# ── helpers ──────────────────────────────────────────────────────────────────


def _wallet(pid, balance=0):
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise, created_at)"
            " values (%s, %s, %s)",
            [str(pid), balance, timezone.now()],
        )


def _fund(pid, amount):
    wallet_services.insert_ledger(pid, amount, "Added money", ref_type="adjustment")


def _balance(pid):
    return wallet_services.balance_of(pid)


@pytest.fixture(autouse=True)
def money_tables(db):
    """The order layer the meter writes through. `orders` and `order_items`
    are the wallet module's tables but live outside its models (the
    gateway reaches them by SQL), so SQLite needs them stood up by hand —
    test_chat.py's fixture verbatim, including prod's refuse_mutation
    triggers, because an append-only ledger is half of why the settle is
    safe to run twice."""
    from django.db import connection

    with connection.cursor() as cursor:
        # `orders` and `order_items` used to be stood up by hand here: they
        # are written by raw SQL from the consultants gateway and had no
        # Django model, so SQLite had no table unless a fixture made one.
        # apps/shop gave them models (stage 2 of the console), so the test
        # database creates them from migrations now and creating them again
        # is "table orders already exists". The triggers below are still
        # ours — they emulate prod's refuse_mutation, which no model has.
        cursor.execute(
            "create trigger ledger_immutable before update on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
        cursor.execute(
            "create trigger ledger_immutable_delete before delete on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
    yield
    with connection.cursor() as cursor:
        cursor.execute("drop trigger if exists ledger_immutable")
        cursor.execute("drop trigger if exists ledger_immutable_delete")


@pytest.fixture(autouse=True)
def _mock_provider(settings):
    settings.AI_PROVIDER = "mock"
    settings.AI_RATE_PAISE = RATE


@pytest.fixture(autouse=True)
def _no_chart(monkeypatch):
    """The chart lookup reaches the astro provider and the profiles table.
    Neither is what these tests are about, and a missing chart is a branch
    the prompt handles out loud — so pin it, and let TestProvider be the
    one place that checks the wiring."""
    monkeypatch.setattr(services, "_chart_for", lambda pid: None)


# ── the quota ladder ─────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestQuota:
    def test_five_free_then_refused(self):
        for i in range(5):
            result = services.ask(SEEKER, f"question {i}")
            assert result["ok"], f"free question {i + 1} should have been free"
        # The sixth is the whole point: with no wallet there is nothing to
        # charge, so it is refused rather than quietly given away.
        sixth = services.ask(SEEKER, "one more")
        assert sixth["ok"] is False
        assert sixth["needs_money"] is True
        assert sixth["price_paise"] == RATE

    def test_welcome_five_is_per_account_not_per_reload(self):
        """The bug this module exists to close. Five, then five again from a
        fresh call, used to be ten because the counter lived in the browser."""
        for _ in range(5):
            assert services.ask(SEEKER, "q")["ok"]
        assert Quota.objects.get(profile_id=SEEKER).welcome_used == 5
        assert services.ask(SEEKER, "q")["ok"] is False

    def test_the_daily_free_one_starts_the_NEXT_day(self, monkeypatch):
        """Five on day one. Not six.

        The first cut of this granted the daily message the moment the
        welcome five ran out, so a new account got six on its first day and
        the ladder was off by one forever after. "One a day from the next
        day" is the rule, and this is the test that holds it.
        """
        day = [services._ist_today()]
        monkeypatch.setattr(services, "_ist_today", lambda: day[0])

        for i in range(5):
            assert services.ask(SEEKER, f"q{i}")["ok"]
        assert services.ask(SEEKER, "sixth on day one")["ok"] is False
        assert services.quota_state(SEEKER)["free_left"] == 0

        day[0] = day[0] + timezone.timedelta(days=1)
        # `daily_allowance` and `boosted` joined the payload on 24 Sep with
        # referral boosts — the panel needs to say WHY there are three today
        # rather than leave a seeker to notice the number moved on its own.
        assert services.quota_state(SEEKER) == {
            "free_left": 1, "kind": "daily", "daily_allowance": 1, "boosted": False,
        }
        assert services.ask(SEEKER, "tomorrow")["ok"]
        assert services.ask(SEEKER, "tomorrow again")["ok"] is False

        day[0] = day[0] + timezone.timedelta(days=1)
        assert services.ask(SEEKER, "day after")["ok"]

    def test_the_shipped_defaults_are_five_and_one(self, settings):
        """The allowances are env vars so a testing window can raise them.
        This pins what production ships with, so raising one for a day and
        forgetting to put it back fails here rather than in the bill."""
        from django.conf import settings as live

        assert live.AI_WELCOME_FREE == 5
        assert live.AI_DAILY_FREE == 1

    def test_a_raised_daily_allowance_actually_grants_more(self, settings, monkeypatch):
        """What the testing window needs: more than one a day, without a
        flag that skips the quota entirely."""
        day = [services._ist_today()]
        monkeypatch.setattr(services, "_ist_today", lambda: day[0])
        for _ in range(5):
            services.ask(SEEKER, "q")

        day[0] = day[0] + timezone.timedelta(days=1)
        settings.AI_DAILY_FREE = 3
        assert services.quota_state(SEEKER)["free_left"] == 3
        for i in range(3):
            assert services.ask(SEEKER, f"raised {i}")["ok"]
        assert services.ask(SEEKER, "fourth")["ok"] is False

        # And putting it back is one value, with no leftover credit.
        day[0] = day[0] + timezone.timedelta(days=1)
        settings.AI_DAILY_FREE = 1
        assert services.quota_state(SEEKER)["free_left"] == 1
        assert services.ask(SEEKER, "next day")["ok"]
        assert services.ask(SEEKER, "and again")["ok"] is False

    def test_quota_state_reports_what_is_left_without_spending(self):
        assert services.quota_state(SEEKER) == {"free_left": 5, "kind": "welcome"}
        services.ask(SEEKER, "q")
        assert services.quota_state(SEEKER) == {"free_left": 4, "kind": "welcome"}
        # Reading it twice does not consume anything.
        assert services.quota_state(SEEKER)["free_left"] == 4

    def test_empty_question_costs_nothing(self):
        assert services.ask(SEEKER, "   ")["reason"] == services.REFUSAL_EMPTY
        assert services.quota_state(SEEKER)["free_left"] == 5
        assert Message.objects.count() == 0


# ── what a question costs ───────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestPrice:
    """₹9 a question (23 Sep). It was ₹9 a minute for two days.

    The meter is retired: a metered session makes sense when you are
    buying somebody's TIME, and an AI consumes none. What replaces it has
    one rule the meter never needed — **a failed answer is refunded.**
    """

    def test_free_questions_cost_nothing(self):
        _wallet(SEEKER)
        _fund(SEEKER, 5_000)
        result = services.ask(SEEKER, "first one")
        assert result["ok"]
        assert result["charged_paise"] == 0
        assert _balance(SEEKER) == 5_000

    def test_the_first_paid_question_costs_nine_rupees(self):
        _wallet(SEEKER)
        _fund(SEEKER, 5_000)
        for _ in range(5):
            services.ask(SEEKER, "free one")
        result = services.ask(SEEKER, "the sixth")
        assert result["ok"]
        assert result["charged_paise"] == RATE
        assert _balance(SEEKER) == 5_000 - RATE

    def test_an_empty_wallet_refuses_before_the_model_is_called(self, monkeypatch):
        called = []

        def spy(*args, **kwargs):
            called.append(1)
            return {"text": "x", "tokens_in": None, "tokens_out": None}

        _wallet(SEEKER)
        _fund(SEEKER, 100)  # nowhere near ₹9
        for _ in range(5):
            services.ask(SEEKER, "free")
        monkeypatch.setattr(providers, "ask", spy)

        result = services.ask(SEEKER, "cannot afford this")
        assert result["ok"] is False
        assert result["needs_money"] is True
        assert result["price_paise"] == RATE
        assert not called, "the model was called for a question nobody paid for"
        assert _balance(SEEKER) == 100

    def test_a_failed_answer_gives_the_money_back(self, monkeypatch):
        """Somebody who paid ₹9 and got "could not reach the astrologer"
        has been robbed of ₹9. "They can just retry" is not an answer to
        that."""
        _wallet(SEEKER)
        _fund(SEEKER, 5_000)
        for _ in range(5):
            services.ask(SEEKER, "free")

        def boom(*args, **kwargs):
            raise providers.UpstreamError("gemini unreachable")

        monkeypatch.setattr(providers, "ask", boom)
        result = services.ask(SEEKER, "this will fail")

        assert result["ok"] is False
        assert result["refunded_paise"] == RATE
        assert _balance(SEEKER) == 5_000, "the money did not come back"

    def test_a_failed_FREE_question_is_not_refunded(self, monkeypatch):
        """Deliberately different. Refunding a free message on every
        failure is a free-question generator for anybody who can cause a
        timeout."""
        def boom(*args, **kwargs):
            raise providers.UpstreamError("down")

        monkeypatch.setattr(providers, "ask", boom)
        before = services.quota_state(SEEKER)["free_left"]
        services.ask(SEEKER, "fails")
        assert services.quota_state(SEEKER)["free_left"] == before - 1

    def test_the_question_survives_a_failure_so_it_can_be_retried(self, monkeypatch):
        def boom(*args, **kwargs):
            raise providers.UpstreamError("down")

        monkeypatch.setattr(providers, "ask", boom)
        services.ask(SEEKER, "where is my Saturn")
        assert [m.body for m in Message.objects.all()] == ["where is my Saturn"]

    def test_the_price_is_visible_before_anybody_is_charged(self):
        """The panel shows it while the free ones are still running, so a
        ₹9 debit is never a surprise."""
        from apps.ai.views import _state

        assert _state(SEEKER)["price_paise"] == RATE


# ── races ────────────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestRaces:
    def test_two_simultaneous_questions_cannot_both_take_the_last_free_one(self):
        """Four spent, one left, two taps in the same tick. Exactly one may
        succeed — the row lock in _take_free is what makes "five" a number
        rather than a suggestion."""
        for _ in range(4):
            services.ask(SEEKER, "q")

        results = []
        barrier = threading.Barrier(2)

        def run():
            barrier.wait()
            try:
                results.append(services.ask(SEEKER, "race"))
            finally:
                connection.close()

        threads = [threading.Thread(target=run) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        granted = [r for r in results if r.get("ok")]
        assert len(granted) == 1, results
        assert Quota.objects.get(profile_id=SEEKER).welcome_used == 5

    def test_two_simultaneous_paid_questions_are_charged_twice_not_once(self):
        """The mirror of the free-message race. Two paid questions in one
        tick must take ₹18, not ₹9 — the debit is inside the same
        transaction as the quota check, so neither can slip past it."""
        _wallet(SEEKER)
        _fund(SEEKER, 5_000)
        for _ in range(5):
            services.ask(SEEKER, "free")
        before = _balance(SEEKER)

        results = []
        barrier = threading.Barrier(2)

        def run():
            barrier.wait()
            try:
                results.append(services.ask(SEEKER, "paid"))
            finally:
                connection.close()

        threads = [threading.Thread(target=run) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert all(r.get("ok") for r in results), results
        assert before - _balance(SEEKER) == 2 * RATE


# ── the model call ───────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestProvider:
    def test_an_upstream_failure_keeps_the_question_and_invents_nothing(
        self, monkeypatch
    ):
        def boom(*args, **kwargs):
            raise providers.UpstreamError("gemini unreachable")

        monkeypatch.setattr(providers, "ask", boom)
        result = services.ask(SEEKER, "will it rain")
        assert result["ok"] is False
        assert result["reason"] == services.REFUSAL_UPSTREAM
        # The question survives so the seeker can see what they asked; no
        # answer is fabricated in its place.
        bodies = list(Message.objects.values_list("role", "body"))
        assert bodies == [("user", "will it rain")]

    def test_history_is_capped_so_the_bill_stays_flat(self, monkeypatch):
        seen = {}

        def capture(history, question, chart):
            seen["n"] = len(history)
            seen["chart"] = chart
            return {"text": "ok", "tokens_in": 1, "tokens_out": 1}

        monkeypatch.setattr(providers, "ask", capture)
        for i in range(30):
            Message.objects.create(
                profile_id=SEEKER, role="user", body=f"old {i}"
            )
        services.ask(SEEKER, "new")
        assert seen["n"] <= services.HISTORY_LIMIT

    def test_the_real_chart_shape_reaches_the_model(self, monkeypatch):
        """The shape apps/astro actually returns, not a hand-made one.

        This is the test the 500 earned. `user_chart` answers the memo's
        (payload, cached) tuple, `_chart_for` returned it whole, and
        chart_block called .get() on a tuple — every question 500'd the
        moment a profile had birth details. Every test before this ran on
        an account with none, so the bug could not show.
        """
        from apps.ai.prompt import chart_block

        real = {
            "houses": [{"sign": "Virgo", "house": 1}],
            "planets": [
                {"name": "Sun", "sign": "Cancer", "house": 11},
                {"name": "Saturn", "sign": "Pisces", "house": 7},
            ],
            # An OBJECT, not a string — which is what the API returns.
            "ascendant": {
                "sign": "Virgo", "degree": 153.93,
                "nakshatra": {"lord": "Sun", "name": "Uttara Phalguni", "pada": 3},
            },
        }
        block = chart_block(real)
        assert "Ascendant: Virgo (Uttara Phalguni)" in block
        assert "Saturn: Pisces, house 7" in block
        assert "{" not in block, "a raw dict repr reached the prompt"

        # And the tuple itself must not blow up: it degrades to the
        # no-chart branch rather than raising.
        assert "not available" in chart_block((real, True))

    def test_a_missing_chart_is_stated_not_invented(self, monkeypatch):
        seen = {}

        def capture(history, question, chart):
            seen["chart"] = chart
            return {"text": "ok", "tokens_in": None, "tokens_out": None}

        monkeypatch.setattr(providers, "ask", capture)
        services.ask(SEEKER, "what does my chart say")
        assert "not available" in seen["chart"]

    def test_the_transcript_reads_back_oldest_first(self):
        services.ask(SEEKER, "first")
        services.ask(SEEKER, "second")
        rows = services.transcript(SEEKER)
        assert [r["role"] for r in rows] == ["user", "model", "user", "model"]
        assert rows[0]["text"] == "first"


# ── somebody else's chart ────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestSubject:
    """Asking about a third party (22 Sep 2026).

    The rule that matters most here is not astrological, it is that **the
    third party never agreed to be in this database**. They are used for
    one answer and dropped: no row, no column, no cache entry that names
    them. These tests are the enforcement.
    """

    SUBJECT = {
        "name": "Amma",
        "birth_date": "1965-03-02",
        "birth_time": "14:20:00",
        "birth_time_known": True,
        "birth_place": "Jaipur, India",
        "birth_lat": "26.912400",
        "birth_lon": "75.787300",
        "birth_zone": "Asia/Kolkata",
    }

    def test_nothing_about_the_subject_is_ever_written(self, monkeypatch):
        monkeypatch.setattr(
            services, "_subject_chart",
            lambda s: {"ascendant": {"sign": "Leo"}, "planets": []},
        )
        result = services.ask(SEEKER, "How is Amma's year looking?", subject=self.SUBJECT)
        assert result["ok"]

        # Every stored string, from every row this could have touched.
        stored = " ".join(
            str(v)
            for m in Message.objects.values("body")
            for v in m.values()
        )
        for secret in ("1965-03-02", "14:20", "Jaipur", "26.912", "75.787"):
            assert secret not in stored, f"{secret} was written down"

        # The seeker's own words are theirs and DO survive — including the
        # name, because they typed it into their own question.
        assert "Amma" in stored

    def test_the_prompt_says_whose_chart_it_is(self, monkeypatch):
        seen = {}

        def capture(history, question, chart):
            seen["chart"] = chart
            return {"text": "ok", "tokens_in": None, "tokens_out": None}

        monkeypatch.setattr(providers, "ask", capture)
        monkeypatch.setattr(
            services, "_subject_chart",
            lambda s: {"ascendant": {"sign": "Leo"}, "planets": [
                {"name": "Saturn", "sign": "Aries", "house": 9}]},
        )
        services.ask(SEEKER, "How is her year?", subject=self.SUBJECT)
        block = seen["chart"]
        assert "Amma's, NOT the person you are talking to" in block
        assert "Saturn: Aries, house 9" in block

    def test_a_subject_question_spends_the_same_quota(self, monkeypatch):
        monkeypatch.setattr(services, "_subject_chart", lambda s: None)
        before = services.quota_state(SEEKER)["free_left"]
        services.ask(SEEKER, "About Amma", subject=self.SUBJECT)
        assert services.quota_state(SEEKER)["free_left"] == before - 1

    def test_an_uncomputable_subject_chart_is_stated_not_invented(self, monkeypatch):
        seen = {}

        def capture(history, question, chart):
            seen["chart"] = chart
            return {"text": "ok", "tokens_in": None, "tokens_out": None}

        def boom(body):
            raise RuntimeError("upstream down")

        monkeypatch.setattr(providers, "ask", capture)
        monkeypatch.setattr(
            "apps.astro.services.subject_chart", boom, raising=False
        )
        result = services.ask(SEEKER, "About Amma", subject=self.SUBJECT)
        assert result["ok"]  # the question still gets an answer
        assert "not available" in seen["chart"]
        assert "Amma" in seen["chart"]  # and it still knows whose it was


# ── how it speaks ───────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestVoice:
    """The prompt's side of "stop sounding like a textbook" (22 Sep).

    What a model actually says cannot be asserted here — that is
    `tools/ai_voice_check.py`, which asks the live model and counts the
    jargon. What CAN be asserted is that the instructions telling it not
    to are present, and that the date it needs is in every branch.
    """

    def test_the_jargon_ban_is_in_the_prompt(self):
        from apps.ai.prompt import SYSTEM

        # The words that made "Your 7th house in Pisces holds the Moon,
        # Saturn, Ketu, and receives aspect from Rahu in your 1st house"
        # an answer somebody was given when they asked about marriage.
        for term in ("house numbers", "dasha", "Rahu", "Ketu", "exalted",
                     "aspect", "nakshatra", "retrograde"):
            assert term in SYSTEM, term
        assert "unless the person used them first" in SYSTEM

    def test_the_answer_comes_before_the_chart(self):
        from apps.ai.prompt import SYSTEM

        assert "THE FIRST SENTENCE IS THE ANSWER" in SYSTEM

    def test_being_vague_is_refused_as_firmly_as_being_technical(self):
        """Plain must not become empty. "The stars suggest" is the other
        failure and the prompt names it."""
        from apps.ai.prompt import SYSTEM

        assert "The stars suggest" in SYSTEM
        assert "WHEN and WHAT" in SYSTEM

    def test_today_is_in_every_branch_of_the_chart_block(self):
        """A model has no clock and reaches for whatever year its training
        settled on. Harmless while answers cited placements; not harmless
        once they name months — the first run after the rewrite told
        somebody in September 2026 that marriage opens "around mid-2025".
        """
        from apps.ai.prompt import chart_block, today_line

        stamp = today_line().split(".")[0]
        for block in (
            chart_block(None),                                   # no chart
            chart_block((("payload",), True)),                   # the tuple bug
            chart_block({"ascendant": {"sign": "Virgo"}}),       # a real chart
            chart_block({"ascendant": {"sign": "Virgo"}}, subject_name="Amma"),
        ):
            assert stamp in block

    def test_the_date_is_todays_in_ist(self):
        from django.utils import timezone

        from apps.ai.prompt import today_line

        ist = timezone.now() + timezone.timedelta(hours=5, minutes=30)
        assert ist.strftime("%d %B %Y") in today_line()

    def test_a_subject_chart_still_says_whose_it_is(self):
        """The date must not have displaced the header that stops the model
        answering "your Saturn" about somebody else's chart."""
        from apps.ai.prompt import chart_block

        block = chart_block({"ascendant": {"sign": "Leo"}}, subject_name="Amma")
        assert "Amma's, NOT the person you are talking to" in block
