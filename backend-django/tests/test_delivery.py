"""Delivery (5 Oct 2026): the address, the quote, the fee on the order, the
dispatch after payment and the tracking webhook.

Never talks to Shiprocket — every call is patched. What is tested is that
the fee is the server's, a quote cannot be reused or stretched to a heavier
cart, a parcel is dispatched once, and tracking only moves forward.
"""

import json
import uuid
from datetime import timedelta
from unittest import mock

import pytest
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.profiles.models import Profile
from apps.shop import delivery, shiprocket
from apps.shop.models import (
    Order, OrderItem, Product, Shipment, ShippingAddress, ShippingQuote, ShopCategory,
)
from apps.wallet import services as wallet_services
from tests.conftest import TEST_USER, make_claims

BUYER = uuid.UUID(TEST_USER) if not isinstance(TEST_USER, uuid.UUID) else TEST_USER
OTHER = uuid.UUID("33333333-3333-4333-8333-333333333333")

ADDRESS = {"name": "A Seeker", "phone": "+91 99999 00001", "line1": "12 Some Road",
           "line2": "Near the temple", "city": "Jaipur", "state": "Rajasthan",
           "pincode": "302001"}


@pytest.fixture(autouse=True)
def configured(settings):
    settings.SHIPROCKET_EMAIL = "ops@example.test"
    settings.SHIPROCKET_PASSWORD = "not-a-real-password"
    settings.SHIPROCKET_WEBHOOK_TOKEN = "hook-token"
    cache.clear()
    cache.set(shiprocket.PICKUP_KEY, {"name": "Primary", "pincode": "110001"}, 3600)


@pytest.fixture
def client(sign_hs256, hs256_mode):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {sign_hs256(make_claims())}")
    return c


def _wallet(profile_id, paise):
    Profile.objects.get_or_create(id=profile_id, defaults={"phone": str(profile_id)[:15], "name": "Buyer"})
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise, created_at) values (%s, 0, %s)",
            [str(profile_id), timezone.now()],
        )
    wallet_services.insert_ledger(profile_id, paise, "Added money", ref_type="adjustment")


@pytest.fixture
def mala(db):
    category = ShopCategory.objects.create(name="Maalas")
    return Product.objects.create(
        name="Rudraksha mala", category=category, price_paise=100_000,
        stock=5, weight_grams=200, active=True,
    )


def _address(profile_id=BUYER, **over):
    row, reason = delivery.save_address(profile_id, {**ADDRESS, **over})
    assert reason is None
    return row


def _quote(profile_id, address_id, lines, amount=6_800):
    with mock.patch("apps.shop.shiprocket.quote",
                    return_value={"amount_paise": amount, "courier": "Delhivery", "etd_days": 4}):
        return delivery.make_quote(profile_id, address_id, lines)


# ── the client ──────────────────────────────────────────────────────────────


class TestQuoteMaths:
    def _serviceability(self, couriers, recommended=None):
        return {"data": {"available_courier_companies": couriers,
                         "recommended_courier_company_id": recommended}}

    def test_the_recommended_courier_is_charged_rounded_up(self, db):
        cache.set(shiprocket.PICKUP_KEY, {"name": "Primary", "pincode": "110001"}, 3600)
        body = self._serviceability([
            {"courier_company_id": 1, "courier_name": "Cheap", "rate": 40.0},
            {"courier_company_id": 2, "courier_name": "Good", "rate": 67.85,
             "estimated_delivery_days": "3"},
        ], recommended=2)
        with mock.patch("apps.shop.shiprocket._call", return_value=body):
            got = shiprocket.quote("302001", 200)
        assert got == {"amount_paise": 6_800, "courier": "Good", "etd_days": 3}

    def test_without_a_recommendation_the_cheapest(self, db):
        body = self._serviceability([
            {"courier_company_id": 1, "courier_name": "Cheap", "rate": 40.2},
            {"courier_company_id": 2, "courier_name": "Dear", "rate": 90},
        ])
        with mock.patch("apps.shop.shiprocket._call", return_value=body):
            assert shiprocket.quote("302001", 200)["amount_paise"] == 4_100

    def test_no_courier_is_none(self, db):
        with mock.patch("apps.shop.shiprocket._call", return_value=self._serviceability([])):
            assert shiprocket.quote("302001", 200) is None

    def test_the_named_pickup_is_found_and_blank_uses_the_primary(self, settings):
        cache.clear()
        rows = {"data": {"shipping_address": [
            {"pickup_location": "Home", "pin_code": 201301},
            {"pickup_location": "Warehouse", "pin_code": 110020, "is_primary_location": 1},
        ]}}
        settings.SHIPROCKET_PICKUP = ""
        with mock.patch("apps.shop.shiprocket._call", return_value=rows):
            assert shiprocket.pickup() == {"name": "Warehouse", "pincode": "110020"}
        cache.clear()
        settings.SHIPROCKET_PICKUP = "home"
        with mock.patch("apps.shop.shiprocket._call", return_value=rows):
            assert shiprocket.pickup() == {"name": "Home", "pincode": "201301"}

    @pytest.mark.parametrize("raw,ours", [
        ("PICKED UP", "shipped"), ("IN TRANSIT", "shipped"),
        ("OUT FOR DELIVERY", "shipped"), ("DELIVERED", "delivered"),
        ("RTO DELIVERED", "returned"), ("RTO INITIATED", "returned"),
        ("CANCELED", "cancelled"), ("UNDELIVERED", "shipped"), ("NEW", None), ("", None),
    ])
    def test_courier_words_become_ours(self, raw, ours):
        assert shiprocket.classify(raw) == ours


# ── addresses and the quote ─────────────────────────────────────────────────


@pytest.mark.django_db
class TestAddresses:
    def test_a_good_address_is_saved_with_a_clean_phone(self):
        row = _address()
        assert row["phone"] == "9999900001"

    @pytest.mark.parametrize("over,word", [
        ({"pincode": "30200"}, "pincode"), ({"phone": "12345"}, "mobile"),
        ({"line1": "12"}, "house"), ({"name": ""}, "name"), ({"city": ""}, "city"),
    ])
    def test_a_bad_address_says_what_is_missing(self, over, word):
        row, reason = delivery.save_address(BUYER, {**ADDRESS, **over})
        assert row is None and word in reason

    def test_nobody_quotes_against_somebody_elses_address(self, mala):
        theirs = _address(OTHER)
        got = _quote(BUYER, theirs["id"], [{"product_id": mala.id, "qty": 1}])
        assert got["ok"] is False

    def test_the_weight_is_the_servers(self, mala):
        mine = _address()
        got = _quote(BUYER, mine["id"], [{"product_id": str(mala.id), "qty": 3}])
        assert ShippingQuote.objects.get(pk=got["quote_id"]).weight_grams == 600

    def test_an_unserved_pincode_is_a_sentence(self, mala):
        mine = _address()
        with mock.patch("apps.shop.shiprocket.quote", return_value=None):
            got = delivery.make_quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
        assert got == {"ok": False, "reason": delivery.NOT_SERVED}


# ── buying with delivery ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestBuyWithDelivery:
    def _buy(self, client, mala, address_id, quote_id, qty=1):
        return client.post("/v1/shop/buy/", {
            "lines": [{"product_id": str(mala.id), "qty": qty}],
            "address_id": address_id, "quote_id": quote_id,
        }, format="json").json()

    def test_the_fee_is_on_the_total_and_a_shipment_is_written(self, client, mala):
        _wallet(BUYER, 500_000)
        mine = _address()
        quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
        got = self._buy(client, mala, mine["id"], quote["quote_id"])
        assert got["ok"] is True
        assert got["total_paise"] == 106_800 and got["shipping_paise"] == 6_800
        assert wallet_services.balance_of(BUYER) == 500_000 - 106_800
        order = Order.objects.get(pk=got["order_id"])
        assert OrderItem.objects.get(order=order, item_type="shipping").unit_price_paise == 6_800
        shipment = Shipment.objects.get(pk=order.pk)
        assert shipment.status == Shipment.Status.READY
        assert shipment.address["line1"] == "12 Some Road"
        assert shipment.pincode == "302001"

    def test_buy_without_an_address_is_refused(self, client, mala):
        _wallet(BUYER, 500_000)
        response = client.post("/v1/shop/buy/", {
            "lines": [{"product_id": str(mala.id), "qty": 1}]}, format="json")
        assert response.status_code == 400
        assert wallet_services.balance_of(BUYER) == 500_000

    def test_a_quote_is_spent_once(self, client, mala):
        _wallet(BUYER, 500_000)
        mine = _address()
        quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
        assert self._buy(client, mala, mine["id"], quote["quote_id"])["ok"] is True
        again = self._buy(client, mala, mine["id"], quote["quote_id"])
        assert again["ok"] is False and "delivery charge" in again["reason"]

    def test_a_light_quote_cannot_carry_a_heavy_cart(self, client, mala):
        _wallet(BUYER, 500_000)
        mine = _address()
        quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
        got = self._buy(client, mala, mine["id"], quote["quote_id"], qty=4)
        assert got["ok"] is False
        assert wallet_services.balance_of(BUYER) == 500_000
        # Refused, so the quote was not burned and the stock not taken.
        assert ShippingQuote.objects.get(pk=quote["quote_id"]).used_at is None
        assert Product.objects.get(pk=mala.pk).stock == 5

    def test_an_expired_quote_is_refused(self, client, mala):
        _wallet(BUYER, 500_000)
        mine = _address()
        quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
        ShippingQuote.objects.filter(pk=quote["quote_id"]).update(
            expires_at=timezone.now() - timedelta(minutes=1))
        assert self._buy(client, mala, mine["id"], quote["quote_id"])["ok"] is False

    def test_dispatch_is_own_orders_only(self, client, mala):
        order = Order.objects.create(profile_id=OTHER, status=Order.Status.PAID, total_paise=1)
        response = client.post(f"/v1/shop/orders/{order.pk}/dispatch/")
        assert response.status_code == 404


# ── dispatch and tracking ───────────────────────────────────────────────────


@pytest.fixture
def shipment(db):
    order = Order.objects.create(profile_id=BUYER, status=Order.Status.PAID, total_paise=106_800,
                                 created_at=delivery.AUTO_DISPATCH_FROM + timedelta(days=1))
    OrderItem.objects.create(order=order, item_type="product", item_id=uuid.uuid4(),
                             title="Rudraksha mala", qty=1, unit_price_paise=100_000)
    return Shipment.objects.create(
        order=order, address={"name": "A Seeker", "line1": "12 Some Road", "city": "Jaipur",
                              "state": "Rajasthan", "phone": "9999900001"},
        pincode="302001", weight_grams=200, shipping_paise=6_800,
        status=Shipment.Status.READY,
    )


class TestDispatch:
    def test_one_dispatch_does_every_step_and_a_second_does_nothing(self, shipment):
        with mock.patch("apps.shop.shiprocket.push", return_value="501") as push, \
             mock.patch("apps.shop.shiprocket.assign_awb",
                        return_value={"awb": "AWB1", "courier": "Delhivery"}) as assign, \
             mock.patch("apps.shop.shiprocket.generate_pickup", return_value=True) as pickup, \
             mock.patch("apps.shop.shiprocket.label", return_value="https://x.test/l.pdf"):
            assert delivery.dispatch(shipment.order_id) == "dispatched"
            assert delivery.dispatch(shipment.order_id) == "dispatched"
        assert (push.call_count, assign.call_count, pickup.call_count) == (1, 1, 1)
        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.SHIPPED and shipment.awb == "AWB1"

    def test_a_prototype_order_is_never_sent_automatically(self, shipment):
        Order.objects.filter(pk=shipment.order_id).update(
            created_at=delivery.AUTO_DISPATCH_FROM - timedelta(days=20))
        with mock.patch("apps.shop.shiprocket.push") as push:
            assert delivery.dispatch(shipment.order_id) == "too-old"
        push.assert_not_called()

    def test_unconfigured_does_nothing(self, shipment, settings):
        settings.SHIPROCKET_PASSWORD = ""
        with mock.patch("apps.shop.shiprocket.push") as push:
            assert delivery.dispatch(shipment.order_id) == "not-configured"
        push.assert_not_called()


class TestWebhook:
    def _hook(self, body, token="hook-token"):
        return APIClient().post("/v1/shop/parcel-updates/", json.dumps(body),
                                content_type="application/json", HTTP_X_API_KEY=token)

    def test_without_the_token_nothing_moves(self, shipment):
        Shipment.objects.filter(pk=shipment.pk).update(awb="AWB1")
        assert self._hook({"awb": "AWB1", "current_status": "DELIVERED"}, token="x").status_code == 401
        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.READY

    def test_delivered_moves_it_and_starts_the_cashback_clock(self, shipment):
        Shipment.objects.filter(pk=shipment.pk).update(awb="AWB1", status=Shipment.Status.SHIPPED)
        with mock.patch("apps.referrals.services.on_shipment_status") as clock:
            response = self._hook({"awb": "AWB1", "current_status": "DELIVERED"})
        assert response.json()["moved"] is True
        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.DELIVERED and shipment.delivered_at
        clock.assert_called_once_with(shipment.order_id, "delivered")

    def test_a_late_update_never_walks_it_back(self, shipment):
        Shipment.objects.filter(pk=shipment.pk).update(awb="AWB1", status=Shipment.Status.DELIVERED)
        self._hook({"awb": "AWB1", "current_status": "IN TRANSIT"})
        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.DELIVERED
        assert shipment.tracking_status == "IN TRANSIT"

    def test_an_unknown_parcel_is_still_a_200(self, db):
        assert self._hook({"awb": "NOPE", "current_status": "DELIVERED"}).status_code == 200

    def test_found_by_our_order_id_before_it_has_an_awb(self, shipment):
        self._hook({"order_id": str(shipment.order_id), "awb": "AWB7",
                    "current_status": "PICKED UP", "courier_name": "Blue Dart"})
        shipment.refresh_from_db()
        assert shipment.awb == "AWB7" and shipment.status == Shipment.Status.SHIPPED
