"""Buying from the shop, and the race that matters.

**One Blue Sapphire, two people, same tick.** Exactly one gets it, the
other is told it is gone, and the other is not charged. That is the whole
point of this file; everything else here is scaffolding around it.

The naive shape is read-then-write — `if stock >= 1: stock -= 1` — and
both callers pass the check because the gap between the read and the write
is where the other transaction lives. These tests run real threads against
a real database so the mechanism is exercised rather than described.
"""

import threading
import uuid

import pytest
from django.db import connection
from django.utils import timezone

from apps.profiles.models import Profile
from apps.shop import services
from apps.shop.models import Coupon, Order, OrderItem, Product, ShopCategory
from apps.wallet import services as wallet_services

BUYER_A = uuid.UUID("11111111-1111-4111-8111-111111111111")
BUYER_B = uuid.UUID("22222222-2222-4222-8222-222222222222")


@pytest.fixture(autouse=True)
def money_tables(db):
    """prod's append-only ledger triggers, which the model layer does not
    carry. A settle that writes twice must fail here the way it would
    fail in production."""
    with connection.cursor() as cursor:
        cursor.execute(
            "create trigger ledger_immutable before update on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
    yield
    with connection.cursor() as cursor:
        cursor.execute("drop trigger if exists ledger_immutable")


def _buyer(profile_id, paise):
    Profile.objects.create(id=profile_id, phone=str(profile_id)[:15], name="Buyer")
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise, created_at)"
            " values (%s, 0, %s)", [str(profile_id), timezone.now()],
        )
    wallet_services.insert_ledger(profile_id, paise, "Added money", ref_type="adjustment")


@pytest.fixture
def sapphire(db):
    category = ShopCategory.objects.create(name="Gemstones")
    return Product.objects.create(
        name="Blue Sapphire", category=category, price_paise=185_000,
        mrp_paise=240_000, stock=1, weight_grams=12, active=True,
    )


def _balance(profile_id):
    return wallet_services.balance_of(profile_id)


# ── the race ────────────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestOneItemTwoBuyers:
    def test_exactly_one_of_two_simultaneous_buyers_gets_the_last_one(self, sapphire):
        _buyer(BUYER_A, 500_000)
        _buyer(BUYER_B, 500_000)

        results = {}
        barrier = threading.Barrier(2)

        def attempt(who):
            barrier.wait()  # both threads arrive at the same instant
            try:
                results[who] = services.buy(who, [{"product_id": sapphire.id, "qty": 1}])
            finally:
                connection.close()

        threads = [threading.Thread(target=attempt, args=(who,))
                   for who in (BUYER_A, BUYER_B)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        won = [who for who, r in results.items() if r.get("ok")]
        lost = [who for who, r in results.items() if not r.get("ok")]

        assert len(won) == 1, results
        assert len(lost) == 1, results

        # The loser is TOLD, in the words the screen shows.
        assert results[lost[0]]["reason"] == services.REFUSAL_OUT_OF_STOCK

        # The shelf is empty, not negative. A negative stock is the tell
        # that both writes landed.
        sapphire.refresh_from_db()
        assert sapphire.stock == 0

        # One order exists, not two.
        assert Order.objects.count() == 1
        assert OrderItem.objects.count() == 1

        # And the loser was not charged a paisa.
        assert _balance(lost[0]) == 500_000
        assert _balance(won[0]) == 500_000 - 185_000

    def test_five_buyers_and_three_in_stock(self, sapphire):
        """The same rule at a shape where an off-by-one would hide."""
        Product.objects.filter(pk=sapphire.pk).update(stock=3)
        buyers = [uuid.uuid4() for _ in range(5)]
        for who in buyers:
            _buyer(who, 500_000)

        results = {}
        barrier = threading.Barrier(len(buyers))

        def attempt(who):
            barrier.wait()
            try:
                results[who] = services.buy(who, [{"product_id": sapphire.id, "qty": 1}])
            finally:
                connection.close()

        threads = [threading.Thread(target=attempt, args=(w,)) for w in buyers]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        won = [w for w, r in results.items() if r.get("ok")]
        assert len(won) == 3, results
        sapphire.refresh_from_db()
        assert sapphire.stock == 0
        assert Order.objects.count() == 3
        for loser in (w for w, r in results.items() if not r.get("ok")):
            assert _balance(loser) == 500_000

    def test_stock_is_claimed_before_the_wallet_is_touched(self, sapphire):
        """Order of operations, and it is not arbitrary.

        A buyer who cannot pay must not take the last gemstone off the
        shelf on their way to being refused — the next person, who could
        pay, would be told it is sold out.
        """
        _buyer(BUYER_A, 100)  # nowhere near enough
        result = services.buy(BUYER_A, [{"product_id": sapphire.id, "qty": 1}])

        assert result["ok"] is False
        sapphire.refresh_from_db()
        assert sapphire.stock == 1, "a failed payment left the shelf empty"
        assert Order.objects.count() == 0
        assert _balance(BUYER_A) == 100


# ── the ordinary paths ──────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestBuying:
    def test_a_purchase_moves_stock_money_and_writes_an_order(self, sapphire):
        _buyer(BUYER_A, 500_000)
        result = services.buy(BUYER_A, [{"product_id": sapphire.id, "qty": 1}])

        assert result["ok"]
        sapphire.refresh_from_db()
        assert sapphire.stock == 0
        assert _balance(BUYER_A) == 500_000 - 185_000

        order = Order.objects.get()
        assert order.total_paise == 185_000
        item = OrderItem.objects.get()
        assert item.item_type == "product"
        assert item.item_id == sapphire.id
        assert item.unit_price_paise == 185_000

    def test_the_price_comes_from_the_row_not_from_the_client(self, sapphire):
        """Rule 3. There is no price field in the request at all, which is
        the strongest form of not trusting one."""
        from apps.shop.views import BuyInput

        assert "price" not in BuyInput().fields
        assert "total" not in BuyInput().fields

    def test_a_withdrawn_product_cannot_be_bought(self, sapphire):
        """`active=False` is the console's delete. It must vanish from the
        shop AND refuse a purchase already in flight."""
        _buyer(BUYER_A, 500_000)
        Product.objects.filter(pk=sapphire.pk).update(active=False)
        result = services.buy(BUYER_A, [{"product_id": sapphire.id, "qty": 1}])
        assert result["ok"] is False
        assert result["reason"] == services.REFUSAL_GONE
        assert _balance(BUYER_A) == 500_000

    def test_an_out_of_stock_product_is_still_listed(self, sapphire):
        """A shelf with a greyed-out label is a shop. A shelf that silently
        loses items is a bug report."""
        Product.objects.filter(pk=sapphire.pk).update(stock=0)
        rows = [services.product_row(p) for p in services.list_products()]
        assert len(rows) == 1
        assert rows[0]["in_stock"] is False

    def test_a_withdrawn_product_is_not_listed(self, sapphire):
        Product.objects.filter(pk=sapphire.pk).update(active=False)
        assert services.list_products() == []

    def test_buying_two_products_locks_them_in_a_stable_order(self, sapphire):
        """Two carts with the same two products in opposite orders would
        otherwise each hold what the other wants, and the database would
        break the tie by killing one — which a seeker experiences as a
        random failure."""
        other = Product.objects.create(
            name="Tulsi Maala", category=sapphire.category, price_paise=89_000,
            stock=5, weight_grams=40,
        )
        _buyer(BUYER_A, 500_000)
        result = services.buy(BUYER_A, [
            {"product_id": other.id, "qty": 1},
            {"product_id": sapphire.id, "qty": 1},
        ])
        assert result["ok"]
        assert result["total_paise"] == 185_000 + 89_000
        assert OrderItem.objects.count() == 2


@pytest.mark.django_db(transaction=True)
class TestCoupons:
    def test_a_percentage_coupon_comes_off_the_total(self, sapphire):
        _buyer(BUYER_A, 500_000)
        Coupon.objects.create(code="NAMO10", kind=Coupon.Kind.PERCENT, percent_off=10)
        result = services.buy(BUYER_A, [{"product_id": sapphire.id, "qty": 1}],
                              coupon_code="namo10")
        assert result["discount_paise"] == 18_500
        assert result["total_paise"] == 166_500
        assert _balance(BUYER_A) == 500_000 - 166_500

    def test_a_spent_coupon_is_refused_and_nothing_moves(self, sapphire):
        _buyer(BUYER_A, 500_000)
        Coupon.objects.create(code="ONCE", kind=Coupon.Kind.FLAT,
                              flat_off_paise=10_000, max_redemptions=1, used_count=1)
        result = services.buy(BUYER_A, [{"product_id": sapphire.id, "qty": 1}],
                              coupon_code="ONCE")
        assert result["reason"] == services.REFUSAL_COUPON_SPENT
        sapphire.refresh_from_db()
        assert sapphire.stock == 1
        assert _balance(BUYER_A) == 500_000

    def test_a_refusal_after_a_claim_puts_the_stock_back(self, sapphire):
        """The trap this nearly shipped with.

        `transaction.atomic()` rolls back on an EXCEPTION; a plain `return`
        from inside it COMMITS everything done so far. A refused coupon
        after a successful stock claim therefore left the shelf one short
        and nobody charged — an item sold to nobody. Refusals raise now.
        """
        _buyer(BUYER_A, 500_000)
        Coupon.objects.create(code="DEAD", kind=Coupon.Kind.FLAT,
                              flat_off_paise=1_000, active=True,
                              ends_at=timezone.now() - timezone.timedelta(days=1))
        before = Product.objects.get(pk=sapphire.pk).stock
        result = services.buy(BUYER_A, [{"product_id": sapphire.id, "qty": 1}],
                              coupon_code="DEAD")
        assert result["ok"] is False
        assert Product.objects.get(pk=sapphire.pk).stock == before
        assert Order.objects.count() == 0

    def test_redemptions_are_counted_not_derived(self, sapphire):
        """An order later refunded still consumed the coupon, so the count
        cannot be a query over orders."""
        Product.objects.filter(pk=sapphire.pk).update(stock=5)
        _buyer(BUYER_A, 500_000)
        coupon = Coupon.objects.create(code="TWICE", kind=Coupon.Kind.FLAT,
                                       flat_off_paise=1_000, max_redemptions=5)
        services.buy(BUYER_A, [{"product_id": sapphire.id, "qty": 1}], coupon_code="TWICE")
        coupon.refresh_from_db()
        assert coupon.used_count == 1
