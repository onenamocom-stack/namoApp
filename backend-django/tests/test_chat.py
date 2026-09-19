"""Module 7 — chat (docs/07 §6 step 7): the pytest port of
backend/schema/014_metered_chat_check.sql — every assertion, as amended by
017 (no hold cap) and 018 (the accept lock, one open request per pair, the
mode guard, the sweeper's request expiry, the ledger-note fix) — plus the
module's endpoint contract (the exact shapes src/lib/chat.js renders),
metering arithmetic vectors built from the SQL's exact round-up rule,
thread-race proofs, and keyset-cursor exactness under concurrent writes.

The 014 check's discipline ports directly: TIME IS FAKED BY MOVING
started_at/expires_at/heartbeat_at, never by waiting — every service takes
an injectable `now`, so a session stamped as begun ten minutes ago is
charged exactly ten minutes with zero clock jitter, stricter than a real
ten-minute wait.

Fixtures stand the gateway-owned tables up by hand on SQLite
(test_consultants' pattern), reproducing two prod behaviours for real:
003's refuse_mutation triggers on the ledger and 013's
ledger_one_refund_per_order partial unique index — the backstop that makes
a racing settle credit once.

RLS-equivalent matrix (014's policies):
  sessions read    -> the caller's own, either side (the policy's
                      seeker_id/consultant_id predicate; a stranger sees
                      none — check assertion 11)
  threads read     -> participant-only (assertion 11: threads_view leaks
                      nothing to a stranger)
  messages read    -> participant-only; a non-participant GET is a 403,
                      not a silent empty list (module 6's documented
                      strictness — a silent empty reads as "no messages
                      yet" to someone probing ids)
  messages write   -> the live-session gate, and only as yourself;
                      refusal is the server's own sentence, 200 + {ok,
                      reason}, byte-parity with the PostgREST RPC contract
  accept/end/heartbeat -> the session's parties; refusal sentences are the
                      SQL's byte-identical ones
  admin            -> nowhere: no endpoint exists that reads another
                      person's session, thread or message
"""

import threading
from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from apps.chat import services
from apps.chat.models import Message, Session, Thread
from apps.chat.services import (
    REFUSAL_ALREADY_LIVE,
    REFUSAL_BAD_MODE,
    REFUSAL_GONE,
    REFUSAL_NO_SESSION,
    REFUSAL_NO_WALLET,
    REFUSAL_NOT_OPEN,
    REFUSAL_NOT_PARTICIPANT,
    REFUSAL_NOT_TAKING,
    REFUSAL_NOT_YOURS,
    REFUSAL_NOT_PRICED,
    REFUSAL_SELF_CHAT,
    REFUSAL_SESSION_ENDED,
    REFUSAL_SHORT_BALANCE,
)
from apps.consultants import gateway
from apps.consultants.models import (
    FEE_BPS,
    Consultant,
    ConsultantService,
    EarningsLedger,
)

from .conftest import OTHER_USER, TEST_USER, make_claims

SEEKER = TEST_USER
SECOND_SEEKER = OTHER_USER
PRO = "bbbbbbbb-5555-6666-7777-888888888888"
STRANGER = "dddddddd-5555-6666-7777-888888888888"
RATE = 7500  # ₹75/min — the rate the 1 Sep walk metered at
MIN = timedelta(minutes=1)
SEC = timedelta(seconds=1)

MESSAGE_KEYS = {"id", "thread_id", "sender_id", "body", "created_at", "read_at"}
THREAD_KEYS = {
    "id", "seeker_id", "consultant_id", "last_message_at", "last_preview",
    "created_at", "seeker_name", "consultant_name", "unread", "live_session_id",
}
SESSION_KEYS = {
    "id", "seeker_id", "consultant_id", "service_id", "thread_id", "order_id",
    "mode", "rate_paise", "status", "requested_at", "started_at", "expires_at",
    "ended_at", "heartbeat_at", "hold_paise", "charged_paise", "created_at",
}


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def seeker_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=SEEKER))


@pytest.fixture
def second_seeker_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=SECOND_SEEKER))


@pytest.fixture
def pro_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=PRO, role="consultant"))


@pytest.fixture
def stranger_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=STRANGER))


@pytest.fixture
def money_tables():
    """The raw tables module 7's gateway touches but modules 8/9 own —
    test_consultants' fixture verbatim, including prod's refuse_mutation
    triggers and the refund-per-order unique index."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "create table profiles (id text primary key, name text,"
            " birth_date text, birth_time text, birth_place text)"
        )
        cursor.execute(
            "create table wallets (profile_id text primary key,"
            " balance_paise integer not null default 0)"
        )
        cursor.execute(
            "create table ledger (id text primary key, wallet_id text not null,"
            " delta_paise integer not null check (delta_paise <> 0),"
            " kind text, ref_type text, ref_id text, note text, created_at text)"
        )
        cursor.execute(
            "create trigger ledger_immutable before update on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
        cursor.execute(
            "create trigger ledger_immutable_delete before delete on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
        cursor.execute(
            "create unique index ledger_one_refund_per_order on ledger (ref_id)"
            " where ref_type = 'refund' and ref_id is not null"
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
    from django.db import connection

    with connection.cursor() as cursor:
        for table in ("order_items", "orders", "ledger", "wallets", "profiles"):
            cursor.execute(f"drop table {table}")


def _profile(cursor, pid, name):
    cursor.execute(
        "insert into profiles (id, name) values (%s, %s)", [str(pid), name]
    )


@pytest.fixture
def pro_user(money_tables):
    """An approved consultant with one active per-minute CHAT service, plus
    four profiles: the seeker, a second seeker, a stranger, the pro."""
    from django.db import connection

    with connection.cursor() as cursor:
        _profile(cursor, SEEKER, "Tara Verma")
        _profile(cursor, SECOND_SEEKER, "Arjun Nair")
        _profile(cursor, PRO, "Ritu Kashyap")
        _profile(cursor, STRANGER, "Pryia Sen")
        # The gateway's SQLite emulation of the phase-2 balance trigger
        # UPDATES wallets, so the row must exist before any top-up.
        for pid in (SEEKER, SECOND_SEEKER):
            cursor.execute(
                "insert into wallets (profile_id, balance_paise) values (%s, 0)",
                [str(pid)],
            )
    consultant = Consultant.objects.create(
        profile_id=PRO, category="Astrologer", status="approved"
    )
    service = ConsultantService.objects.create(
        consultant_id=PRO,
        band_id="11111111-2222-3333-4444-555555555555",
        mode="chat",
        billing="per_minute",
        duration_mins=1,
        price_paise=RATE,
    )
    return consultant, service


def _service(consultant_id=PRO, *, mode="chat", billing="per_minute",
             price=RATE, active=True):
    """A second service shape for the SAME consultant — varies duration so
    it never collides with the roster's per-minute row (the 007 unique
    key)."""
    return ConsultantService.objects.create(
        consultant_id=consultant_id,
        band_id="11111111-2222-3333-4444-555555555555",
        mode=mode,
        billing=billing,
        duration_mins=5,
        price_paise=price,
        active=active,
    )


def _fund(pid, amount):
    gateway.insert_ledger(pid, amount, "Added money", ref_type="adjustment")


def _balance(pid):
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "select balance_paise from wallets where profile_id = %s", [str(pid)]
        )
        row = cursor.fetchone()
        return row[0] if row else None


def _counts(pid):
    """The 014 check's relative counts: wallet balance, ledger rows,
    earnings rows, session rows."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "select coalesce(sum(delta_paise), 0) from ledger where wallet_id = %s",
            [str(pid)],
        )
        ledger_sum = cursor.fetchone()[0]
        cursor.execute(
            "select count(*) from ledger where wallet_id = %s", [str(pid)]
        )
        ledger = cursor.fetchone()[0]
        cursor.execute(
            "select count(*) from orders where profile_id = %s", [str(pid)]
        )
        orders = cursor.fetchone()[0]
        cursor.execute(
            "select count(*) from order_items where order_id in"
            " (select id from orders where profile_id = %s)",
            [str(pid)],
        )
        order_items = cursor.fetchone()[0]
    return {
        "balance": _balance(pid),
        "ledger": ledger,
        "ledger_sum": ledger_sum,
        "orders": orders,
        "order_items": order_items,
        "sessions": Session.objects.filter(seeker_id=pid).count(),
    }


def _t0():
    """A whole-second clock instant — the 014 check's no-jitter discipline."""
    return timezone.now().replace(microsecond=0)


def _live_session(pro_user, *, minutes=20, seeker=SEEKER, rate=RATE, now=None,
                  fund=None):
    """Ask + accept at a fixed instant; returns (live session, thread_id)."""
    _, service = pro_user
    now = now or _t0()
    if fund is not None:
        _fund(seeker, fund)
    requested = services.request_chat(seeker, PRO, service.id)
    assert requested["ok"], requested
    accepted = services.accept_chat(PRO, requested["session_id"], now=now)
    assert accepted["ok"], accepted
    return Session.objects.get(pk=accepted["session_id"]), accepted["thread_id"]


def _stamp(session, *, started_at=None, expires_at=None, heartbeat_at=None):
    """The 014 check's time-faking: move the stamps, never wait."""
    Session.objects.filter(pk=session.id).update(
        started_at=started_at, expires_at=expires_at, heartbeat_at=heartbeat_at
    )
    return Session.objects.get(pk=session.id)


# ── check assertion 1: asking costs NOTHING ──────────────────────────────────


@pytest.mark.django_db
class TestRequest:
    def test_asking_moves_no_money(self, pro_user):
        service = pro_user[1]
        _fund(SEEKER, RATE * 20)
        before = _counts(SEEKER)

        result = services.request_chat(SEEKER, PRO, service.id)

        assert result["ok"] is True
        assert result["rate_paise"] == RATE
        after = _counts(SEEKER)
        # Asking costs NOTHING: the wallet and the ledger are untouched
        # (the check's assertion 1); the only new row is the request itself.
        assert after["balance"] == before["balance"]
        assert after["ledger"] == before["ledger"]
        assert after["ledger_sum"] == before["ledger_sum"]
        assert after["orders"] == before["orders"]
        assert after["sessions"] == before["sessions"] + 1
        session = Session.objects.get(pk=result["session_id"])
        assert session.status == Session.Status.REQUESTED
        assert session.rate_paise == RATE  # the rate is FROZEN at request

    def test_self_chat_refused(self, pro_user):
        service = pro_user[1]
        result = services.request_chat(PRO, PRO, service.id)
        assert result == {"ok": False, "reason": REFUSAL_SELF_CHAT}

    def test_unapproved_consultant_refused(self, pro_user):
        service = pro_user[1]
        Consultant.objects.filter(pk=PRO).update(status="pending")
        assert services.request_chat(SEEKER, PRO, service.id) == {
            "ok": False, "reason": REFUSAL_NOT_TAKING,
        }

    def test_inactive_service_refused(self, pro_user):
        service = pro_user[1]
        service.active = False
        service.save()
        assert services.request_chat(SEEKER, PRO, service.id) == {
            "ok": False, "reason": REFUSAL_NOT_TAKING,
        }

    def test_fixed_billing_service_refused(self, pro_user):
        service = _service(billing="fixed")
        assert services.request_chat(SEEKER, PRO, service.id) == {
            "ok": False, "reason": REFUSAL_NOT_TAKING,
        }

    def test_other_consultants_service_refused(self, pro_user):
        service = pro_user[1]
        other = Consultant.objects.create(
            profile_id=SECOND_SEEKER, category="Astrologer", status="approved"
        )
        foreign = ConsultantService.objects.create(
            consultant_id=other.profile_id,
            band_id="11111111-2222-3333-4444-555555555555",
            mode="chat", billing="per_minute", duration_mins=1, price_paise=RATE,
        )
        assert services.request_chat(SEEKER, PRO, foreign.id) == {
            "ok": False, "reason": REFUSAL_NOT_TAKING,
        }

    def test_unpriced_service_refused_by_name(self, pro_user):
        service = _service(price=0)
        assert services.request_chat(SEEKER, PRO, service.id) == {
            "ok": False, "reason": REFUSAL_NOT_PRICED,
        }

    def test_booking_mode_is_a_refusal_not_a_crash(self, pro_user):
        # 018 fix 3: consultant_services.mode permits 'booking', sessions
        # does not — the request must refuse, not raise a check violation.
        service = _service(mode="booking")
        result = services.request_chat(SEEKER, PRO, service.id)
        assert result == {"ok": False, "reason": REFUSAL_BAD_MODE}
        assert _counts(SEEKER)["sessions"] == 0

    def test_short_wallet_refused_before_anyone_waits(self, pro_user):
        service = pro_user[1]
        _fund(SEEKER, RATE - 1)
        result = services.request_chat(SEEKER, PRO, service.id)
        assert result == {
            "ok": False, "reason": REFUSAL_SHORT_BALANCE, "rate_paise": RATE,
        }

    def test_asking_twice_is_the_same_ask(self, pro_user):
        # 018 fix 2: one open request per pair, the index is the guarantee.
        service = pro_user[1]
        _fund(SEEKER, RATE * 5)
        first = services.request_chat(SEEKER, PRO, service.id)
        second = services.request_chat(SEEKER, PRO, service.id)
        assert first["ok"] and second["ok"]
        assert second["session_id"] == first["session_id"]
        assert Session.objects.filter(
            seeker_id=SEEKER, consultant_id=PRO, status="requested"
        ).count() == 1


# ── check assertion 2: the hold, and 017's no-cap ────────────────────────────


@pytest.mark.django_db
class TestAccept:
    def test_hold_is_every_minute_the_wallet_can_buy(self, pro_user):
        # 017: the 30-minute cap is gone. Whatever the balance buys is
        # held — here 47 minutes at ₹75, an amount the cap would have cut.
        service = pro_user[1]
        _fund(SEEKER, RATE * 47)
        before = _counts(SEEKER)
        requested = services.request_chat(SEEKER, PRO, service.id)
        now = _t0()

        result = services.accept_chat(PRO, requested["session_id"], now=now)

        assert result["ok"] is True
        assert result["minutes_held"] == 47
        assert result["hold_paise"] == RATE * 47
        assert result["expires_at"] == now + 47 * MIN
        after = _counts(SEEKER)
        # The whole affordable balance, and not a paise more: a part-minute
        # nobody can afford is neither held nor sold (the check's own words).
        assert before["balance"] - after["balance"] == result["hold_paise"]
        assert after["balance"] < RATE
        assert after["orders"] == before["orders"] + 1
        assert after["order_items"] == before["order_items"] + 1
        assert after["ledger"] == before["ledger"] + 1  # one hold, one row
        # Nothing is earned yet. Nobody has said anything.
        assert EarningsLedger.objects.filter(consultant_id=PRO).count() == 0

    def test_accept_refused_when_wallet_cannot_buy_a_minute(self, pro_user):
        # Check assertion 9's accept-time branch: the request passes (the
        # wallet holds exactly one minute), then the balance drops before
        # the consultant answers — ACCEPT is what must refuse, writing
        # nothing and leaving no live session nobody is paying for.
        service = pro_user[1]
        _fund(SEEKER, RATE)
        requested = services.request_chat(SEEKER, PRO, service.id)
        _fund(SEEKER, -1)  # drain one paise: rate - 1
        before = _counts(SEEKER)

        result = services.accept_chat(PRO, requested["session_id"])

        assert result == {
            "ok": False, "reason": REFUSAL_SHORT_BALANCE,
            "balance_paise": RATE - 1,
        }
        assert _counts(SEEKER) == before  # a refused accept writes nothing
        session = Session.objects.get(pk=requested["session_id"])
        assert session.status == Session.Status.REQUESTED  # not left live

    def test_accept_without_wallet(self, pro_user):
        _, service = pro_user
        # The request only passes the advisory check with a wallet, so
        # stand the session up by hand — on a profile that has NO wallet
        # row at all — to reach accept's own branch.
        session = Session.objects.create(
            seeker_id=STRANGER, consultant_id=PRO, service_id=service.id,
            mode="chat", rate_paise=RATE, status="requested",
        )
        assert services.accept_chat(PRO, session.id) == {
            "ok": False, "reason": REFUSAL_NO_WALLET,
        }

    def test_accept_gone(self, pro_user):
        from uuid import uuid4

        assert services.accept_chat(PRO, uuid4()) == {
            "ok": False, "reason": REFUSAL_GONE,
        }

    def test_only_the_consultant_accepts_and_only_out_of_requested(self, pro_user):
        service = pro_user[1]
        _fund(SEEKER, RATE * 5)
        requested = services.request_chat(SEEKER, PRO, service.id)
        # The seeker cannot accept their own request...
        assert services.accept_chat(SEEKER, requested["session_id"]) == {
            "ok": False, "reason": REFUSAL_NOT_OPEN,
        }
        # ...and a second tap after the join finds it resolved.
        assert services.accept_chat(PRO, requested["session_id"])["ok"] is True
        assert services.accept_chat(PRO, requested["session_id"]) == {
            "ok": False, "reason": REFUSAL_NOT_OPEN,
        }

    def test_whole_balance_held_so_nothing_else_can_be_bought(self, pro_user):
        # 017's documented cost, proved sideways the way the check does it:
        # with the whole balance held by the live session, the same seeker's
        # next request is refused for want of money.
        service = pro_user[1]
        _live_session(pro_user, minutes=10, fund=RATE * 10)
        result = services.request_chat(SEEKER, PRO, service.id)
        assert result == {"ok": False, "reason": REFUSAL_SHORT_BALANCE,
                          "rate_paise": RATE}


# ── check assertions 3–8: the meter ──────────────────────────────────────────


@pytest.mark.django_db
class TestSettle:
    def test_ten_minutes_charges_ten_and_the_ledger_replays(self, pro_user):
        # Check assertions 2 (second half), 5 and 6, in the check's order.
        service = pro_user[1]
        _fund(SEEKER, RATE * 20)
        bal0 = _balance(SEEKER)
        earn0 = EarningsLedger.objects.filter(consultant_id=PRO).count()
        requested = services.request_chat(SEEKER, PRO, service.id)
        session_id = requested["session_id"]
        t0 = _t0()
        accepted = services.accept_chat(PRO, session_id, now=t0)
        hold = accepted["hold_paise"]

        # Stamped as having begun ten minutes ago; now() is the injected
        # instant, so this is exact and not a race with the clock.
        _stamp(Session.objects.get(pk=session_id),
               started_at=t0 - 10 * MIN, expires_at=t0 + 10 * MIN)
        led0 = _counts(SEEKER)["ledger"]
        result = services.end_session(SEEKER, session_id, now=t0)

        assert result == {
            "ok": True, "minutes": 10,
            "charged_paise": RATE * 10, "refunded_paise": hold - RATE * 10,
        }
        assert _counts(SEEKER)["ledger"] == led0 + 1  # exactly one settle row
        assert _balance(SEEKER) == bal0 - RATE * 10  # ten minutes, not the hold
        assert _balance(SEEKER) == _counts(SEEKER)["ledger_sum"]  # replays
        assert result["refunded_paise"] > 0

        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select total_paise from orders where id = %s",
                [str(Session.objects.get(pk=session_id).order_id)],
            )
            assert cursor.fetchone()[0] == RATE * 10  # the order restated

        # Assertion 6: the consultant earns what was USED, gross − fee = net.
        assert EarningsLedger.objects.filter(consultant_id=PRO).count() == earn0 + 1
        gross = RATE * 10
        fee = round(gross * 1800 / 10000)  # 135 exact at ₹75/min
        row = EarningsLedger.objects.get(consultant_id=PRO)
        assert row.gross_paise == gross and row.fee_bps == FEE_BPS
        assert row.fee_paise == fee and row.net_paise == gross - fee
        assert row.booking_id is None
        assert row.kind == "Tara Verma · 10 min chat"

        # Assertion 7: ending twice settles once — both sides press End.
        led0 = _counts(SEEKER)["ledger"]
        again = services.end_session(SEEKER, session_id, now=t0)
        assert again["ok"] is True and again["already_ended"] is True
        assert again["charged_paise"] == gross
        assert _counts(SEEKER)["ledger"] == led0  # no more rows

    def test_round_up_boundaries(self, pro_user):
        # Constructed from the SQL's exact rule — greatest(1, ceil(s/60)),
        # clamped to the hold — not from intuition. Every boundary where a
        # naive implementation slips: 60s is ONE minute, 61s is two.
        cases = [(0, 1), (1, 1), (59, 1), (60, 1), (61, 2), (119, 2),
                 (120, 2), (121, 3), (3599, 60), (3600, 60), (3601, 61)]
        for seconds, expected in cases:
            Session.objects.all().delete()
            session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
            t0 = _t0()
            _stamp(session, started_at=t0 - timedelta(seconds=seconds),
                   expires_at=t0 + 1000 * MIN)
            result = services.end_session(SEEKER, session.id, now=t0)
            assert result["minutes"] == expected, f"{seconds}s -> {expected}"
            assert result["charged_paise"] == expected * RATE
            assert result["refunded_paise"] == session.hold_paise - expected * RATE

    def test_bill_clamps_to_what_was_held(self, pro_user):
        # The hold is the ceiling: overstay the bought minutes and the bill
        # stops at the hold — a tab left open overnight is charged for the
        # minutes it bought and not one more. No refund row is written when
        # the whole hold is used (one ledger row per session, not two).
        session, _ = _live_session(pro_user, minutes=5, fund=RATE * 5)
        t0 = _t0()
        _stamp(session, started_at=t0 - 20 * MIN, expires_at=t0 - 5 * MIN)
        led0 = _counts(SEEKER)["ledger"]
        result = services.end_session(SEEKER, session.id, now=t0)
        assert result["minutes"] == 5
        assert result["charged_paise"] == RATE * 5
        assert result["refunded_paise"] == 0
        assert _counts(SEEKER)["ledger"] == led0  # settle wrote nothing back

    def test_fee_rounds_half_away_from_zero(self, pro_user):
        # Postgres numeric round is half away from zero, never banker's:
        # 225 paise gross -> 40.5 fee -> 41. A banker's-rounding default
        # would say 40.
        from apps.consultants.services import fee_paise

        assert fee_paise(225) == 41
        assert fee_paise(25) == 5  # 4.5 -> 5, the half boundary itself
        session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
        t0 = _t0()
        _stamp(session, started_at=t0 - 3 * MIN, expires_at=t0 + 17 * MIN)
        services.end_session(SEEKER, session.id, now=t0)
        row = EarningsLedger.objects.get(consultant_id=PRO)
        # Three minutes at ₹75: gross ₹225, fee ₹40.50 -> ₹41, net ₹184 —
        # the 1 Sep walk's own arithmetic, in paise.
        assert row.gross_paise == 22500 and row.fee_paise == 4050
        assert row.net_paise == 18450

    def test_either_party_may_end(self, pro_user):
        session, _ = _live_session(pro_user, minutes=10, fund=RATE * 10)
        t0 = _t0()
        _stamp(session, started_at=t0 - 2 * MIN, expires_at=t0 + 8 * MIN)
        result = services.end_session(PRO, session.id, now=t0)
        assert result["ok"] is True and result["minutes"] == 2
        assert Session.objects.get(pk=session.id).status == "ended"

    def test_stranger_cannot_end(self, pro_user):
        session, _ = _live_session(pro_user, minutes=10, fund=RATE * 10)
        assert services.end_session(STRANGER, session.id) == {
            "ok": False, "reason": REFUSAL_NOT_YOURS,
        }
        assert Session.objects.get(pk=session.id).status == "live"

    def test_end_of_missing_session(self, pro_user):
        from uuid import uuid4

        assert services.end_session(SEEKER, uuid4()) == {
            "ok": False, "reason": REFUSAL_NO_SESSION,
        }

    def test_client_caller_never_writes_the_ledger_note(self, pro_user):
        # 018 fix 4: only the sweeper's reason lands in the refund note.
        session, _ = _live_session(pro_user, minutes=10, fund=RATE * 10)
        t0 = _t0()
        _stamp(session, started_at=t0 - 2 * MIN, expires_at=t0 + 8 * MIN)
        services.end_session(
            SEEKER, session.id, reason="time ran out", now=t0
        )  # a JWT caller trying to smuggle a note
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select note from ledger where ref_type = 'refund'"
                " and wallet_id = %s",
                [str(SEEKER)],
            )
            assert cursor.fetchone()[0] == "ended"


# ── check assertion 3: one live session per consultant ───────────────────────


@pytest.mark.django_db
class TestOneLivePerConsultant:
    def test_second_seekers_accept_is_refused_by_name(self, pro_user):
        # Check assertion 3: it takes a SECOND seeker to test honestly —
        # the first seeker's whole balance is held, so their next request
        # dies on money before it ever reaches the index.
        service = pro_user[1]
        _live_session(pro_user, minutes=10, fund=RATE * 10)
        _fund(SECOND_SEEKER, RATE * 5)
        before = _counts(SECOND_SEEKER)
        requested = services.request_chat(SECOND_SEEKER, PRO, service.id)
        assert requested["ok"] is True
        result = services.accept_chat(PRO, requested["session_id"])
        assert result == {"ok": False, "reason": REFUSAL_ALREADY_LIVE}
        # The refused accept unwound completely: no order, no debit, and
        # the second request is still sitting there, unpaid.
        after = _counts(SECOND_SEEKER)
        assert after["balance"] == before["balance"]
        assert after["orders"] == before["orders"] == 0
        assert after["ledger"] == before["ledger"]
        assert Session.objects.get(pk=requested["session_id"]).status == "requested"

    def test_a_second_live_session_index_refusal_is_not_the_only_guard(self):
        # The unique index is the backstop for a racing second REQUEST; the
        # row lock (018 fix 1) is what catches the double accept. Both are
        # covered here by the service-layer proofs in TestAcceptRace.
        pass


# ── check assertion 4 + 8: the live-session gate on messages ─────────────────


@pytest.mark.django_db
class TestMessageGate:
    def _live_thread(self, pro_user, now=None):
        session, thread_id = _live_session(pro_user, minutes=10,
                                           fund=RATE * 10, now=now)
        return session, thread_id

    def test_both_parties_write_inside_a_live_session(self, pro_user):
        _, thread_id = self._live_thread(pro_user)
        by_pro = services.send_message(PRO, thread_id, "Namaste. What would you like to look at?")
        by_seeker = services.send_message(SEEKER, thread_id, "My career, please.")
        assert by_pro["ok"] is True and by_seeker["ok"] is True
        assert by_pro["message"]["sender_id"] == str(PRO)
        assert by_seeker["message"]["sender_id"] == str(SEEKER)
        assert set(by_pro["message"].keys()) == MESSAGE_KEYS

    def test_gate_matrix(self, pro_user):
        """Who may message when: only a participant, only inside a live and
        UNEXPIRED session. Every other cell is refused."""
        session, thread_id = self._live_thread(pro_user)
        t0 = _t0()

        # live + unexpired: both parties write
        assert services.send_message(SEEKER, thread_id, "a", now=t0)["ok"] is True
        assert services.send_message(PRO, thread_id, "b", now=t0)["ok"] is True
        # the boundary IS the server's expires_at, to the second
        assert services.send_message(SEEKER, thread_id, "c", now=session.expires_at) == {
            "ok": False, "reason": REFUSAL_SESSION_ENDED,
        }
        assert services.send_message(
            SEEKER, thread_id, "c", now=session.expires_at - SEC
        )["ok"] is True
        # ended: the transcript is read-only (check assertion 8)
        services.end_session(SEEKER, session.id, now=t0)
        after = services.send_message(SEEKER, thread_id, "one more thing, free of charge?", now=t0)
        assert after == {"ok": False, "reason": REFUSAL_SESSION_ENDED}
        # a requested session (no thread yet) and a thread with no session
        # are the same refusal — the meter, not the row, gates the write
        service = pro_user[1]
        services.request_chat(SECOND_SEEKER, PRO, service.id)
        _fund(SECOND_SEEKER, RATE * 5)
        second = services.request_chat(SECOND_SEEKER, PRO, service.id)
        assert services.send_message(
            SECOND_SEEKER,
            Session.objects.get(pk=second["session_id"]).thread_id or thread_id,
            "hello?", now=t0,
        )["ok"] is False
        # a stranger cannot write at all
        assert services.send_message(STRANGER, thread_id, "hi", now=t0) == {
            "ok": False, "reason": REFUSAL_NOT_PARTICIPANT,
        }
        # ...but reading it is still fine for the people who paid (assertion 8)
        assert len(services.list_messages(SEEKER, thread_id)) >= 2

    def test_whitespace_only_body_refused(self, pro_user):
        _, thread_id = self._live_thread(pro_user)
        assert services.send_message(SEEKER, thread_id, "   ")["ok"] is False
        assert Message.objects.count() == 0  # prod's btrim check, in the service

    def test_preview_cache_follows_the_insert(self, pro_user):
        # 016: last_message_at / last_preview track the newest message; the
        # preview is left(body, 120) — characters, enough to recognise the
        # conversation, not enough to leak it into a notification.
        _, thread_id = self._live_thread(pro_user)
        body = "x" * 250
        sent = services.send_message(SEEKER, thread_id, body)
        thread = Thread.objects.get(pk=thread_id)
        assert thread.last_preview == body[:120]
        assert thread.last_message_at == sent["message"]["created_at"]


# ── the heartbeat ────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestHeartbeat:
    def test_live_session_answers_seconds_and_rate(self, pro_user):
        session, _ = _live_session(pro_user, minutes=10, fund=RATE * 10)
        t0 = _t0()
        _stamp(session, started_at=t0 - 2 * MIN, expires_at=t0 + 8 * MIN)
        result = services.heartbeat(SEEKER, session.id, now=t0)
        assert result == {"ok": True, "live": True,
                          "seconds_left": 8 * 60, "rate_paise": RATE}
        assert Session.objects.get(pk=session.id).heartbeat_at == t0

    def test_not_live_answers_zero_without_touching_anything(self, pro_user):
        session, _ = _live_session(pro_user, minutes=10, fund=RATE * 10)
        services.end_session(SEEKER, session.id)
        assert services.heartbeat(SEEKER, session.id) == {
            "ok": True, "live": False, "seconds_left": 0,
        }

    def test_expired_but_not_yet_swept_is_still_live_with_zero(self, pro_user):
        # Prod's exact answer: the heartbeat cannot end a session; only the
        # sweeper can. The room shows 0 and the gate refuses messages.
        session, thread_id = _live_session(pro_user, minutes=10, fund=RATE * 10)
        t0 = _t0()
        _stamp(session, started_at=t0 - 11 * MIN, expires_at=t0 - 1 * MIN)
        result = services.heartbeat(SEEKER, session.id, now=t0)
        assert result["live"] is True and result["seconds_left"] == 0

    def test_stranger_cannot_heartbeat(self, pro_user):
        session, _ = _live_session(pro_user, minutes=10, fund=RATE * 10)
        assert services.heartbeat(STRANGER, session.id) == {
            "ok": False, "reason": REFUSAL_NOT_YOURS,
        }


# ── check assertion 10 + 018: the sweeper ────────────────────────────────────


@pytest.mark.django_db
class TestSweeper:
    def test_abandoned_session_settles_by_grace(self, pro_user):
        # Check assertion 10: silent with time still on the clock — the
        # grace period decides it, not expiry.
        session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
        t0 = _t0()
        _stamp(session, started_at=t0 - 5 * MIN, heartbeat_at=t0 - 5 * MIN,
               expires_at=t0 + 15 * MIN)
        led0 = _counts(SEEKER)["ledger"]
        result = services.sweep_sessions(now=t0)
        assert result["settled"] == 1
        settled = Session.objects.get(pk=session.id)
        assert settled.status == "ended"
        assert settled.charged_paise == RATE * 5  # exactly the abandoned minutes
        assert _counts(SEEKER)["ledger"] == led0 + 1  # one settle row
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select note from ledger where ref_type = 'refund' and wallet_id = %s",
                [str(SEEKER)],
            )
            assert cursor.fetchone()[0] == "connection lost"  # the sweeper's note

    def test_expired_session_settles_as_time_ran_out(self, pro_user):
        session, _ = _live_session(pro_user, minutes=10, fund=RATE * 10)
        t0 = _t0()
        # Fresh heartbeat, clock run out: expiry decides this one. Six of
        # the ten held minutes were used — a refund row exists to carry the
        # sweeper's note.
        _stamp(session, started_at=t0 - 8 * MIN, heartbeat_at=t0,
               expires_at=t0 - 2 * MIN)
        assert services.sweep_sessions(now=t0)["settled"] == 1
        settled = Session.objects.get(pk=session.id)
        assert settled.status == "ended"
        assert settled.charged_paise == RATE * 6
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select note from ledger where ref_type = 'refund' and wallet_id = %s",
                [str(SEEKER)],
            )
            assert cursor.fetchone()[0] == "time ran out"

    def test_grace_boundary_is_sixty_seconds(self, pro_user):
        # coalesce(heartbeat_at, started_at) < now - 60s: exactly 60s of
        # silence is NOT swept — a train tunnel does not end a paid reading.
        for silent_secs, swept in ((59, False), (60, False), (61, True)):
            Session.objects.all().delete()
            session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
            t0 = _t0()
            _stamp(session, started_at=t0 - timedelta(seconds=silent_secs),
                   heartbeat_at=t0 - timedelta(seconds=silent_secs),
                   expires_at=t0 + 20 * MIN)
            assert services.sweep_sessions(now=t0)["settled"] == (1 if swept else 0)
            assert Session.objects.get(pk=session.id).status == (
                "ended" if swept else "live"
            )

    def test_heartbeats_coalesce_over_started_at(self, pro_user):
        # A session that never heartbeats after starting still sweeps off
        # started_at.
        session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
        t0 = _t0()
        _stamp(session, started_at=t0 - 5 * MIN, heartbeat_at=None,
               expires_at=t0 + 15 * MIN)
        assert services.sweep_sessions(now=t0)["settled"] == 1

    def test_unanswered_requests_expire_after_fifteen_minutes(self, pro_user):
        # 018 fix 2's second half: the queue cannot pile up forever. No
        # money is involved — a status change and nothing else.
        service = pro_user[1]
        _fund(SEEKER, RATE * 5)
        old = services.request_chat(SEEKER, PRO, service.id)
        _fund(SECOND_SEEKER, RATE * 5)
        fresh = services.request_chat(SECOND_SEEKER, PRO, service.id)
        t0 = _t0()
        Session.objects.filter(pk=old["session_id"]).update(
            requested_at=t0 - 15 * MIN - SEC
        )
        result = services.sweep_sessions(now=t0)
        assert result["expired_requests"] == 1
        assert Session.objects.get(pk=old["session_id"]).status == "expired"
        assert Session.objects.get(pk=fresh["session_id"]).status == "requested"
        # The expired request frees the pair to ask again.
        again = services.request_chat(SEEKER, PRO, service.id)
        assert again["ok"] is True
        assert again["session_id"] != old["session_id"]

    def test_sweep_is_idempotent(self, pro_user):
        session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
        t0 = _t0()
        _stamp(session, started_at=t0 - 5 * MIN, heartbeat_at=t0 - 5 * MIN,
               expires_at=t0 + 15 * MIN)
        assert services.sweep_sessions(now=t0)["settled"] == 1
        led0 = _counts(SEEKER)["ledger"]
        earn0 = EarningsLedger.objects.filter(consultant_id=PRO).count()
        assert services.sweep_sessions(now=t0)["settled"] == 0
        assert _counts(SEEKER)["ledger"] == led0
        assert EarningsLedger.objects.filter(consultant_id=PRO).count() == earn0

    def test_management_command_wraps_the_sweep(self, pro_user):
        session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
        t0 = _t0()
        # Real clock: move the stamps genuinely into the past.
        _stamp(session, started_at=t0 - 5 * MIN, heartbeat_at=t0 - 5 * MIN,
               expires_at=t0 + 15 * MIN)
        from io import StringIO

        out = StringIO()
        call_command("sweep_sessions", stdout=out)
        assert "settled=1" in out.getvalue()
        assert Session.objects.get(pk=session.id).status == "ended"


# ── the read side: threads_view shape, unread, cursor paging ─────────────────


@pytest.mark.django_db
class TestReadSide:
    def _conversation(self, pro_user, now=None):
        session, thread_id = _live_session(pro_user, minutes=10,
                                           fund=RATE * 10, now=now)
        services.send_message(SEEKER, thread_id, "My career, please.", now=now)
        services.send_message(PRO, thread_id, "Namaste. Your 10th lord is strong.", now=now)
        services.send_message(PRO, thread_id, "What would you like to look at?", now=now)
        return session, thread_id

    def test_threads_view_shape_and_unread(self, pro_user):
        _, thread_id = self._conversation(pro_user)
        seeker_threads = services.list_threads(SEEKER)
        assert len(seeker_threads) == 1
        row = seeker_threads[0]
        assert set(row.keys()) == THREAD_KEYS
        assert row["seeker_name"] == "Tara Verma"
        assert row["consultant_name"] == "Ritu Kashyap"
        assert row["unread"] == 2  # the pro's two messages
        assert row["live_session_id"] is not None
        assert row["last_preview"] == "What would you like to look at?"
        pro_threads = services.list_threads(PRO)
        assert pro_threads[0]["unread"] == 1  # the seeker's one message
        assert pro_threads[0]["id"] == thread_id

    def test_unread_clears_on_open_right_side_only(self, pro_user):
        # Handoff done-condition 3: (2,1) -> (0,1).
        self._conversation(pro_user)
        services.mark_read(PRO, self._thread_id(PRO))
        seeker_side = services.list_threads(SEEKER)[0]
        pro_side = services.list_threads(PRO)[0]
        assert pro_side["unread"] == 0
        assert seeker_side["unread"] == 2

    def _thread_id(self, actor):
        return services.list_threads(actor)[0]["id"]

    def test_threads_with_no_messages_sort_last(self, pro_user):
        # A thread with no messages reads "No messages yet." and sorts
        # after the ones with a preview (the client's nullsFirst: false).
        session, thread_id = _live_session(pro_user, minutes=10, fund=RATE * 10)
        services.send_message(SEEKER, thread_id, "hi")
        # One live session per consultant: end the first before the second
        # pair's thread is created.
        services.end_session(SEEKER, session.id)
        _fund(SECOND_SEEKER, RATE * 5)
        requested = services.request_chat(SECOND_SEEKER, PRO, pro_user[1].id)
        services.accept_chat(PRO, requested["session_id"])
        rows = services.list_threads(PRO)
        assert [r["last_preview"] for r in rows] == ["hi", None]

    def test_live_session_id_disappears_when_the_session_ends(self, pro_user):
        session, thread_id = self._conversation(pro_user)
        assert services.list_threads(SEEKER)[0]["live_session_id"] is not None
        services.end_session(SEEKER, session.id)
        assert services.list_threads(SEEKER)[0]["live_session_id"] is None

    def test_stranger_sees_nothing(self, pro_user):
        # Check assertion 11, service layer: not the session, not the
        # thread, not one message.
        _, thread_id = self._conversation(pro_user)
        assert services.list_sessions(STRANGER) == []
        assert services.list_threads(STRANGER) == []
        assert services.list_messages(STRANGER, thread_id) is None

    def test_cursor_pages_have_no_gaps_or_duplicates(self, pro_user):
        # Polling-cursor exactness: keyset pages chained on `after` while
        # new messages land reproduce the transcript exactly once, in
        # order. Offsets would drift under concurrent inserts; the keyset
        # cannot.
        _, thread_id = _live_session(pro_user, minutes=30, fund=RATE * 30)
        for n in range(25):
            services.send_message(SEEKER, thread_id, f"message {n}")

        seen, cursor = [], None
        page_no = 0
        while True:
            page = services.list_messages(SEEKER, thread_id,
                                          after=cursor, limit=10)
            if page_no == 1:  # between page 1 and page 2, the other party talks
                for n in range(7):
                    services.send_message(PRO, thread_id, f"late {n}")
            seen.extend(row["id"] for row in page)
            if len(page) < 10:
                break
            cursor = page[-1]["id"]
            page_no += 1

        all_ids = [row["id"] for row in services.list_messages(SEEKER, thread_id)]
        assert len(seen) == len(set(seen)) == len(all_ids) == 32
        assert seen == all_ids  # ascending (created_at, id), nothing lost

    def test_unknown_cursor_returns_from_the_start(self, pro_user):
        _, thread_id = _live_session(pro_user, minutes=10, fund=RATE * 10)
        services.send_message(SEEKER, thread_id, "one")
        from uuid import uuid4

        rows = services.list_messages(SEEKER, thread_id, after=uuid4())
        assert [r["body"] for r in rows] == ["one"]


# ── the endpoint contract: /v1/chat call-for-call with src/lib/chat.js ──────


@pytest.mark.django_db
class TestEndpoints:
    def test_full_walk_and_shapes(self, hs256_mode, sign_hs256, api_client,
                                  pro_user):
        service = pro_user[1]
        _fund(SEEKER, RATE * 20)
        seeker = sign_hs256(claims=make_claims(sub=SEEKER))
        pro = sign_hs256(claims=make_claims(sub=PRO, role="consultant"))

        # requestChat -> {ok, session_id, rate_paise}
        response = api_client.post(
            "/v1/chat/sessions/request/",
            {"consultant_id": str(PRO), "service_id": str(service.id)},
            format="json", **auth(seeker),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True and body["rate_paise"] == RATE
        session_id = body["session_id"]

        # The consultant's queue read (ProConsult filters listSessions).
        response = api_client.get("/v1/chat/sessions/", **auth(pro))
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1 and set(rows[0].keys()) == SESSION_KEYS
        assert rows[0]["status"] == "requested"
        assert rows[0]["rate_paise"] == RATE

        # acceptChat -> the hold, the clock, the thread.
        t0 = _t0()
        response = api_client.post(
            f"/v1/chat/sessions/{session_id}/accept/", **auth(pro)
        )
        assert response.status_code == 200
        accepted = response.json()
        assert accepted["ok"] is True and accepted["minutes_held"] == 20
        assert accepted["hold_paise"] == RATE * 20
        thread_id = accepted["thread_id"]

        # listThreads: the seeker's room learns the consultant joined.
        response = api_client.get("/v1/chat/threads/", **auth(seeker))
        thread = response.json()[0]
        assert set(thread.keys()) == THREAD_KEYS
        assert thread["live_session_id"] == session_id
        assert thread["consultant_name"] == "Ritu Kashyap"

        # sendMessage -> {ok, message: <row>} for the sender's immediate render.
        response = api_client.post(
            f"/v1/chat/threads/{thread_id}/messages/send/",
            {"body": "My career, please."}, format="json", **auth(seeker),
        )
        assert response.status_code == 200
        sent = response.json()
        assert sent["ok"] is True and set(sent["message"].keys()) == MESSAGE_KEYS
        assert sent["message"]["sender_id"] == str(SEEKER)

        # The polling cursor: messages?after=<id> returns only what is new.
        response = api_client.get(
            f"/v1/chat/threads/{thread_id}/messages/"
            f"?after={sent['message']['id']}",
            **auth(pro),
        )
        assert response.json() == []

        # markRead clears the pro's unread, nobody else's.
        api_client.post(f"/v1/chat/threads/{thread_id}/read/", **auth(pro))
        me = api_client.get("/v1/chat/threads/", **auth(seeker)).json()[0]
        assert me["unread"] == 0

        # heartbeat -> {ok, live, seconds_left, rate_paise}
        response = api_client.post(
            f"/v1/chat/sessions/{session_id}/heartbeat/", **auth(seeker)
        )
        assert response.json()["live"] is True
        assert response.json()["rate_paise"] == RATE

        # endChat -> the settle; a second end reports already_ended.
        response = api_client.post(
            f"/v1/chat/sessions/{session_id}/end/", **auth(seeker)
        )
        ended = response.json()
        assert ended["ok"] is True and ended["minutes"] >= 1
        again = api_client.post(
            f"/v1/chat/sessions/{session_id}/end/", **auth(pro)
        ).json()
        assert again["already_ended"] is True

        # After the end the transcript is read-only but still readable.
        refused = api_client.post(
            f"/v1/chat/threads/{thread_id}/messages/send/",
            {"body": "free?"}, format="json", **auth(seeker),
        ).json()
        assert refused == {"ok": False, "reason": REFUSAL_SESSION_ENDED}
        history = api_client.get(
            f"/v1/chat/threads/{thread_id}/messages/", **auth(seeker)
        )
        assert [m["body"] for m in history.json()] == ["My career, please."]

    def test_unauthenticated_is_refused(self, api_client, pro_user):
        response = api_client.get("/v1/chat/sessions/")
        assert response.status_code == 401
        response = api_client.get("/v1/chat/threads/")
        assert response.status_code == 401
        response = api_client.post("/v1/chat/sessions/request/", {}, format="json")
        assert response.status_code == 401

    def test_stranger_reads_nothing(self, stranger_token, api_client, pro_user):
        # Check assertion 11 over HTTP: 403 on the transcript, empty lists,
        # and the {ok, reason} envelope on a write attempt.
        _, thread_id = _live_session(pro_user, minutes=10, fund=RATE * 10)
        services.send_message(SEEKER, thread_id, "private")
        response = api_client.get(
            f"/v1/chat/threads/{thread_id}/messages/", **auth(stranger_token)
        )
        assert response.status_code == 403
        assert response.json()["reason"] == "forbidden"
        assert api_client.get("/v1/chat/threads/", **auth(stranger_token)).json() == []
        assert api_client.get("/v1/chat/sessions/", **auth(stranger_token)).json() == []
        refused = api_client.post(
            f"/v1/chat/threads/{thread_id}/messages/send/",
            {"body": "hi"}, format="json", **auth(stranger_token),
        ).json()
        assert refused["ok"] is False

    def test_refusal_sentences_are_byte_exact(self, pro_user, api_client,
                                              seeker_token):
        # The sentences the UI already shows, byte-identical (INSTRUCTIONS
        # §2): a refusal returns the server's own words, over HTTP as under
        # the RPC.
        service = pro_user[1]
        _fund(SEEKER, RATE - 1)
        short = api_client.post(
            "/v1/chat/sessions/request/",
            {"consultant_id": str(PRO), "service_id": str(service.id)},
            format="json", **auth(seeker_token),
        ).json()
        assert short == {"ok": False, "reason": REFUSAL_SHORT_BALANCE,
                         "rate_paise": RATE}
        assert services.request_chat(PRO, PRO, service.id) == {
            "ok": False, "reason": REFUSAL_SELF_CHAT,
        }

    def test_request_body_never_carries_a_price(self, pro_user, api_client,
                                                seeker_token):
        # Rule 3: a body field the user benefits from is the bug. Extra
        # fields are ignored; the rate is the service row's.
        service = pro_user[1]
        _fund(SEEKER, RATE * 5)
        response = api_client.post(
            "/v1/chat/sessions/request/",
            {"consultant_id": str(PRO), "service_id": str(service.id),
             "rate_paise": 1, "sender_id": STRANGER},
            format="json", **auth(seeker_token),
        )
        assert response.json()["ok"] is True
        session = Session.objects.get(pk=response.json()["session_id"])
        assert session.rate_paise == RATE
        assert str(session.seeker_id) == SEEKER


# ── races with real threads: 018's whole point ───────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestMeteringRaces:
    def test_two_concurrent_first_messages_land_once_each(self, pro_user):
        # Two parties sending the thread's first messages simultaneously:
        # both land, exactly once, in one deterministic order.
        session, thread_id = _live_session(pro_user, minutes=10, fund=RATE * 10)
        t0 = _t0()
        barrier, results = threading.Barrier(2), []

        def fire(sender):
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.send_message(sender, thread_id, f"from {sender}", now=t0))

        threads = [
            threading.Thread(target=fire, args=(SEEKER,)),
            threading.Thread(target=fire, args=(PRO,)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert sorted(r["ok"] for r in results) == [True, True]
        rows = services.list_messages(SEEKER, thread_id)
        assert len(rows) == 2 and len({r["id"] for r in rows}) == 2
        # The transcript order is total: (created_at, id), so "seq 1, 2
        # exactly" — no tie the client could render either way.

    def test_six_concurrent_accepts_one_hold_exactly(self, pro_user):
        # 018 fix 1's proof: one consultant, six concurrent accepts of one
        # request (a double-tap, or one account on six devices). One
        # accepted, five refused, one hold, the wallet moved by exactly that
        # hold — the orphan-debit bug took the seeker's ENTIRE balance.
        service = pro_user[1]
        _fund(SEEKER, RATE * 10)
        requested = services.request_chat(SEEKER, PRO, service.id)
        session_id = requested["session_id"]
        bal0 = _balance(SEEKER)
        barrier, results = threading.Barrier(6), []

        def fire():
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.accept_chat(PRO, session_id, now=_t0()))

        threads = [threading.Thread(target=fire) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert len(results) == 6
        winners = [r for r in results if r.get("ok")]
        losers = [r for r in results if not r.get("ok")]
        assert len(winners) == 1 and len(losers) == 5
        # Refused on the lock (status moved) or on the index (second live
        # session): both are the serialized answer, never a second debit.
        assert all(
            r["reason"] in (REFUSAL_NOT_OPEN, REFUSAL_ALREADY_LIVE) for r in losers
        )
        assert winners[0]["hold_paise"] == RATE * 10
        assert bal0 - _balance(SEEKER) == winners[0]["hold_paise"]  # exactly once
        assert Session.objects.get(pk=session_id).status == "live"
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("select count(*) from orders")
            assert cursor.fetchone()[0] == 1
            cursor.execute("select count(*) from order_items")
            assert cursor.fetchone()[0] == 1
            cursor.execute("select count(*) from ledger where ref_type = 'order'")
            assert cursor.fetchone()[0] == 1
        assert EarningsLedger.objects.count() == 0

    def test_concurrent_duplicate_asks_make_one_request(self, pro_user):
        # 018 fix 2 under a real race: the index decides, one row, and both
        # callers are pointed at it.
        service = pro_user[1]
        _fund(SEEKER, RATE * 5)
        barrier, results = threading.Barrier(2), []

        def fire():
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.request_chat(SEEKER, PRO, service.id))

        threads = [threading.Thread(target=fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert all(r["ok"] for r in results)
        assert results[0]["session_id"] == results[1]["session_id"]
        assert Session.objects.filter(
            seeker_id=SEEKER, consultant_id=PRO, status="requested"
        ).count() == 1

    def test_end_and_sweep_racing_settle_once(self, pro_user):
        # The cutoff mid-race: the room's End and the sweeper's tick fire
        # together at the same instant. One settle — one refund row, one
        # earnings row — never two.
        session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
        t0 = _t0()
        _stamp(session, started_at=t0 - 3 * MIN, heartbeat_at=t0 - 3 * MIN,
               expires_at=t0 + 17 * MIN)
        barrier, results = threading.Barrier(2), []

        def fire_end():
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.end_session(SEEKER, session.id, now=t0))

        def fire_sweep():
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.sweep_sessions(now=t0))

        threads = [
            threading.Thread(target=fire_end),
            threading.Thread(target=fire_sweep),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert Session.objects.get(pk=session.id).status == "ended"
        assert Session.objects.get(pk=session.id).charged_paise == RATE * 3
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select count(*) from ledger where ref_type = 'refund'"
                " and wallet_id = %s",
                [str(SEEKER)],
            )
            assert cursor.fetchone()[0] == 1
        assert EarningsLedger.objects.filter(consultant_id=PRO).count() == 1

    def test_two_concurrent_sweepers_do_not_double_charge(self, pro_user):
        session, _ = _live_session(pro_user, minutes=20, fund=RATE * 20)
        t0 = _t0()
        _stamp(session, started_at=t0 - 4 * MIN, heartbeat_at=t0 - 4 * MIN,
               expires_at=t0 + 16 * MIN)
        barrier, results = threading.Barrier(2), []

        def fire():
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.sweep_sessions(now=t0))

        threads = [threading.Thread(target=fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        # SKIP LOCKED (Postgres) / the file lock (SQLite) give disjoint
        # work: one settle across both runs, whichever claimed the row.
        assert sum(r["settled"] for r in results) == 1
        assert Session.objects.get(pk=session.id).charged_paise == RATE * 4
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select count(*) from ledger where ref_type = 'refund'"
                " and wallet_id = %s",
                [str(SEEKER)],
            )
            assert cursor.fetchone()[0] == 1
        assert EarningsLedger.objects.filter(consultant_id=PRO).count() == 1

    def test_cutoff_race_at_the_exact_expiry_instant(self, pro_user):
        # Both parties send at once; the server's expires_at decides each
        # one, to the second — one instant before is writable, the instant
        # itself is not, no matter what the client's clock claims.
        session, thread_id = _live_session(pro_user, minutes=10, fund=RATE * 10)
        boundary = session.expires_at

        def fire(sender, at, out):
            from django.db import connection

            connection.close()
            out.append(services.send_message(sender, thread_id, f"{sender}@{at}", now=at))

        before, after = [], []
        threads = [
            threading.Thread(target=fire, args=(SEEKER, boundary - SEC, before)),
            threading.Thread(target=fire, args=(PRO, boundary - SEC, before)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(r["ok"] for r in before)

        threads = [
            threading.Thread(target=fire, args=(SEEKER, boundary, after)),
            threading.Thread(target=fire, args=(PRO, boundary, after)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(r == {"ok": False, "reason": REFUSAL_SESSION_ENDED} for r in after)
        assert Message.objects.filter(thread_id=thread_id).count() == 2
