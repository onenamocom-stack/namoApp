"""Who brought whom, and what it earned them.

TWO PROGRAMMES, AND THEY ARE NOT THE SAME SHAPE. Keeping them in one
table would mean a row where half the columns are always null.

  consultant -> seeker   A COUPON, used at SHOP CHECKOUT. Both sides get
                         10% back. The buyer must never have bought
                         before.
  seeker -> seeker       A CODE, used at SIGN-UP. Both sides get extra
                         free AI questions for three days. No money.
  consultant -> consultant  Nothing. Deliberately.

THE CASHBACK IS NOT A DISCOUNT, and that is the whole commercial point.
The order is paid in full at the listed price; the 10% arrives afterwards
as wallet credit the buyer can spend on a consultation or another order.
Revenue is recognised, the money stays inside the product, and a discount
would have done neither.
"""

import secrets
import uuid

from django.db import models
from django.utils import timezone

# No 0/O/1/I/L. These codes get read aloud on calls, typed off a
# screenshot, and written on paper — every pair this drops is a pair
# somebody would eventually mistype into a stranger's code.
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
BODY_LENGTH = 7


class CodeKind(models.TextChoices):
    """The prefix says which app issued it, at a glance and in a support
    ticket. One character, and the rest is random."""

    SEEKER = "seeker", "Seeker — N"
    CONSULTANT = "consultant", "Consultant — A"


PREFIX = {CodeKind.SEEKER: "N", CodeKind.CONSULTANT: "A"}


def mint(kind):
    """Eight characters: one prefix, seven random. 31^7 is about 27
    billion, so collisions are a formality the unique index handles rather
    than something the generator has to reason about."""
    body = "".join(secrets.choice(ALPHABET) for _ in range(BODY_LENGTH))
    return f"{PREFIX[kind]}{body}"


class ReferralCode(models.Model):
    """One code per person per programme.

    A person can hold BOTH — a seeker who later gets approved as a
    consultant keeps their N code and gains an A code, because the two
    codes buy different things and the seeker one may already be written
    on somebody's notes. Re-prefixing the old one would silently break
    every link already shared.

    Codes are never deleted. `active` turns one off; the row stays so an
    old link resolves to "this code is no longer valid" instead of "no
    such code", which are different answers to the person holding it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    kind = models.CharField(max_length=16, choices=CodeKind.choices)
    code = models.CharField(max_length=16, unique=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    Kind = CodeKind

    class Meta:
        db_table = "referral_codes"
        constraints = [
            models.UniqueConstraint(
                fields=["profile_id", "kind"], name="referral_codes_one_per_kind"
            ),
            models.CheckConstraint(
                condition=models.Q(kind__in=CodeKind.values),
                name="referral_codes_kind_check",
            ),
        ]

    def __str__(self):
        return self.code


class ReferralKind(models.TextChoices):
    SIGNUP = "signup", "Seeker brought a seeker"
    PURCHASE = "purchase", "Consultant's code used on a first order"


class Referral(models.Model):
    """The attribution row: this person came from that person.

    ONE PER REFEREE PER PROGRAMME. A seeker is brought into the product
    once, and buys their first thing once. The unique index is what makes
    the console's "did anybody claim this twice" question answerable
    without a scan — and what stops the obvious abuse, which is one
    account collecting the new-user perk from six friends' codes.

    `referrer_id` is denormalised from the code rather than joined
    through it, because a code can be deactivated or reissued and the
    history of who was credited must not move when it is.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=16, choices=ReferralKind.choices)
    referrer_id = models.UUIDField()
    referee_id = models.UUIDField()
    code = models.CharField(max_length=16)
    # What the order was, for a purchase referral. Null for a signup.
    order = models.ForeignKey(
        "shop.Order", null=True, blank=True, on_delete=models.SET_NULL,
        db_column="order_id", related_name="referrals",
    )
    created_at = models.DateTimeField(default=timezone.now)

    Kind = ReferralKind

    class Meta:
        db_table = "referrals"
        constraints = [
            models.UniqueConstraint(
                fields=["referee_id", "kind"], name="referrals_one_per_referee_kind"
            ),
            # Nobody refers themselves. Cheap to try, and without this the
            # whole programme is a free perk with extra steps.
            models.CheckConstraint(
                condition=~models.Q(referrer_id=models.F("referee_id")),
                name="referrals_not_self_check",
            ),
            models.CheckConstraint(
                condition=models.Q(kind__in=ReferralKind.values),
                name="referrals_kind_check",
            ),
        ]
        indexes = [
            models.Index(fields=["referrer_id", "-created_at"],
                         name="referrals_referrer_idx"),
        ]


class CashbackStatus(models.TextChoices):
    PENDING = "pending", "Pending — waiting out the return window"
    PAID = "paid", "Paid"
    CANCELLED = "cancelled", "Cancelled — the order came back"


class Cashback(models.Model):
    """10% owed, and not yet given.

    PENDING UNTIL SEVEN DAYS AFTER DELIVERY. Credited on purchase, a
    buyer could take the cashback, spend it on a consultation, and return
    the item — and there is no way to claw back money that has already
    been paid to a consultant. The wait is what makes the programme safe
    to run at all, so `matures_at` is set from the DELIVERY date and not
    from the order's.

    Two rows per referred order, one for each side. Separate rows rather
    than one with two amounts, because they are paid into different books:
    the buyer's lands in the wallet (spendable, not withdrawable — the
    wallet has no withdraw path for seekers), the consultant's lands in
    the earnings ledger they already draw from at month end.
    """

    class Side(models.TextChoices):
        BUYER = "buyer", "The buyer"
        REFERRER = "referrer", "The consultant whose code it was"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    referral = models.ForeignKey(
        Referral, on_delete=models.CASCADE, related_name="cashbacks"
    )
    profile_id = models.UUIDField()          # who is owed
    side = models.CharField(max_length=16, choices=Side.choices)
    amount_paise = models.IntegerField()
    status = models.CharField(
        max_length=16, choices=CashbackStatus.choices, default=CashbackStatus.PENDING
    )
    # Null until the order is delivered — pending with no maturity date is
    # exactly right for something that has not shipped.
    matures_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Status = CashbackStatus

    class Meta:
        db_table = "referral_cashback"
        constraints = [
            models.UniqueConstraint(
                fields=["referral", "side"], name="cashback_one_per_side"
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paise__gt=0), name="cashback_amount_positive"
            ),
        ]
        indexes = [
            # The maturation sweep's only read.
            models.Index(
                fields=["matures_at"],
                name="cashback_due_idx",
                condition=models.Q(status="pending"),
            ),
            models.Index(fields=["profile_id", "-created_at"], name="cashback_owner_idx"),
        ]
