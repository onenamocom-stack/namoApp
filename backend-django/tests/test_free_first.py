"""A free first session (7 Oct 2026, owner): consultants ticked "free first"
in the console are free for a new seeker's first three minutes — on top of
the list, marked — and Namo pays the consultant for them. After the seeker's
first session, everyone is paid."""

import pytest
from django.utils import timezone

from apps.chat import services
from apps.chat.models import Session
from apps.consultants.models import Consultant, EarningsLedger
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


@pytest.mark.django_db
class TestFreeFirst:
    def test_an_empty_wallet_can_start_it_and_pays_nothing_inside_three_minutes(self, pro_user):
        _free()
        t0 = timezone.now()
        session, asked = _session(pro_user, t0)
        assert asked["free_seconds"] == 180 and session.hold_paise == 0
        assert session.expires_at == t0 + 3 * MIN
        ended = services.end_session(SEEKER, session.id, now=t0 + 2 * MIN)
        assert ended["charged_paise"] == 0
        # The consultant is paid for the two minutes, by Namo.
        row = EarningsLedger.objects.get(consultant_id=PRO)
        assert row.gross_paise == 2 * RATE and row.net_paise == row.gross_paise - row.fee_paise

    def test_past_three_minutes_the_seeker_pays_only_the_rest(self, pro_user):
        _free()
        _fund(SEEKER, RATE * 10)
        t0 = timezone.now()
        session, _ = _session(pro_user, t0)
        assert session.hold_paise == RATE * 10
        assert session.expires_at == t0 + 13 * MIN
        ended = services.end_session(SEEKER, session.id, now=t0 + 5 * MIN)
        assert ended["charged_paise"] == 2 * RATE            # five minutes, three free
        assert _balance(SEEKER) == RATE * 10 - 2 * RATE
        assert EarningsLedger.objects.get(consultant_id=PRO).gross_paise == 5 * RATE

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
        anon = APIClient().get("/v1/consultants/").json()
        assert all(r["free_first_offer"] is False for r in anon)
        detail = APIClient().get(f"/v1/consultants/{PRO}/", **auth(seeker_token)).json()
        assert detail["free_first_offer"] is True
