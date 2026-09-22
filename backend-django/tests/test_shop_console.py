"""The shop in the console (stage 2).

What is worth testing is not that Django renders a form. It is the three
rules that cost money when they slip:

  RUPEES IN, PAISE OUT. An operator types 1850 and the database must hold
  185000. The inverse — asking somebody to type paise for a gemstone — is
  a factor-of-ten mistake waiting to become a real order.

  NOTHING IN THE SHOP IS DELETED. A product, a coupon and an order are all
  pointed at by history. Taking a product off the shop is `active=False`.

  TIERS. Support looks; Fulfilment changes. Nobody edits an order.
"""

import uuid

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.urls import reverse

from apps.console.models import AdminAction, AdminUser, Tier
from apps.profiles.models import Profile
from apps.shop.admin import CouponForm, ProductForm, rupees
from apps.shop.models import Coupon, Order, Product, ShopCategory


def _admin(tier):
    profile_id = uuid.uuid4()
    Profile.objects.create(id=profile_id, phone=str(profile_id)[:15], name=f"{tier}")
    user = User.objects.create_user(username=f"op{profile_id.hex[:8]}", is_staff=True)
    AdminUser.objects.create(profile_id=profile_id, tier=tier, active=True, operator=user)
    client = Client()
    client.force_login(user)
    return client, profile_id


@pytest.fixture
def category(db):
    return ShopCategory.objects.create(name="Gemstones", sort=1)


@pytest.mark.django_db
class TestRupeesAndPaise:
    def test_a_price_typed_in_rupees_is_stored_in_paise(self, category):
        form = ProductForm(data={
            "name": "Blue Sapphire", "category": category.pk, "price": "1850",
            "mrp": "2400", "stock": "5", "weight_grams": "12",
            "tax_rate_bps": "0",
        })
        assert form.is_valid(), form.errors
        product = form.save()
        assert product.price_paise == 185_000
        assert product.mrp_paise == 240_000

    def test_paise_are_rendered_back_as_rupees(self):
        assert rupees(185_000) == "₹1,850"
        assert rupees(185_050) == "₹1,850.50"
        assert rupees(None) == "—"

    def test_an_mrp_at_or_below_the_price_is_refused(self, category):
        """The screens compute the discount badge from the pair. An MRP
        under the price renders a negative saving."""
        form = ProductForm(data={
            "name": "X", "category": category.pk, "price": "1850", "mrp": "1850",
            "stock": "1", "weight_grams": "10", "tax_rate_bps": "0",
        })
        assert not form.is_valid()
        assert "mrp" in form.errors

    def test_an_edit_shows_the_existing_price_in_rupees(self, category):
        product = Product.objects.create(
            name="Y", category=category, price_paise=264_000, stock=1, weight_grams=8
        )
        form = ProductForm(instance=product)
        assert form.fields["price"].initial == 264_000
        assert form.fields["price"].prepare_value(264_000) == pytest.approx(2640)


@pytest.mark.django_db
class TestCoupons:
    def test_a_coupon_cannot_be_both_shapes(self):
        form = CouponForm(data={
            "code": "BOTH", "kind": "percent", "percent_off": "10",
            "flat_off": "200", "active": "on",
        })
        assert not form.is_valid()
        assert "flat_off" in form.errors

    def test_a_percentage_is_capped_when_a_cap_is_set(self):
        coupon = Coupon(kind=Coupon.Kind.PERCENT, percent_off=20,
                        max_discount_paise=50_000)
        # 20% of ₹26,400 is ₹5,280 — the cap makes it ₹500.
        assert coupon.discount_on(2_640_000) == 50_000

    def test_a_coupon_can_make_an_order_free_but_never_negative(self):
        coupon = Coupon(kind=Coupon.Kind.FLAT, flat_off_paise=500_000)
        assert coupon.discount_on(100_000) == 100_000

    def test_the_window_must_run_forwards(self):
        from django.utils import timezone

        now = timezone.now()
        form = CouponForm(data={
            "code": "BACKWARDS", "kind": "flat", "flat_off": "100",
            "starts_at": now.isoformat(), "ends_at": (now - timezone.timedelta(days=1)).isoformat(),
        })
        assert not form.is_valid()
        assert "ends_at" in form.errors


@pytest.mark.django_db
class TestNothingIsDeleted:
    def test_a_product_cannot_be_deleted_only_taken_down(self, category):
        client, _ = _admin(Tier.SUPERADMIN)
        product = Product.objects.create(
            name="Keepsake", category=category, price_paise=1000, stock=1, weight_grams=5
        )
        client.post(reverse("namo:shop_product_delete", args=[product.pk]),
                    {"post": "yes"}, follow=True)
        assert Product.objects.filter(pk=product.pk).exists()

    def test_taking_a_product_down_is_audited_with_what_changed(self, category):
        client, admin_id = _admin(Tier.FULFILMENT)
        product = Product.objects.create(
            name="Gone", category=category, price_paise=1000, stock=3, weight_grams=5
        )
        client.post(reverse("namo:shop_product_changelist"),
                    {"action": "take_down", "_selected_action": [str(product.pk)]},
                    follow=True)
        product.refresh_from_db()
        assert product.active is False
        entry = AdminAction.objects.get(action="product.down")
        assert entry.admin_id == admin_id
        assert entry.detail["was"] == {"active": True}

    def test_out_of_stock_is_a_stock_change_not_a_deletion(self, category):
        client, _ = _admin(Tier.FULFILMENT)
        product = Product.objects.create(
            name="Sold out", category=category, price_paise=1000, stock=4, weight_grams=5
        )
        client.post(reverse("namo:shop_product_changelist"),
                    {"action": "mark_out_of_stock", "_selected_action": [str(product.pk)]},
                    follow=True)
        product.refresh_from_db()
        assert product.stock == 0
        assert product.active is True  # still a product, just not buyable


@pytest.mark.django_db
class TestTiers:
    def test_support_can_look_at_products_but_not_change_them(self, category):
        client, _ = _admin(Tier.SUPPORT)
        product = Product.objects.create(
            name="Look only", category=category, price_paise=1000, stock=2, weight_grams=5
        )
        assert client.get(reverse("namo:shop_product_changelist")).status_code == 200
        client.post(reverse("namo:shop_product_changelist"),
                    {"action": "take_down", "_selected_action": [str(product.pk)]},
                    follow=True)
        product.refresh_from_db()
        assert product.active is True

    def test_nobody_edits_an_order(self):
        """An order's total is what the wallet was debited. Two sources of
        truth that can disagree is worse than one that cannot be edited."""
        client, _ = _admin(Tier.SUPERADMIN)
        order = Order.objects.create(
            profile_id=uuid.uuid4(), status=Order.Status.PAID, total_paise=9900
        )
        response = client.get(reverse("namo:shop_order_change", args=[order.pk]))
        # Django renders a read-only view rather than a form, or refuses.
        assert response.status_code in (200, 403)
        assert b'name="total_paise"' not in response.content
