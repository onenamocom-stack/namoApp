"""Namo's share per astrologer (13 Oct 2026, owner): FEE_BPS (40%) is the
default in code; the console sets an astrologer's own share, and sessions
settle at it from then on. Rows already written keep their own fee_bps."""

import pytest
from django.utils import timezone

from apps.chat import services
from apps.consultants import services as consultant_services
from apps.consultants.models import FEE_BPS, Consultant, EarningsLedger

from .test_chat import MIN, PRO, RATE, SEEKER, _fund, money_tables, pro_user  # noqa: F401


def _talk(pro_user, minutes=2):
    _, service = pro_user
    _fund(SEEKER, RATE * 10)
    t0 = timezone.now()
    asked = services.request_chat(SEEKER, PRO, service.id, now=t0)
    services.accept_chat(PRO, asked["session_id"], now=t0)
    services.end_session(SEEKER, asked["session_id"], now=t0 + minutes * MIN)
    return EarningsLedger.objects.filter(consultant_id=PRO).order_by("-created_at").first()


@pytest.mark.django_db
class TestTheShare:
    def test_the_default_is_the_code_s(self, pro_user):
        row = _talk(pro_user)
        assert row.fee_bps == FEE_BPS == 4000
        assert row.fee_paise == 2 * RATE * 40 // 100 and row.net_paise == 2 * RATE - row.fee_paise

    def test_an_astrologer_s_own_share_is_used(self, pro_user):
        Consultant.objects.filter(profile_id=PRO).update(fee_bps=5000)
        row = _talk(pro_user)
        assert row.fee_bps == 5000 and row.fee_paise == RATE and row.net_paise == RATE

    def test_a_change_leaves_rows_already_written(self, pro_user):
        first = _talk(pro_user)
        Consultant.objects.filter(profile_id=PRO).update(fee_bps=6000)
        first.refresh_from_db()
        assert first.fee_bps == 4000
        assert consultant_services.fee_bps_for(PRO) == 6000

    def test_blank_goes_back_to_the_default(self, pro_user):
        Consultant.objects.filter(profile_id=PRO).update(fee_bps=None)
        assert consultant_services.fee_bps_for(PRO) == FEE_BPS


@pytest.mark.django_db
class TestTheConsole:
    def _page(self, tier):
        from django.urls import reverse

        from apps.console.models import Tier

        from .test_shop_console import _admin

        client, _ = _admin(getattr(Tier, tier))
        return client, reverse("namo:consultants_consultant_change", args=[PRO])

    def test_finance_sets_it_as_a_percent(self, pro_user):
        client, url = self._page("FINANCE")
        page = client.get(url)
        assert page.status_code == 200 and b"Namo&#x27;s share %" in page.content
        form = page.context["adminform"].form
        data = {k: v for k, v in form.initial.items() if v is not None and not isinstance(v, (list, dict))}
        data.update({"namo_share": "50", "status": "approved", "category": "Astrologer"})
        client.post(url, data)
        assert Consultant.objects.get(profile_id=PRO).fee_bps == 5000

    def test_support_only_sees_it(self, pro_user):
        client, url = self._page("SUPPORT")
        page = client.get(url)
        assert page.status_code == 200
        assert b'name="namo_share"' not in page.content and b"40 : 60" in page.content
