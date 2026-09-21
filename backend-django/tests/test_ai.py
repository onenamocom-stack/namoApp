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
        cursor.execute(
            "create trigger ledger_immutable before update on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
        cursor.execute(
            "create trigger ledger_immutable_delete before delete on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
        cursor.execute(
            "create table orders (id text primary key, profile_id text not null,"
            " status text not null default 'paid', total_paise integer not null,"
            " created_at text)"
        )
        cursor.execute(
            "create table order_items (id text primary key, order_id text not null,"
            " item_type text not null, item_id text not null, title text not null,"
            " qty smallint not null default 1, unit_price_paise integer not null,"
            " tax_rate_bps smallint not null default 0)"
        )
    yield
    with connection.cursor() as cursor:
        cursor.execute("drop trigger if exists ledger_immutable")
        cursor.execute("drop trigger if exists ledger_immutable_delete")
        for table in ("order_items", "orders"):
            cursor.execute(f"drop table {table}")


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
        # The sixth is the whole point: no wallet, no session, no more free.
        sixth = services.ask(SEEKER, "one more")
        assert sixth["ok"] is False
        assert sixth["reason"] == services.REFUSAL_NO_SESSION
        assert sixth["needs_session"] is True

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
        assert services.quota_state(SEEKER) == {"free_left": 1, "kind": "daily"}
        assert services.ask(SEEKER, "tomorrow")["ok"]
        assert services.ask(SEEKER, "tomorrow again")["ok"] is False

        day[0] = day[0] + timezone.timedelta(days=1)
        assert services.ask(SEEKER, "day after")["ok"]

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


# ── the meter ────────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestMeter:
    def test_start_holds_the_whole_wallet_floored_to_minutes(self):
        _wallet(SEEKER)
        _fund(SEEKER, 2_500)  # ₹25 -> two whole minutes at ₹9, ₹7 unspendable

        result = services.start_session(SEEKER)
        assert result["ok"]
        assert result["minutes_held"] == 2
        assert result["seconds_left"] == 120
        # ₹18 held, ₹7 left in the wallet — the part-minute is neither held
        # nor sold.
        assert _balance(SEEKER) == 2_500 - 1_800

    def test_no_wallet_and_short_balance_are_different_sentences(self):
        assert services.start_session(SEEKER)["reason"] == services.REFUSAL_NO_WALLET
        _wallet(SEEKER)
        _fund(SEEKER, 500)  # ₹5 — not a minute
        result = services.start_session(SEEKER)
        assert result["reason"] == services.REFUSAL_SHORT_BALANCE
        assert result["balance_paise"] == 500
        assert _balance(SEEKER) == 500  # nothing taken

    def test_unused_minutes_come_back(self):
        _wallet(SEEKER)
        _fund(SEEKER, 9_000)  # ten minutes
        start = timezone.now()
        session = services.start_session(SEEKER, now=start)
        assert _balance(SEEKER) == 0  # all ten minutes held

        # Two and a half minutes in: three billed, seven refunded.
        stop = start + timezone.timedelta(seconds=150)
        end = services.end_session(SEEKER, session["session_id"], now=stop)
        assert end["minutes"] == 3
        assert end["charged_paise"] == 2_700
        assert end["refund_paise"] == 6_300
        assert _balance(SEEKER) == 6_300

    def test_a_part_minute_is_a_minute(self):
        _wallet(SEEKER)
        _fund(SEEKER, 9_000)
        start = timezone.now()
        session = services.start_session(SEEKER, now=start)
        end = services.end_session(
            SEEKER, session["session_id"], now=start + timezone.timedelta(seconds=1)
        )
        assert end["minutes"] == 1
        assert end["charged_paise"] == RATE

    def test_an_abandoned_session_is_swept_and_cannot_overspend(self):
        _wallet(SEEKER)
        _fund(SEEKER, 1_800)  # two minutes
        start = timezone.now()
        services.start_session(SEEKER, now=start)

        # The tab is left open for an hour. The clock stops at what was held.
        much_later = start + timezone.timedelta(hours=1)
        assert services.sweep_sessions(now=much_later)["settled"] == 1

        session = Session.objects.get(profile_id=SEEKER)
        assert session.status == Session.Status.ENDED
        assert session.charged_paise == 1_800  # the two it bought, not sixty
        assert _balance(SEEKER) == 0

    def test_only_one_live_session_at_a_time(self):
        _wallet(SEEKER)
        _fund(SEEKER, 9_000)
        services.start_session(SEEKER)
        assert services.start_session(SEEKER)["reason"] == services.REFUSAL_ALREADY_LIVE

    def test_heartbeat_counts_down_and_goes_dead(self):
        _wallet(SEEKER)
        _fund(SEEKER, 1_800)
        start = timezone.now()
        session = services.start_session(SEEKER, now=start)
        sid = session["session_id"]

        beat = services.heartbeat(SEEKER, sid, now=start + timezone.timedelta(seconds=30))
        assert beat["live"] is True
        assert beat["seconds_left"] == 90

        past = services.heartbeat(SEEKER, sid, now=start + timezone.timedelta(minutes=5))
        assert past["live"] is False
        assert past["seconds_left"] == 0

    def test_a_paid_question_needs_a_live_session_not_just_a_wallet(self):
        _wallet(SEEKER)
        _fund(SEEKER, 9_000)
        for _ in range(5):
            services.ask(SEEKER, "q")
        # Money in the wallet is not consent to start spending it.
        refused = services.ask(SEEKER, "sixth")
        assert refused["needs_session"] is True
        assert _balance(SEEKER) == 9_000

        services.start_session(SEEKER)
        assert services.ask(SEEKER, "sixth")["ok"]

    def test_ending_someone_elses_session_is_refused(self):
        _wallet(SEEKER)
        _fund(SEEKER, 9_000)
        session = services.start_session(SEEKER)
        stranger = uuid.uuid4()
        result = services.end_session(stranger, session["session_id"])
        assert result["reason"] == services.REFUSAL_NOT_YOURS
        assert Session.objects.get(pk=session["session_id"]).status == "live"


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

    def test_a_settle_racing_the_sweeper_refunds_once(self):
        _wallet(SEEKER)
        _fund(SEEKER, 9_000)
        start = timezone.now()
        session = services.start_session(SEEKER, now=start)
        stop = start + timezone.timedelta(minutes=1)

        first = services.end_session(SEEKER, session["session_id"], now=stop)
        second = services.end_session(SEEKER, session["session_id"], now=stop)
        assert first["ok"] and not first.get("already_ended")
        assert second["already_ended"] is True
        # One refund, not two: 9000 held, 900 charged, 8100 back — once.
        assert _balance(SEEKER) == 8_100


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
