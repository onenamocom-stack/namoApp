"""Cash on delivery (6 Oct 2026, owner: "COD bhi add karo, 2% extra; the
status should follow through the whole flow, online vs COD").

Nothing leaves the wallet; the total carries a 2% fee, rounded up to the
rupee; the order is PENDING until the courier delivers it, then PAID; a
return or a courier cancellation before that CANCELS it and restocks it.
Shiprocket is told COD and the exact amount to collect.
"""

from unittest import mock

import pytest
from django.utils import timezone

from apps.shop import delivery, shiprocket
from apps.shop.models import Order, Product, Shipment
from apps.shop.services import cod_fee
from apps.wallet import services as wallet_services

from .test_delivery import BUYER, _address, _quote, _wallet, client, configured, mala  # noqa: F401


def _empty_wallet(profile_id=BUYER):
    """A buyer with a wallet and nothing in it (the shared helper writes a
    ledger row, and the ledger refuses a zero)."""
    from django.db import connection

    from apps.profiles.models import Profile

    Profile.objects.get_or_create(id=profile_id, defaults={"phone": str(profile_id)[:15], "name": "Buyer"})
    with connection.cursor() as cursor:
        cursor.execute("insert into wallets (profile_id, balance_paise, created_at) values (%s, 0, %s)",
                       [str(profile_id), timezone.now()])


def _buy(client, mala, address_id, quote_id, qty=1, payment="cod", coupon=None):
    body = {"lines": [{"product_id": str(mala.id), "qty": qty}],
            "address_id": address_id, "quote_id": quote_id, "payment": payment}
    if coupon:
        body["coupon"] = coupon
    return client.post("/v1/shop/buy/", body, format="json").json()


def _cod_order(client, mala, qty=1):
    mine = _address()
    quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": qty}], cod=True)
    assert quote["cod_available"] is True
    return _buy(client, mala, mine["id"], quote["quote_id"], qty=qty)


def test_the_fee_is_two_percent_rounded_up_to_the_rupee():
    assert cod_fee(106_800) == 2_200      # 2% of ₹1,068 is ₹21.36 → ₹22
    assert cod_fee(100_000) == 2_000
    assert cod_fee(5_000) == 100          # ₹1, not ₹0


@pytest.mark.django_db
class TestPlacing:
    def test_nothing_is_debited_and_the_order_is_pending(self, client, mala):
        _wallet(BUYER, 500_000)
        got = _cod_order(client, mala)
        assert got["ok"] is True, got
        assert got["payment_method"] == "cod"
        assert got["cod_fee_paise"] == 2_200
        assert got["total_paise"] == 100_000 + 6_800 + 2_200
        assert wallet_services.balance_of(BUYER) == 500_000
        order = Order.objects.get(pk=got["order_id"])
        assert (order.status, order.payment_method, order.cod_fee_paise) == ("pending", "cod", 2_200)
        assert Shipment.objects.get(pk=order.pk).status == Shipment.Status.READY
        assert Product.objects.get(pk=mala.pk).stock == 4

    def test_works_with_an_empty_wallet(self, client, mala):
        _empty_wallet()
        assert _cod_order(client, mala)["ok"] is True

    def test_refused_where_no_courier_takes_cash_and_the_stock_is_back(self, client, mala):
        _wallet(BUYER, 500_000)
        mine = _address()
        quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}], cod=False)
        got = _buy(client, mala, mine["id"], quote["quote_id"])
        assert got["ok"] is False and "not available at this pincode" in got["reason"]
        assert Product.objects.get(pk=mala.pk).stock == 5
        assert not Order.objects.exists()

    def test_refused_over_the_cap(self, client, mala, settings):
        settings.COD_MAX_PAISE = 100_000
        _empty_wallet()
        got = _cod_order(client, mala)
        assert got["ok"] is False and "up to ₹1,000" in got["reason"]

    def test_at_most_two_on_the_way(self, client, mala):
        _empty_wallet()
        assert _cod_order(client, mala)["ok"] and _cod_order(client, mala)["ok"]
        third = _cod_order(client, mala)
        assert third["ok"] is False and "2 cash-on-delivery orders" in third["reason"]

    def test_paying_online_is_unchanged(self, client, mala):
        _wallet(BUYER, 500_000)
        mine = _address()
        quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}], cod=True)
        got = _buy(client, mala, mine["id"], quote["quote_id"], payment="wallet")
        assert got["ok"] and got["cod_fee_paise"] == 0 and got["total_paise"] == 106_800
        order = Order.objects.get(pk=got["order_id"])
        assert (order.status, order.payment_method) == ("paid", "wallet")
        assert wallet_services.balance_of(BUYER) == 500_000 - 106_800


@pytest.mark.django_db
class TestTheParcelSettlesIt:
    def _order(self, client, mala):
        _empty_wallet()
        got = _cod_order(client, mala)
        return Order.objects.get(pk=got["order_id"])

    def test_delivered_makes_it_paid(self, client, mala):
        order = self._order(client, mala)
        shipment = Shipment.objects.get(pk=order.pk)
        Shipment.objects.filter(pk=order.pk).update(status=Shipment.Status.SHIPPED)
        shipment.refresh_from_db()
        assert delivery.apply_tracking(shipment, "DELIVERED") is True
        order.refresh_from_db()
        assert order.status == "paid"

    @pytest.mark.parametrize("courier_says", ["RTO DELIVERED", "CANCELED"])
    def test_returned_or_cancelled_cancels_and_restocks(self, client, mala, courier_says):
        order = self._order(client, mala)
        assert Product.objects.get(pk=mala.pk).stock == 4
        shipment = Shipment.objects.get(pk=order.pk)
        delivery.apply_tracking(shipment, courier_says)
        order.refresh_from_db()
        assert order.status == "cancelled"
        assert Product.objects.get(pk=mala.pk).stock == 5
        # Once only: a second update restocks nothing.
        shipment.refresh_from_db()
        delivery.order_follows_shipment(order.pk, Shipment.Status.RETURNED)
        assert Product.objects.get(pk=mala.pk).stock == 5

    def test_a_wallet_order_is_never_moved_by_its_parcel(self, client, mala):
        _wallet(BUYER, 500_000)
        mine = _address()
        quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
        order = Order.objects.get(pk=_buy(client, mala, mine["id"], quote["quote_id"], payment="wallet")["order_id"])
        delivery.apply_tracking(Shipment.objects.get(pk=order.pk), "RTO DELIVERED")
        order.refresh_from_db()
        assert order.status == "paid"


@pytest.mark.django_db
class TestShiprocket:
    def test_cod_is_sent_with_the_amount_to_collect(self, client, mala):
        _empty_wallet()
        got = _cod_order(client, mala)
        shipment = Shipment.objects.select_related("order").get(pk=got["order_id"])
        payload = shiprocket._order_payload(shipment)
        assert payload["payment_method"] == "COD"
        assert payload["sub_total"] == "1090.00"

    def test_the_cod_check_asks_with_cod_1(self, settings):
        with mock.patch("apps.shop.shiprocket._call",
                        return_value={"data": {"available_courier_companies": [{"courier_name": "X"}]}}) as call:
            assert shiprocket.cod_available("302001", 200) is True
        assert "cod=1" in call.call_args[0][1]

    def test_a_failed_cod_check_still_quotes_for_paying_online(self, client, mala):
        mine = _address()
        with mock.patch("apps.shop.shiprocket.quote",
                        return_value={"amount_paise": 6_800, "courier": "D", "etd_days": 4}), \
                mock.patch("apps.shop.shiprocket.cod_available", side_effect=shiprocket.ShiprocketError("down")):
            got = delivery.make_quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
        assert got["ok"] is True and got["cod_available"] is False


@pytest.mark.django_db
def test_the_referral_cashback_is_on_the_goods_not_the_fee(mala):
    from apps.referrals.services import cashback_base

    order = Order.objects.create(profile_id=BUYER, status="pending", total_paise=110_000,
                                 payment_method="cod", cod_fee_paise=2_200, created_at=timezone.now())
    order.items.create(item_type="product", item_id=mala.id, title="m", qty=1,
                       unit_price_paise=100_000, tax_rate_bps=0)
    order.items.create(item_type="shipping", item_id=order.id, title="Delivery", qty=1,
                       unit_price_paise=7_800, tax_rate_bps=0)
    assert cashback_base(order) == 100_000
