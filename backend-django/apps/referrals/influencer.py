"""An influencer's numbers (3 Oct 2026, owner's request).

An influencer is a profile with `influencer = true`, granted in the console.
Their code is their ordinary seeker invite code (N…); the link that carries
it is `/#/onboarding?ref=N…`, which pre-fills it at sign-up.

Two numbers, by the owner's call — views are left for later:

- **Signups:** people who claimed the code (`referrals`, kind `signup`). The
  claim is refused for self-referral and allowed once per person, and every
  signup took a real phone number and an OTP.
- **Buyers:** of those, the people who have paid real money — a captured
  wallet top-up (`payments`). Spending free referral credit does not count,
  because it is not a purchase anybody made.

A period counts a signup on the day it was claimed and a buyer on the day
of their first captured payment, in IST, so "this month" means the same
thing here as on a consultant's Earnings tab. What each is worth, and the
payout, are decided in the console later; nothing here moves money.

No names or phone numbers of the people brought in are ever returned — an
influencer sees dates and whether each one bought, nothing that identifies
a person.
"""

from django.conf import settings
from django.db.models import Min
from django.utils import timezone

from apps.consultants.earnings import ist_today, period
from apps.consultants.services import IST
from apps.wallet.models import Payment

from .models import CodeKind, Referral, ReferralKind
from .services import code_for

RECENT = 30


def _in(when, lo, hi):
    if when is None:
        return False
    day = when.astimezone(IST).date()
    return (lo is None or day >= lo) and (hi is None or day < hi)


def link_for(code):
    return f"{settings.APP_PUBLIC_URL.rstrip('/')}/#/onboarding?ref={code}"


def stats(profile_id, now=None):
    now = now or timezone.now()
    today = ist_today(now)
    code = code_for(profile_id, CodeKind.SEEKER).code

    joined = list(
        Referral.objects.filter(referrer_id=profile_id, kind=ReferralKind.SIGNUP)
        .order_by("-created_at")
        .values_list("referee_id", "created_at")
    )
    first_paid = dict(
        Payment.objects.filter(
            profile_id__in=[r for r, _ in joined], status=Payment.Status.CAPTURED
        )
        .values("profile_id")
        .annotate(first=Min("created_at"))
        .values_list("profile_id", "first")
    )

    periods = {}
    for key in ("this_month", "last_month", "lifetime"):
        lo, hi = period(key, today)
        periods[key] = {
            "signups": sum(1 for _, at in joined if _in(at, lo, hi)),
            "buyers": sum(1 for r, _ in joined if _in(first_paid.get(r), lo, hi)),
        }

    return {
        "code": code,
        "link": link_for(code),
        "periods": periods,
        "recent": [
            {
                "joined_on": at.astimezone(IST).date().isoformat(),
                "bought_on": (
                    first_paid[r].astimezone(IST).date().isoformat() if r in first_paid else None
                ),
            }
            for r, at in joined[:RECENT]
        ],
    }


def totals_for(profile_ids, now=None):
    """Lifetime and this-month counts for many influencers at once — the
    console's list. `{profile_id: {signups, buyers, month_signups, month_buyers}}`."""
    now = now or timezone.now()
    lo, hi = period("this_month", ist_today(now))
    joined = list(
        Referral.objects.filter(referrer_id__in=profile_ids, kind=ReferralKind.SIGNUP)
        .values_list("referrer_id", "referee_id", "created_at")
    )
    first_paid = dict(
        Payment.objects.filter(
            profile_id__in=[e for _, e, _ in joined], status=Payment.Status.CAPTURED
        )
        .values("profile_id")
        .annotate(first=Min("created_at"))
        .values_list("profile_id", "first")
    )
    out = {pid: {"signups": 0, "buyers": 0, "month_signups": 0, "month_buyers": 0} for pid in profile_ids}
    for referrer, referee, at in joined:
        row = out.setdefault(referrer, {"signups": 0, "buyers": 0, "month_signups": 0, "month_buyers": 0})
        row["signups"] += 1
        row["month_signups"] += _in(at, lo, hi)
        paid = first_paid.get(referee)
        row["buyers"] += paid is not None
        row["month_buyers"] += _in(paid, lo, hi)
    return out
