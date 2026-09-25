"""The referral programme: codes, perks, cashback, and what is refused.

THE RULE EVERY TEST HERE CIRCLES: the cashback is not a discount. The
order is paid at the listed price and the 10% arrives afterwards, into a
wallet that can be spent inside the product and not withdrawn from it.
That is what makes the programme affordable, and a test that ever sees
`total_paise` come down on a referral code is a test that has caught the
whole thing going wrong.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.ai import services as ai_services
from apps.ai.models import Quota
from apps.consultants.models import Consultant
from apps.notifications.models import Notification
from apps.profiles.models import Profile
from apps.referrals import services
from apps.referrals.models import Cashback, Referral, ReferralCode
from apps.shop.models import Order, OrderItem, Product, Shipment, ShopCategory
from apps.shop import services as shop_services
from apps.wallet import services as wallet_services

from .conftest import OTHER_USER, TEST_USER

BUYER = TEST_USER
PRO = OTHER_USER
FRIEND = "cccccccc-1111-2222-3333-444444444444"

# Dummy money, as asked. ₹1,000 product, ₹100 cashback a side.
PRICE = 100_000
TENTH = 10_000


@pytest.fixture
def people():
    Profile.objects.all().delete()
    Consultant.objects.all().delete()
    for pid, name in ((BUYER, "A Buyer"), (PRO, "An Astrologer"), (FRIEND, "A Friend")):
        Profile.objects.create(id=pid, phone=str(pid), name=name)
    Consultant.objects.create(profile_id=PRO, category="Astrologer", status="approved")
    yield


@pytest.fixture
def product():
    cat = ShopCategory.objects.create(name="Gemstones", sort=1)
    return Product.objects.create(
        category=cat, name="Rudraksha mala", price_paise=PRICE,
        stock=10, active=True, tax_rate_bps=0, weight_grams=50,
    )


def _fund(profile_id, paise):
    wallet_services.ensure_wallet(profile_id)
    wallet_services.credit(profile_id, paise, "test top-up", ref_type="adjustment")


def _code(profile_id, kind):
    return services.code_for(profile_id, kind).code


# ── codes ───────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestCodes:
    def test_a_seeker_code_starts_with_N_and_a_consultant_code_with_A(self, people):
        assert _code(BUYER, ReferralCode.Kind.SEEKER).startswith("N")
        assert _code(PRO, ReferralCode.Kind.CONSULTANT).startswith("A")

    def test_codes_are_eight_characters_and_avoid_confusable_letters(self, people):
        code = _code(BUYER, ReferralCode.Kind.SEEKER)
        assert len(code) == 8
        # These get read aloud and typed off screenshots. Every pair
        # dropped is a pair somebody would mistype into a stranger's code.
        assert not set(code) & set("01OIL")

    def test_the_same_person_gets_the_same_code_twice(self, people):
        assert _code(BUYER, ReferralCode.Kind.SEEKER) == _code(
            BUYER, ReferralCode.Kind.SEEKER
        )

    def test_a_consultant_holds_both_codes(self, people):
        """They keep the seeker code they may already have shared, and gain
        the A code. Re-prefixing the old one would break every link
        already written down."""
        seeker = _code(PRO, ReferralCode.Kind.SEEKER)
        consultant = _code(PRO, ReferralCode.Kind.CONSULTANT)
        assert seeker != consultant
        assert ReferralCode.objects.filter(profile_id=PRO).count() == 2

    def test_a_typed_code_is_forgiven_its_case_and_spacing(self, people):
        code = _code(PRO, ReferralCode.Kind.CONSULTANT)
        for typed in (code.lower(), f" {code} ", f"{code[:4]}-{code[4:]}"):
            assert services.resolve(typed).code == code


# ── seeker brings a seeker ──────────────────────────────────────────────────


@pytest.mark.django_db
class TestSignupReferral:
    def test_both_sides_get_three_a_day_for_three_days(self, people):
        result = services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        assert result["ok"]
        for who in (FRIEND, BUYER):
            row = Quota.objects.get(profile_id=who)
            assert row.bonus_daily == 3
            assert row.bonus_until == (timezone.now() + timedelta(days=3)).date()

    def test_the_welcome_five_are_untouched(self, people):
        """Day one is five for everybody, referred or not. The perk is
        about the days AFTER."""
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        assert ai_services.quota_state(FRIEND)["free_left"] == 5

    def test_the_boost_expires_and_the_allowance_returns_to_one(self, people):
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        row = Quota.objects.get(profile_id=FRIEND)
        row.welcome_used = 5
        row.bonus_until = (timezone.now() - timedelta(days=1)).date()
        row.save()
        assert ai_services.quota_state(FRIEND)["daily_allowance"] == 1
        assert ai_services.quota_state(FRIEND)["boosted"] is False

    def test_nobody_refers_themselves(self, people):
        result = services.claim_signup(BUYER, _code(BUYER, ReferralCode.Kind.SEEKER))
        assert result == {"ok": False, "reason": services.REFUSAL_SELF}

    def test_one_referral_per_account_ever(self, people):
        """The abuse this stops is one account collecting the new-seeker
        perk from six friends' codes."""
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        again = services.claim_signup(FRIEND, _code(PRO, ReferralCode.Kind.SEEKER))
        assert again == {"ok": False, "reason": services.REFUSAL_ALREADY_REFERRED}
        assert Referral.objects.filter(referee_id=FRIEND).count() == 1

    def test_a_shop_coupon_at_signup_is_told_where_it_belongs(self, people):
        """The holder of an A code has not done anything wrong — they used
        the right code in the wrong place, and the fix is one sentence."""
        result = services.claim_signup(
            FRIEND, _code(PRO, ReferralCode.Kind.CONSULTANT)
        )
        assert result["reason"] == services.REFUSAL_WRONG_KIND_AT_SIGNUP

    def test_the_referrer_is_told(self, people):
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        note = Notification.objects.get(profile_id=BUYER)
        assert note.kind == "referral.signup"
        assert "3 free questions a day" in note.body

    def test_a_signup_referral_pays_no_money_at_all(self, people):
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        assert Cashback.objects.count() == 0


# ── consultant's code on a first order ──────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestPurchaseReferral:
    def test_the_order_is_paid_in_full_and_the_cashback_is_owed_not_given(
        self, people, product
    ):
        """The load-bearing test. A discount would have taken the total
        down; this must not."""
        _fund(BUYER, PRICE)
        code = _code(PRO, ReferralCode.Kind.CONSULTANT)

        result = shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}], coupon_code=code)
        assert result["ok"]
        assert result["discount_paise"] == 0
        assert result["total_paise"] == PRICE, "the referral discounted the order"
        assert result["cashback_paise"] == TENTH
        assert wallet_services.balance_of(BUYER) == 0, "they paid full price"

        # Owed, both sides, and nothing paid yet.
        rows = Cashback.objects.all()
        assert rows.count() == 2
        assert {r.side for r in rows} == {"buyer", "referrer"}
        assert all(r.status == Cashback.Status.PENDING for r in rows)
        assert all(r.matures_at is None for r in rows), "the clock starts at delivery"

    def test_a_second_order_with_a_code_is_refused(self, people, product):
        _fund(BUYER, PRICE * 3)
        code = _code(PRO, ReferralCode.Kind.CONSULTANT)
        shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}], coupon_code=code)

        second = shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}], coupon_code=code)
        assert second["reason"] == services.REFUSAL_NOT_FIRST_ORDER

    def test_somebody_who_has_already_shopped_cannot_start_using_one(
        self, people, product
    ):
        _fund(BUYER, PRICE * 3)
        shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}])   # a plain first order
        result = shop_services.buy(
            BUYER, [{"product_id": str(product.id), "qty": 1}],
            coupon_code=_code(PRO, ReferralCode.Kind.CONSULTANT),
        )
        assert result["reason"] == services.REFUSAL_NOT_FIRST_ORDER

    def test_consultant_to_consultant_pays_nobody(self, people, product):
        """The owner's point 3, and refused rather than silently worth
        zero — a consultant told "you got 10%" who receives nothing has
        been lied to."""
        other = Profile.objects.create(
            id="dddddddd-1111-2222-3333-444444444444", phone="d", name="Another pro"
        )
        Consultant.objects.create(
            profile_id=other.id, category="Astrologer", status="approved"
        )
        _fund(other.id, PRICE)
        result = shop_services.buy(
            other.id, [{"product_id": str(product.id), "qty": 1}],
            coupon_code=_code(PRO, ReferralCode.Kind.CONSULTANT),
        )
        assert result["reason"] == services.REFUSAL_CONSULTANT_TO_CONSULTANT
        assert Cashback.objects.count() == 0

    def test_a_refused_code_leaves_the_shelf_alone(self, people, product):
        """atomic() commits on a plain return and rolls back on an
        exception — the bug this codebase has already been bitten by."""
        _fund(BUYER, PRICE * 3)
        shop_services.buy(BUYER, [{"product_id": str(product.id), "qty": 1}])
        before = Product.objects.get(pk=product.id).stock

        shop_services.buy(
            BUYER, [{"product_id": str(product.id), "qty": 1}],
            coupon_code=_code(PRO, ReferralCode.Kind.CONSULTANT),
        )
        assert Product.objects.get(pk=product.id).stock == before


# ── the wait, and what ends it ──────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestMaturation:
    def _order_with_cashback(self, product):
        _fund(BUYER, PRICE)
        result = shop_services.buy(
            BUYER, [{"product_id": str(product.id), "qty": 1}],
            coupon_code=_code(PRO, ReferralCode.Kind.CONSULTANT),
        )
        order = Order.objects.get(pk=result["order_id"])
        Shipment.objects.create(
            order=order, address={}, pincode="110001", weight_grams=50,
            shipping_paise=0, status=Shipment.Status.SHIPPED,
        )
        return order

    def test_nothing_is_paid_before_delivery(self, people, product):
        self._order_with_cashback(product)
        assert services.mature_due() == 0
        assert wallet_services.balance_of(BUYER) == 0

    def test_delivery_starts_a_seven_day_clock(self, people, product):
        order = self._order_with_cashback(product)
        services.on_shipment_status(order.id, Shipment.Status.DELIVERED)
        row = Cashback.objects.filter(side="buyer").first()
        assert row.matures_at is not None
        assert (row.matures_at - timezone.now()).days == 6  # 7 days, minus a tick

    def test_the_money_lands_once_the_window_closes(self, people, product):
        order = self._order_with_cashback(product)
        services.on_shipment_status(order.id, Shipment.Status.DELIVERED)
        Cashback.objects.update(matures_at=timezone.now() - timedelta(minutes=1))

        assert services.mature_due() == 2
        assert wallet_services.balance_of(BUYER) == TENTH

        from apps.consultants.models import EarningsLedger
        earned = EarningsLedger.objects.get(consultant_id=PRO)
        assert earned.net_paise == TENTH
        assert earned.fee_bps == 0, "the platform takes no cut of its own bonus"

    def test_a_return_cancels_the_cashback_and_nothing_is_clawed_back(
        self, people, product
    ):
        """The whole reason the money waits. Paid on purchase, this would
        be money already spent on a consultation and unrecoverable."""
        order = self._order_with_cashback(product)
        services.on_shipment_status(order.id, Shipment.Status.RETURNED)

        assert services.mature_due() == 0
        assert wallet_services.balance_of(BUYER) == 0
        assert all(
            c.status == Cashback.Status.CANCELLED for c in Cashback.objects.all()
        )
        assert Notification.objects.filter(kind="cashback.cancelled").count() == 2

    def test_running_the_sweep_twice_pays_once(self, people, product):
        order = self._order_with_cashback(product)
        services.on_shipment_status(order.id, Shipment.Status.DELIVERED)
        Cashback.objects.update(matures_at=timezone.now() - timedelta(minutes=1))

        services.mature_due()
        services.mature_due()
        assert wallet_services.balance_of(BUYER) == TENTH
        assert Notification.objects.filter(kind="cashback.paid").count() == 2

    def test_both_sides_are_told_when_it_lands(self, people, product):
        order = self._order_with_cashback(product)
        services.on_shipment_status(order.id, Shipment.Status.DELIVERED)
        Cashback.objects.update(matures_at=timezone.now() - timedelta(minutes=1))
        services.mature_due()

        assert "in your wallet" in Notification.objects.get(
            profile_id=BUYER, kind="cashback.paid").title
        assert "earnings" in Notification.objects.get(
            profile_id=PRO, kind="cashback.paid").title


# ── the cap, which is off ───────────────────────────────────────────────────


@pytest.mark.django_db
class TestTheCap:
    def test_uncapped_by_default(self, settings):
        settings.REFERRAL_CASHBACK_CAP_PAISE = 0
        assert services._cashback_paise(2_640_000) == 264_000  # ₹2,640 on ₹26,400

    def test_a_cap_applies_when_one_is_set(self, settings):
        """Flag-based, as asked: a limit can be imposed without a deploy."""
        settings.REFERRAL_CASHBACK_CAP_PAISE = 50_000  # ₹500
        assert services._cashback_paise(2_640_000) == 50_000
        assert services._cashback_paise(100_000) == 10_000  # under the cap, full 10%


# ── affiliate links ─────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAffiliateLinks:
    def test_a_consultant_gets_a_link_with_their_code_in_it(self, people, product):
        link = services.affiliate_link(PRO, product.id)
        assert link["code"].startswith("A")
        assert f"ref={link['code']}" in link["url"]
        assert f"p={product.id}" in link["url"]

    def test_a_link_without_a_product_opens_the_shop(self, people):
        link = services.affiliate_link(PRO)
        assert "p=" not in link["url"]
        assert link["url"].endswith(f"ref={link['code']}")

    def test_the_code_is_stable_across_links(self, people, product):
        """It gets pasted into WhatsApp and lives for months. A link made
        today and one made next week must credit the same person."""
        assert services.affiliate_link(PRO)["code"] == services.affiliate_link(
            PRO, product.id
        )["code"]


# ── the full matrix: who earns what from whom ───────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestEveryDirection:
    """All four combinations, in one place.

    Two of them pay, two of them pay nothing, and the two that pay nothing
    are the ones most likely to be quietly re-enabled by somebody adding a
    feature later. Both are REFUSALS rather than silent zeroes: telling
    somebody their code worked and crediting them nothing is worse than
    telling them it does not apply to them.
    """

    def _second_pro(self):
        pid = "dddddddd-9999-8888-7777-666666666666"
        Profile.objects.create(id=pid, phone=pid, name="Another astrologer")
        Consultant.objects.create(
            profile_id=pid, category="Astrologer", status="approved"
        )
        return pid

    # ── the two that pay ────────────────────────────────────────────────

    def test_consultant_to_seeker_pays_both(self, people, product):
        _fund(BUYER, PRICE)
        result = shop_services.buy(
            BUYER, [{"product_id": str(product.id), "qty": 1}],
            coupon_code=_code(PRO, ReferralCode.Kind.CONSULTANT),
        )
        assert result["ok"] and result["cashback_paise"] == TENTH
        assert Cashback.objects.count() == 2

    def test_seeker_to_seeker_pays_both_in_questions(self, people):
        result = services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        assert result["ok"]
        assert result["you"]["daily"] == 3 and result["them"]["daily"] == 3
        assert Cashback.objects.count() == 0, "a sign-up referral moves no money"

    # ── the two that pay nothing ────────────────────────────────────────

    def test_consultant_to_consultant_pays_nobody(self, people, product):
        other = self._second_pro()
        _fund(other, PRICE)
        result = shop_services.buy(
            other, [{"product_id": str(product.id), "qty": 1}],
            coupon_code=_code(PRO, ReferralCode.Kind.CONSULTANT),
        )
        assert result["reason"] == services.REFUSAL_CONSULTANT_TO_CONSULTANT
        assert Cashback.objects.count() == 0
        assert Referral.objects.count() == 0

    def test_seeker_to_consultant_pays_nobody(self, people):
        """The direction added 25 Sep. A consultant claiming a seeker's
        sign-up code earned both sides three free questions a day until
        this went in."""
        other = self._second_pro()
        result = services.claim_signup(other, _code(BUYER, ReferralCode.Kind.SEEKER))
        assert result["reason"] == services.REFUSAL_CONSULTANT_AS_REFEREE
        assert Referral.objects.count() == 0
        assert Quota.objects.filter(profile_id=other).count() == 0
        assert Quota.objects.filter(profile_id=BUYER).count() == 0, (
            "the referrer was credited for a referral that never happened"
        )

    def test_a_seeker_approved_later_keeps_what_they_were_given(self, people):
        """Checked at CLAIM time only. Somebody who used a code as a
        seeker and is approved months later does not have it taken back —
        nothing reaches backwards."""
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        Profile.objects.filter(pk=FRIEND).exists()
        Consultant.objects.create(
            profile_id=FRIEND, category="Astrologer", status="approved"
        )
        assert Quota.objects.get(profile_id=FRIEND).bonus_daily == 3
        assert Referral.objects.filter(referee_id=FRIEND).count() == 1


# ── when the boost opens ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestTheBoostStartsTomorrow:
    """Three a day for three days, and the three days start TOMORROW.

    IT USED TO START TODAY, and the owner spotted what that meant by
    asking a plain question: *I have already used today's one message and
    then I refer somebody — do I get four today, or three from tomorrow?*

    Neither. The boost raised the day's ALLOWANCE, so they got two more
    today. Which made the same reward worth two questions or three
    depending on the hour it was earned, and gave the referrer visibly
    less than the person they referred — whose first day is the welcome
    five and whose boost therefore always began clean.

    Whole days now. The day it is earned pays nothing extra.
    """

    def _burn_the_welcome_five(self, profile_id, monkeypatch):
        day = [ai_services._ist_today()]
        monkeypatch.setattr(ai_services, "_ist_today", lambda: day[0])
        for i in range(5):
            ai_services.ask(profile_id, f"welcome {i}")
        day[0] += timedelta(days=1)
        return day

    def test_the_day_it_is_earned_gives_nothing_extra(self, people, monkeypatch):
        """The owner's exact question. Today's number does not move."""
        day = self._burn_the_welcome_five(BUYER, monkeypatch)

        ai_services.ask(BUYER, "today's one")
        assert ai_services.quota_state(BUYER)["free_left"] == 0

        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))

        state = ai_services.quota_state(BUYER)
        assert state["free_left"] == 0, "the boost paid out on a part-spent day"
        assert state["daily_allowance"] == 1
        assert state["boosted"] is False
        # But it is coming, and the panel can say so rather than showing an
        # unchanged number that looks like nothing happened.
        assert state["boost_from"] == (day[0] + timedelta(days=1)).isoformat()

    def test_three_a_day_for_exactly_three_days(self, people, monkeypatch):
        day = self._burn_the_welcome_five(BUYER, monkeypatch)
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))

        seen = []
        for _ in range(5):
            day[0] += timedelta(days=1)
            seen.append(ai_services.quota_state(BUYER)["free_left"])
        assert seen == [3, 3, 3, 1, 1], f"got {seen}"

    def test_both_sides_get_the_same_window(self, people):
        """The unfairness that started this: the referrer used to get less
        than the person they referred, purely because their own day was
        already part-spent while the referee's first day was the untouched
        welcome five."""
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        a = Quota.objects.get(profile_id=BUYER)
        b = Quota.objects.get(profile_id=FRIEND)
        assert (a.bonus_from, a.bonus_until, a.bonus_daily) == (
            b.bonus_from, b.bonus_until, b.bonus_daily
        )

    def test_a_second_referral_only_ever_widens_the_window(self, people, monkeypatch):
        """Referred twice keeps the earlier start and the later end. A
        later referral must not be able to cut an earlier one short."""
        day = self._burn_the_welcome_five(BUYER, monkeypatch)
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))
        first = Quota.objects.get(profile_id=BUYER)
        began, ended = first.bonus_from, first.bonus_until

        third = "eeeeeeee-1111-2222-3333-444444444444"
        Profile.objects.create(id=third, phone=third, name="A third seeker")
        day[0] += timedelta(days=2)
        services.claim_signup(third, _code(BUYER, ReferralCode.Kind.SEEKER))

        after = Quota.objects.get(profile_id=BUYER)
        assert after.bonus_from <= began
        assert after.bonus_until >= ended


# ── the compressed testing window ───────────────────────────────────────────


@pytest.mark.django_db
class TestTheCompressedWindow:
    """`AI_FREE_WINDOW_SECONDS` makes a "day" short enough to watch.

    It exists so the ladder can be SEEN working — five welcome, then one a
    day, then three a day after a referral — instead of waited out over
    three real days. Zero is off, and zero is production.

    Everything follows from one function. The allowance reset, the
    referral boost's start and end, and the weekly tarot pull all ask
    `_ist_today()`, so compressing it compresses all three together and
    nothing else in the module had to learn about testing.
    """

    def test_off_by_default_and_that_is_production(self, settings):
        settings.AI_FREE_WINDOW_SECONDS = 0
        from django.utils import timezone as tz

        assert ai_services._ist_today() == (
            tz.now() + timedelta(hours=5, minutes=30)
        ).date()

    def test_a_short_window_advances_the_day(self, settings):
        settings.AI_FREE_WINDOW_SECONDS = 1
        first = ai_services._ist_today()
        import time

        time.sleep(1.1)
        assert ai_services._ist_today() > first, "the period did not roll over"

    def test_the_allowance_resets_when_the_window_rolls(self, people, settings):
        """The thing being tested by hand: one a day, and 'a day' is two
        minutes."""
        settings.AI_FREE_WINDOW_SECONDS = 1
        settings.AI_DAILY_FREE = 1

        for i in range(5):
            ai_services.ask(BUYER, f"welcome {i}")   # burn the welcome five
        import time

        time.sleep(1.1)
        assert ai_services.quota_state(BUYER)["free_left"] == 1
        ai_services.ask(BUYER, "the one")
        assert ai_services.quota_state(BUYER)["free_left"] == 0

        time.sleep(1.1)
        assert ai_services.quota_state(BUYER)["free_left"] == 1, (
            "the next window did not refill the allowance"
        )

    def test_a_referred_seeker_gets_three_per_window(self, people, settings):
        """The whole point of the exercise: three, not one, once the boost
        opens — and it opens at the NEXT window, not this one."""
        settings.AI_FREE_WINDOW_SECONDS = 1
        settings.AI_DAILY_FREE = 1

        for i in range(5):
            ai_services.ask(FRIEND, f"welcome {i}")
        services.claim_signup(FRIEND, _code(BUYER, ReferralCode.Kind.SEEKER))

        # Still this window: the boost starts next one.
        assert ai_services.quota_state(FRIEND)["free_left"] == 0

        import time

        time.sleep(1.1)
        assert ai_services.quota_state(FRIEND)["free_left"] == 3
        assert ai_services.quota_state(FRIEND)["boosted"] is True
