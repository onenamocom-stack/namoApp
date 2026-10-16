"""One payment on the 7th, every book together (16 Oct 2026, owner's yes).

  the lines     -> consulting less commission, the Market's own payout row,
                   qualified views at their own rate, commission (a Pro's
                   ledger rows; anybody else's creator_earnings)
  the run       -> nothing before the 7th; once per person per month; nobody
                   with nothing
  paying        -> needs the reference; marks the Market row paid too; one
                   message to the person; a paid statement stays paid
"""

from datetime import date, datetime, timedelta

import pytest
from django.utils import timezone

from apps.consultants import payouts
from apps.consultants.models import EarningsLedger, PayoutStatement
from apps.content.models import Content, QualifiedView
from apps.market.models import SellerPayout
from apps.notifications.models import Notification
from apps.referrals.models import CreatorEarning

from .test_content import APPROVED, SECOND_SEEKER, SEEKER, content_tables, roster  # noqa: F401

SEPT = date(2026, 9, 1)
SEVENTH = date(2026, 10, 7)


def at(day, hour=12):
    return timezone.make_aware(datetime(2026, 9, day, hour))


def _ledger(pid, net, kind, day):
    return EarningsLedger.objects.create(consultant_id=pid, gross_paise=net, fee_bps=0, fee_paise=0, net_paise=net,
                                         kind=kind, created_at=at(day))


def _views(author, n, rate=2000, day=10):
    post = Content.objects.create(author_id=author, kind="post", caption="x", status="live", published_at=at(1))
    QualifiedView.objects.bulk_create([
        QualifiedView(content=post, author_id=author, viewer_id=f"00000000-0000-4000-8000-{i:012d}",
                      reason="like", paise_per_thousand=rate, created_at=at(day), day=date(2026, 9, day))
        for i in range(n)])


@pytest.mark.django_db
class TestLines:
    def test_a_pro_with_everything(self, roster):
        _ledger(APPROVED, 41000, "Anita · 20 min chat", 5)
        _ledger(APPROVED, 600, "Referral · Market · A book", 6)
        _ledger(APPROVED, 900, "Referral cashback · order 1a", 7)
        _ledger(APPROVED, 99999, "Anita · 9 min chat", 3) and EarningsLedger.objects.filter(net_paise=99999).update(
            created_at=at(3) - timedelta(days=10))  # August: not this statement
        SellerPayout.objects.create(seller_id=APPROVED, month=SEPT, amount_paise=12000)
        _views(APPROVED, 1500)
        assert payouts.lines(APPROVED, SEPT) == {"consulting": 41000, "market": 12000, "content": 3000,
                                                 "commission": 1500}

    def test_a_creator_who_is_not_a_pro(self, roster):
        CreatorEarning.objects.create(profile_id=SEEKER, cashback=None, amount_paise=700, kind="Referral · x",
                                      created_at=at(9))
        _views(SEEKER, 500, rate=4000)
        assert payouts.lines(SEEKER, SEPT) == {"consulting": 0, "market": 0, "content": 2000, "commission": 700}


@pytest.mark.django_db
class TestTheRun:
    def test_not_before_the_seventh_and_once(self, roster):
        _ledger(APPROVED, 41000, "Anita · 20 min chat", 5)
        _views(SEEKER, 1000)
        assert payouts.build(SEPT, today=date(2026, 10, 6)) == []
        made = payouts.build(SEPT, today=SEVENTH)
        assert {str(s.profile_id) for s in made} == {APPROVED, SEEKER}
        mine = PayoutStatement.objects.get(profile_id=APPROVED)
        assert mine.total_paise == 41000 and mine.month == SEPT
        assert payouts.build(SEPT, today=date(2026, 10, 8)) == []      # once
        assert not PayoutStatement.objects.filter(profile_id=SECOND_SEEKER).exists()  # nothing earned


@pytest.mark.django_db
class TestPaying:
    def test_reference_market_row_and_one_message(self, roster):
        SellerPayout.objects.create(seller_id=APPROVED, month=SEPT, amount_paise=12000)
        [s] = payouts.build(SEPT, today=SEVENTH)
        with pytest.raises(ValueError):
            payouts.mark_paid(s, "  ", "finance@namo")
        PayoutStatement.objects.filter(pk=s.pk).update(tds_paise=1200)
        s.refresh_from_db()
        payouts.mark_paid(s, "UTR123", "finance@namo")
        s.refresh_from_db()
        assert s.status == "paid" and s.reference == "UTR123"
        assert SellerPayout.objects.get(seller_id=APPROVED).status == "paid"
        [note] = Notification.objects.filter(profile_id=APPROVED)
        assert note.kind == "payout.paid" and "₹108.00" in note.body
        payouts.mark_paid(s, "UTR999", "finance@namo")             # paid stays paid
        s.refresh_from_db()
        assert s.reference == "UTR123"
