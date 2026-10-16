"""One payment on the 7th, every book together (16 Oct 2026, owner's yes).

`build(month)` makes a `PayoutStatement` for every person who earned in
that IST month — consulting, Market, content and commission — once: a
statement already made is never remade, so a run on the 8th, the 9th or
twice in a day changes nothing. `mark_paid` records the bank's reference,
marks the Market's own payout row paid with it, and tells the person.

What it does not do: move money (Finance pays from the bank), or work out
TDS (Finance enters it; the CA has not set the rate, docs/01 §8).
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from .models import EarningsLedger, PayoutStatement

PAYOUT_DAY = 7


def last_month(today=None):
    from .earnings import ist_today

    today = today or ist_today()
    return (today.replace(day=1) - timedelta(days=1)).replace(day=1)


def month_of(when):
    """The IST month (its first day) a moment belongs to."""
    from .services import IST

    return when.astimezone(IST).date().replace(day=1)


def _next_month(first):
    return (first + timedelta(days=32)).replace(day=1)


def lines(profile_id, month):
    """{consulting, market, content, commission} for one person, in paise."""
    from apps.content.models import QualifiedView
    from apps.market.models import SellerPayout
    from apps.referrals.models import CreatorEarning, SignupBonus

    from . import earnings

    after = _next_month(month)
    lo, hi = earnings._midnight(month), earnings._midnight(after)
    out = {"consulting": 0, "market": 0, "content": 0, "commission": 0}

    if EarningsLedger.objects.filter(consultant_id=profile_id).exists():
        s = earnings.summary(profile_id, "custom", month.isoformat(), (after - timedelta(days=1)).isoformat(),
                             now=lo + timedelta(days=62))
        shop = next((x["net_paise"] for x in s["by_source"] if x["source"] == "shop"), 0)
        out["consulting"] = s["net_paise"] - shop
        out["commission"] = shop
    else:
        out["commission"] = (CreatorEarning.objects.filter(profile_id=profile_id, created_at__gte=lo,
                                                           created_at__lt=hi)
                             .aggregate(n=Sum("amount_paise"))["n"] or 0)
    payout = SellerPayout.objects.filter(seller_id=profile_id, month=month).first()
    out["market"] = payout.amount_paise if payout else 0
    out["content"] = (QualifiedView.objects.filter(author_id=profile_id, created_at__gte=lo, created_at__lt=hi)
                      .aggregate(r=Sum("paise_per_thousand"))["r"] or 0) // 1000
    # Sign-ups with their code: the Commission line (16 Oct 2026, Rahul:
    # "Commission line me jod ke"), which the content earnings page counts.
    out["commission"] += (SignupBonus.objects.filter(referrer_id=profile_id, status=SignupBonus.Status.EARNED,
                                                  created_at__gte=lo, created_at__lt=hi)
                       .aggregate(n=Sum("amount_paise"))["n"] or 0)
    return out


def earners(month):
    """Everybody with anything in any book that month."""
    from apps.content.models import QualifiedView
    from apps.market.models import SellerPayout
    from apps.referrals.models import CreatorEarning, SignupBonus

    from . import earnings

    lo, hi = earnings._midnight(month), earnings._midnight(_next_month(month))
    people = set()
    people |= {str(p) for p in EarningsLedger.objects.filter(created_at__gte=lo - timedelta(days=62),
                                                               created_at__lt=hi)
               .values_list("consultant_id", flat=True).distinct()}
    people |= {str(p) for p in CreatorEarning.objects.filter(created_at__gte=lo, created_at__lt=hi)
               .values_list("profile_id", flat=True).distinct()}
    people |= {str(p) for p in SellerPayout.objects.filter(month=month).values_list("seller_id", flat=True)}
    people |= {str(p) for p in QualifiedView.objects.filter(created_at__gte=lo, created_at__lt=hi)
               .values_list("author_id", flat=True).distinct()}
    people |= {str(p) for p in SignupBonus.objects.filter(status=SignupBonus.Status.EARNED, created_at__gte=lo,
                                                           created_at__lt=hi)
               .values_list("referrer_id", flat=True).distinct()}
    return people


def build(month=None, today=None):
    """Make the month's statements. Refused before the 7th of the month
    after: the month's bookings and returns are still settling."""
    from apps.market import services as market

    from .earnings import ist_today

    today = today or ist_today()
    month = month or last_month(today)
    if today < _next_month(month).replace(day=PAYOUT_DAY):
        return []
    market.run_payouts(today=today)  # the Market's own rows first, so its part is final
    made = []
    for pid in earners(month):
        if PayoutStatement.objects.filter(profile_id=pid, month=month).exists():
            continue
        parts = lines(pid, month)
        total = sum(parts.values())
        if total <= 0:
            continue
        try:
            with transaction.atomic():
                made.append(PayoutStatement.objects.create(
                    profile_id=pid, month=month, consulting_paise=parts["consulting"],
                    market_paise=parts["market"], content_paise=parts["content"],
                    commission_paise=parts["commission"], total_paise=total))
        except IntegrityError:
            continue  # another run made it a moment ago
    return made


def mark_paid(statement, reference, who):
    from apps.market import services as market
    from apps.market.models import SellerPayout
    from apps.notifications import services as notify

    if statement.status == PayoutStatement.Status.PAID:
        return statement
    reference = (reference or "").strip()
    if not reference:
        raise ValueError("Type the bank's reference (UTR) before marking it paid.")
    with transaction.atomic():
        statement.status = PayoutStatement.Status.PAID
        statement.reference = reference
        statement.paid_at = timezone.now()
        statement.paid_by = who or ""
        statement.save(update_fields=["status", "reference", "paid_at", "paid_by"])
        payout = SellerPayout.objects.filter(seller_id=statement.profile_id, month=statement.month).first()
        if payout and statement.market_paise:
            market.mark_paid(payout, reference, who, quiet=True)  # one message, below
    notify.push(statement.profile_id, kind="payout.paid", title="You have been paid",
                body=f"₹{statement.to_pay_paise / 100:,.2f} for {statement.month:%B %Y} · {reference}",
                ref_type="payout", ref_id=str(statement.id), dedupe_key=f"payout.paid:{statement.id}")
    return statement


def month_options(today=None):
    """The months a statement can be for: the last twelve, newest first."""
    first = last_month(today)
    out = []
    for _ in range(12):
        out.append(first)
        first = (first - timedelta(days=1)).replace(day=1)
    return out

