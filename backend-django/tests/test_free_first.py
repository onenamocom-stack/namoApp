"""A free first session (7 Oct 2026, owner; reworked 21 Oct 2026, Rahul):
consultants ticked "free first" in the console are free for a new seeker's
first two minutes — on top of the list, marked. The consultant is not paid
for the free minutes; a seeker who adds money during them is a conversion,
and the consultant earns the console's bonus for it. After the seeker's
first session, everyone is paid."""

import pytest
from django.utils import timezone

from apps.chat import services
from apps.chat.models import Session
from apps.consultants import earnings, payouts
from apps.consultants.models import Consultant, EarningsLedger, FreeFirstSettings
from apps.wallet import services as wallet_services
from apps.wallet.models import Payment
from rest_framework.test import APIClient

from .test_chat import (  # noqa: F401 — fixtures by name
    MIN, PRO, RATE, SEEKER, _balance, _fund, _stamp, money_tables, pro_user, seeker_token, auth,
)


def _free(on=True):
    Consultant.objects.filter(profile_id=PRO).update(free_first=on)


def _session(pro_user, now):
    _, service = pro_user
    asked = services.request_chat(SEEKER, PRO, service.id, now=now)
    assert asked["ok"], asked
    accepted = services.accept_chat(PRO, asked["session_id"], now=now)
    assert accepted["ok"], accepted
    return Session.objects.get(pk=asked["session_id"]), asked


def _recharge(amount, order="order_FREE1", pay="pay_FREE1"):
    """A top-up as PhonePe completes it: the 'created' row, then the capture."""
    Payment.objects.create(profile_id=SEEKER, provider=wallet_services.PROVIDER,
                           provider_order_id=order, amount_paise=amount, status="created")
    return wallet_services.payment_capture(None, order, pay, amount, "captured", {})


def _bonus_rows():
    return EarningsLedger.objects.filter(consultant_id=PRO, kind__startswith=earnings.BONUS_KIND)


@pytest.mark.django_db
class TestFreeFirst:
    def test_an_empty_wallet_can_start_it_and_nobody_is_paid_inside_two_minutes(self, pro_user):
        _free()
        t0 = timezone.now()
        session, asked = _session(pro_user, t0)
        assert asked["free_seconds"] == 120 and session.hold_paise == 0
        assert session.expires_at == t0 + 2 * MIN
        ended = services.end_session(SEEKER, session.id, now=t0 + 2 * MIN)
        assert ended["charged_paise"] == 0
        # The free minutes earn the consultant nothing.
        assert not EarningsLedger.objects.filter(consultant_id=PRO).exists()

    def test_past_two_minutes_the_seeker_pays_the_rest_and_the_pro_earns_it(self, pro_user):
        _free()
        _fund(SEEKER, RATE * 10)
        t0 = timezone.now()
        session, _ = _session(pro_user, t0)
        assert session.hold_paise == RATE * 10
        assert session.expires_at == t0 + 12 * MIN
        ended = services.end_session(SEEKER, session.id, now=t0 + 5 * MIN)
        assert ended["charged_paise"] == 3 * RATE            # five minutes, two free
        assert _balance(SEEKER) == RATE * 10 - 3 * RATE
        assert EarningsLedger.objects.get(consultant_id=PRO).gross_paise == 3 * RATE

    def test_the_console_sets_the_free_minutes(self, pro_user):
        _free()
        FreeFirstSettings.objects.create(pk=1, free_seconds=300)
        t0 = timezone.now()
        session, asked = _session(pro_user, t0)
        assert asked["free_seconds"] == 300 and session.expires_at == t0 + 5 * MIN

    def test_only_the_first_session(self, pro_user):
        _free()
        _fund(SEEKER, RATE * 10)
        t0 = timezone.now()
        first, _ = _session(pro_user, t0)
        services.end_session(SEEKER, first.id, now=t0 + MIN)
        assert services.free_first_eligible(SEEKER) is False
        second, asked = _session(pro_user, t0 + 10 * MIN)
        assert asked["free_seconds"] == 0 and second.free_seconds == 0

    def test_a_consultant_not_ticked_is_paid_as_ever(self, pro_user):
        _free(False)
        _, service = pro_user
        refused = services.request_chat(SEEKER, PRO, service.id)
        assert refused["ok"] is False and "balance" in refused["reason"].lower()

    def test_a_call_that_never_connected_does_not_use_it_up(self, pro_user):
        _free()
        t0 = timezone.now()
        session, _ = _session(pro_user, t0)
        _stamp(session, started_at=None, expires_at=None, heartbeat_at=t0)
        services.end_session(SEEKER, session.id, now=t0 + MIN)
        assert services.free_first_eligible(SEEKER) is True

    def test_the_list_marks_and_lifts_them_for_a_new_seeker_only(self, pro_user, seeker_token):
        _free()
        mine = APIClient().get("/v1/consultants/", **auth(seeker_token)).json()
        assert mine[0]["profile_id"] == PRO and mine[0]["free_first_offer"] is True
        assert mine[0]["free_first_seconds"] == 120
        anon = APIClient().get("/v1/consultants/").json()
        assert all(r["free_first_offer"] is False and r["free_first_seconds"] == 0 for r in anon)
        detail = APIClient().get(f"/v1/consultants/{PRO}/", **auth(seeker_token)).json()
        assert detail["free_first_offer"] is True and detail["free_first_seconds"] == 120


@pytest.mark.django_db
class TestConversion:
    def test_money_added_during_the_free_minutes_pays_the_pro_the_bonus_once(self, pro_user):
        _free()
        session, _ = _session(pro_user, timezone.now())
        _recharge(10_000)
        _recharge(20_000, order="order_FREE2", pay="pay_FREE2")
        session.refresh_from_db()
        assert session.converted_at is not None
        row = _bonus_rows().get()
        assert row.net_paise == 5000 and row.fee_paise == 0
        assert _balance(SEEKER) == 30_000

    def test_the_bonus_is_the_consoles_and_counts_in_the_months_payout(self, pro_user):
        _free()
        FreeFirstSettings.objects.create(pk=1, conversion_bonus_paise=7500)
        _session(pro_user, timezone.now())
        _recharge(10_000)
        assert _bonus_rows().get().net_paise == 7500
        s = earnings.summary(PRO, "this_month")
        assert next(x for x in s["by_source"] if x["source"] == "bonus")["net_paise"] == 7500
        assert payouts.lines(PRO, payouts.month_of(timezone.now()))["consulting"] == 7500

    def test_a_recharge_just_after_the_free_session_ended_still_counts(self, pro_user):
        _free()
        t0 = timezone.now() - 5 * MIN
        session, _ = _session(pro_user, t0)
        services.end_session(SEEKER, session.id, now=t0 + 2 * MIN)
        _recharge(10_000)
        assert _bonus_rows().count() == 1

    def test_a_recharge_long_after_or_outside_a_free_session_does_not(self, pro_user):
        _recharge(10_000)                                    # no session at all
        _free()
        t0 = timezone.now() - 60 * MIN
        session, _ = _session(pro_user, t0)
        services.end_session(SEEKER, session.id, now=t0 + 2 * MIN)
        _recharge(10_000, order="order_FREE2", pay="pay_FREE2")
        assert not _bonus_rows().exists()

    def test_a_paid_session_is_never_a_conversion(self, pro_user):
        _free(False)
        _fund(SEEKER, RATE * 10)
        _session(pro_user, timezone.now())
        _recharge(10_000)
        assert not _bonus_rows().exists()
