"""The shop pays through Razorpay directly (6 Oct 2026, Rahul: "store me
seedha payment gateway open karo, instead of wallet; wallet will be for
chat"). The order holds its stock while checkout is open, is settled by
the checkout's signed answer or the webhook (once), lapses unpaid after the
window, and a payment that lands after the lapse is never lost."""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from apps.shop import delivery, services
from apps.shop.models import Order, Product, Shipment
from apps.wallet import services as wallet_services
from apps.wallet.models import Payment
from apps.wallet.razorpay import signature_hex

from .test_delivery import BUYER, _address, _quote, _wallet, client, configured, mala  # noqa: F401

SECRET = "rzp-test-secret"


class FakeRazorpay:
    def __init__(self, fail=False):
        self.fail, self.n = fail, 0

    def create_order(self, amount_paise, notes):
        from apps.wallet.razorpay import RazorpayError

        if self.fail:
            raise RazorpayError(503, "down")
        self.n += 1
        return {"id": f"order_rzp{self.n}", "amount": amount_paise}


@pytest.fixture
def keys(settings):
    settings.RAZORPAY_KEY_ID = "rzp_test_key"
    settings.RAZORPAY_KEY_SECRET = SECRET


def _online(client, mala, fake=None):
    _wallet(BUYER, 100)  # a wallet exists; the shop never touches it
    mine = _address()
    quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
    with mock.patch("apps.wallet.services.RazorpayClient", return_value=fake or FakeRazorpay()):
        return client.post("/v1/shop/buy/", {
            "lines": [{"product_id": str(mala.id), "qty": 1}],
            "address_id": mine["id"], "quote_id": quote["quote_id"], "payment": "online",
        }, format="json").json()


def _confirm(client, got, payment_id="pay_1", signature=None):
    rz = got["razorpay"]["order_id"]
    signature = signature or signature_hex(SECRET, f"{rz}|{payment_id}".encode())
    return client.post(f"/v1/shop/orders/{got['order_id']}/confirm/", {
        "razorpay_order_id": rz, "razorpay_payment_id": payment_id, "razorpay_signature": signature,
    }, format="json").json()


@pytest.mark.django_db
class TestCheckout:
    def test_the_order_waits_for_its_payment(self, client, mala, keys):
        got = _online(client, mala)
        assert got["ok"] is True and got["payment_method"] == "online"
        assert got["razorpay"] == {"order_id": "order_rzp1", "amount_paise": 106_800, "key_id": "rzp_test_key"}
        order = Order.objects.get(pk=got["order_id"])
        assert order.status == "pending" and order.expires_at > timezone.now()
        assert Shipment.objects.get(pk=order.pk).status == Shipment.Status.AWAITING_PAYMENT
        assert Product.objects.get(pk=mala.pk).stock == 4          # held
        assert wallet_services.balance_of(BUYER) == 100           # the wallet is not the shop's
        row = Payment.objects.get(provider_order_id="order_rzp1")
        assert row.status == "created" and str(row.shop_order_id) == got["order_id"]

    def test_an_unpaid_parcel_is_never_sent(self, client, mala, keys, settings):
        got = _online(client, mala)
        assert delivery.dispatch(got["order_id"], force=True) == "awaiting-payment"

    def test_the_signed_answer_pays_it_once(self, client, mala, keys):
        got = _online(client, mala)
        answer = _confirm(client, got)
        assert answer["ok"] is True and answer["status"] == "paid"
        assert Shipment.objects.get(pk=got["order_id"]).status == Shipment.Status.READY
        # The webhook arrives later with the same payment: nothing more.
        again = wallet_services.payment_capture("evt_1", "order_rzp1", "pay_1", 106_800, "captured", {})
        assert again["duplicate"] is True
        assert wallet_services.balance_of(BUYER) == 100
        assert Order.objects.get(pk=got["order_id"]).status == "paid"

    def test_a_forged_signature_pays_nothing(self, client, mala, keys):
        got = _online(client, mala)
        answer = _confirm(client, got, signature="0" * 64)
        assert answer["ok"] is False
        assert Order.objects.get(pk=got["order_id"]).status == "pending"

    def test_the_webhook_alone_pays_it(self, client, mala, keys):
        got = _online(client, mala)
        wallet_services.payment_capture("evt_9", "order_rzp1", "pay_9", 106_800, "captured", {})
        assert Order.objects.get(pk=got["order_id"]).status == "paid"
        assert wallet_services.balance_of(BUYER) == 100


@pytest.mark.django_db
class TestUnpaid:
    def test_closing_checkout_gives_the_stock_back(self, client, mala, keys):
        got = _online(client, mala)
        assert client.post(f"/v1/shop/orders/{got['order_id']}/abandon/").json()["lapsed"] is True
        assert Order.objects.get(pk=got["order_id"]).status == "cancelled"
        assert Product.objects.get(pk=mala.pk).stock == 5
        assert Shipment.objects.get(pk=got["order_id"]).status == Shipment.Status.CANCELLED

    def test_only_the_buyer_can_abandon(self, client, mala, keys):
        got = _online(client, mala)
        assert services.lapse(got["order_id"], profile_id="33333333-3333-4333-8333-333333333333") is False
        assert Order.objects.get(pk=got["order_id"]).status == "pending"

    def test_the_sweep_lapses_it_after_the_window(self, client, mala, keys):
        got = _online(client, mala)
        assert services.lapse_unpaid() == 0
        assert services.lapse_unpaid(timezone.now() + timedelta(minutes=16)) == 1
        assert Product.objects.get(pk=mala.pk).stock == 5

    def test_a_payment_after_the_lapse_goes_to_the_wallet(self, client, mala, keys):
        got = _online(client, mala)
        services.lapse(got["order_id"])
        wallet_services.payment_capture("evt_2", "order_rzp1", "pay_2", 106_800, "captured", {})
        assert Order.objects.get(pk=got["order_id"]).status == "cancelled"
        assert wallet_services.balance_of(BUYER) == 100 + 106_800

    def test_razorpay_down_releases_everything(self, client, mala, keys):
        got = _online(client, mala, fake=FakeRazorpay(fail=True))
        assert got["ok"] is False and "payment provider" in got["reason"]
        assert Product.objects.get(pk=mala.pk).stock == 5
        assert Order.objects.get().status == "cancelled"
