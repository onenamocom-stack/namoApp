"""The shop pays through the gateway directly (PhonePe since 17 Oct 2026) (6 Oct 2026, Rahul: "store me
seedha payment gateway open karo, instead of wallet; wallet will be for
chat"). The order holds its stock while checkout is open, is settled by
PhonePe's order status or the webhook (once), lapses unpaid after the
window, and a payment that lands after the lapse is never lost."""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from apps.shop import delivery, services
from apps.shop.models import Order, Product, Shipment
from apps.wallet import services as wallet_services
from apps.wallet.models import Payment

from .test_delivery import BUYER, _address, _quote, _wallet, client, configured, mala  # noqa: F401

class FakePhonePe:
    """PhonePe without the network: opens checkouts, and answers the
    status of one with `state` (COMPLETED by default) for the amount the
    order was opened for."""

    def __init__(self, fail=False, state="COMPLETED"):
        self.fail, self.state, self.n = fail, state, 0

    def create_payment(self, merchant_order_id, amount_paise, redirect_url, meta=None, expire_after=1200):
        from apps.wallet.phonepe import PhonePeError

        if self.fail:
            raise PhonePeError("down", status=503)
        self.n += 1
        return {"order_id": f"OMO{self.n}", "url": f"https://pay.test/{merchant_order_id}"}

    def order_status(self, merchant_order_id):
        amount = (Payment.objects.filter(provider_order_id=merchant_order_id, status="created")
                  .values_list("amount_paise", flat=True).first())
        return {"orderId": f"OMO-{merchant_order_id}", "state": self.state, "amount": amount}


def install(monkeypatch, fake=None):
    """Every PhonePeClient the services build is this fake."""
    fake = fake or FakePhonePe()
    monkeypatch.setattr("apps.wallet.services.PhonePeClient", lambda *a, **k: fake)
    return fake


@pytest.fixture
def keys(settings, monkeypatch):
    settings.PHONEPE_CLIENT_ID = "TEST-CLIENT"
    settings.PHONEPE_CLIENT_SECRET = "test-secret"
    settings.PHONEPE_CLIENT_VERSION = "1"
    return install(monkeypatch)


def _online(client, mala, fake=None):
    _wallet(BUYER, 100)  # a wallet exists; the shop never touches it
    mine = _address()
    quote = _quote(BUYER, mine["id"], [{"product_id": mala.id, "qty": 1}])
    with mock.patch("apps.wallet.services.PhonePeClient", return_value=fake or FakePhonePe()):
        return client.post("/v1/shop/buy/", {
            "lines": [{"product_id": str(mala.id), "qty": 1}],
            "address_id": mine["id"], "quote_id": quote["quote_id"], "payment": "online",
        }, format="json").json()


def _confirm(client, got):
    return client.post(f"/v1/shop/orders/{got['order_id']}/confirm/", {}, format="json").json()


def _mid(got):
    return got["checkout"]["order_id"]


@pytest.mark.django_db
class TestCheckout:
    def test_the_order_waits_for_its_payment(self, client, mala, keys):
        got = _online(client, mala)
        assert got["ok"] is True and got["payment_method"] == "online"
        assert got["checkout"]["amount_paise"] == 106_800
        assert got["checkout"]["url"] == f"https://pay.test/{_mid(got)}"
        order = Order.objects.get(pk=got["order_id"])
        assert order.status == "pending" and order.expires_at > timezone.now()
        assert Shipment.objects.get(pk=order.pk).status == Shipment.Status.AWAITING_PAYMENT
        assert Product.objects.get(pk=mala.pk).stock == 4          # held
        assert wallet_services.balance_of(BUYER) == 100           # the wallet is not the shop's
        row = Payment.objects.get(provider_order_id=_mid(got))
        assert row.status == "created" and str(row.shop_order_id) == got["order_id"]

    def test_an_unpaid_parcel_is_never_sent(self, client, mala, keys, settings):
        got = _online(client, mala)
        assert delivery.dispatch(got["order_id"], force=True) == "awaiting-payment"

    def test_the_status_answer_pays_it_once(self, client, mala, keys):
        got = _online(client, mala)
        answer = _confirm(client, got)
        assert answer["ok"] is True and answer["status"] == "paid"
        assert Shipment.objects.get(pk=got["order_id"]).status == Shipment.Status.READY
        # The webhook arrives later with the same payment: nothing more.
        again = wallet_services.payment_capture(None, _mid(got), _mid(got), 106_800, "captured", {})
        assert again["duplicate"] is True
        assert wallet_services.balance_of(BUYER) == 100
        assert Order.objects.get(pk=got["order_id"]).status == "paid"

    def test_a_failed_payment_pays_nothing(self, client, mala, keys):
        got = _online(client, mala)
        keys.state = "FAILED"
        answer = _confirm(client, got)
        assert answer["ok"] is False
        assert Order.objects.get(pk=got["order_id"]).status == "pending"

    def test_a_pending_payment_waits(self, client, mala, keys):
        got = _online(client, mala)
        keys.state = "PENDING"
        answer = _confirm(client, got)
        assert answer["ok"] is False and answer["pending"] is True
        assert Order.objects.get(pk=got["order_id"]).status == "pending"

    def test_nobody_else_confirms_it(self, client, mala, keys, api_client):
        got = _online(client, mala)
        answer = api_client.post(f"/v1/shop/orders/{got['order_id']}/confirm/", {}, format="json")
        assert answer.status_code in (401, 403)

    def test_the_webhook_alone_pays_it(self, client, mala, keys):
        got = _online(client, mala)
        wallet_services.payment_capture(None, _mid(got), "OMO-9", 106_800, "captured", {})
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
        wallet_services.payment_capture(None, _mid(got), "OMO-2", 106_800, "captured", {})
        assert Order.objects.get(pk=got["order_id"]).status == "cancelled"
        assert wallet_services.balance_of(BUYER) == 100 + 106_800

    def test_phonepe_down_releases_everything(self, client, mala, keys):
        got = _online(client, mala, fake=FakePhonePe(fail=True))
        assert got["ok"] is False and "payment provider" in got["reason"]
        assert Product.objects.get(pk=mala.pk).stock == 5
        assert Order.objects.get().status == "cancelled"
