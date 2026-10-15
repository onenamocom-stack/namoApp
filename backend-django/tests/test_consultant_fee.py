"""Namo's share of a consultation is the console's consultation rate, 30%
when blank, the same for every astrologer (15 Oct 2026, Rahul; owner's yes).
The per-astrologer share built on 13 Oct is withdrawn: a value left in
`consultants.fee_bps` changes nothing, and the console has no field for it."""

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.chat import services
from apps.console.models import Tier
from apps.consultants.models import Consultant, EarningsLedger
from apps.market.models import CommissionRate

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
class TestOneRate:
    def test_blank_is_thirty_percent(self, pro_user):
        assert _talk(pro_user).fee_bps == 3000

    def test_the_console_rate_is_used_for_everybody(self, pro_user):
        CommissionRate.objects.update_or_create(category="consultation", defaults={"bps": 2500})
        assert _talk(pro_user).fee_bps == 2500

    def test_a_value_left_on_the_astrologer_changes_nothing(self, pro_user):
        Consultant.objects.filter(profile_id=PRO).update(fee_bps=5000)
        assert _talk(pro_user).fee_bps == 3000

    def test_the_astrologer_page_has_no_share_field(self, pro_user):
        from .test_shop_console import _admin

        client, _ = _admin(Tier.SUPERADMIN)
        page = client.get(reverse("namo:consultants_consultant_change", args=[PRO]))
        assert page.status_code == 200
        assert b"namo_share" not in page.content and b"Namo&#x27;s share" not in page.content
