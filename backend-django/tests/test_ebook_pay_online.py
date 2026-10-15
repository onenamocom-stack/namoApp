"""A priced e-book paid at Razorpay, not from the wallet (15 Oct 2026,
Rahul: "payment will be direct from payment gateway. No wallet will be
used"). Behind EBOOK_PAY_ONLINE, off until the owner says yes.

  off            -> TestOff: nothing changes; the wallet sells the book
  on             -> TestOn: the wallet refuses, the price is the server's,
                    the signed answer or the webhook grants the book once,
                    the wallet is never touched, and a second payment for a
                    book already owned goes to the wallet, never lost
"""

from unittest import mock

import pytest

from apps.bhakti.models import BhaktiAsset
from apps.wallet import services as wallet
from apps.wallet.models import Entitlement, Payment, PaymentStatus
from apps.wallet.razorpay import signature_hex

from .conftest import TEST_USER, make_claims
from .test_astro import auth
from .test_entitlements import _ledger, _wallet
from .test_shop_pay_online import SECRET, FakeRazorpay


@pytest.fixture
def token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


@pytest.fixture
def keys(settings):
    settings.RAZORPAY_KEY_ID = "rzp_test_key"
    settings.RAZORPAY_KEY_SECRET = SECRET
    settings.MEDIA_PROVIDER = "local"
    settings.R2_PRIVATE_BUCKET = "namo-docs"


@pytest.fixture
def online(settings, keys):
    settings.EBOOK_PAY_ONLINE = True


@pytest.fixture
def book(db):
    return BhaktiAsset.objects.create(
        kind="ebook", title="A Complete Guide to Beej Mantra", media_url="ebooks/beej.pdf",
        price_paise=9900, artist="Namo", licence="All rights reserved", source="Namo original",
    )


def _pay(api_client, token, ref, sku="ebook", fake=None):
    with mock.patch("apps.wallet.services.RazorpayClient", return_value=fake or FakeRazorpay()):
        return api_client.post("/v1/wallet/pay/", {"sku": sku, "ref": ref, "price_paise": 1},
                               format="json", **auth(token))


def _confirm(api_client, token, order_id, payment_id="pay_1", signature=None):
    signature = signature or signature_hex(SECRET, f"{order_id}|{payment_id}".encode())
    return api_client.post("/v1/wallet/pay/confirm/", {
        "razorpay_order_id": order_id, "razorpay_payment_id": payment_id,
        "razorpay_signature": signature,
    }, format="json", **auth(token)).json()


def _file(api_client, token, book):
    return api_client.get(f"/v1/bhakti/assets/{book.id}/file/", **auth(token))


@pytest.mark.django_db
class TestOff:
    def test_the_wallet_still_sells_it(self, api_client, token, book, keys):
        _wallet(20000)
        refused = _file(api_client, token, book)
        assert refused.status_code == 402 and refused.json()["pay"] == "wallet"
        assert _pay(api_client, token, str(book.id)).status_code == 400
        assert wallet.buy(TEST_USER, "ebook", str(book.id))["ok"] is True
        assert _file(api_client, token, book).status_code == 200


@pytest.mark.django_db
class TestOn:
    def test_the_wallet_does_not_sell_it(self, api_client, token, book, online):
        _wallet(20000)
        refused = _file(api_client, token, book)
        assert refused.status_code == 402 and refused.json()["pay"] == "online"
        got = wallet.buy(TEST_USER, "ebook", str(book.id))
        assert got["ok"] is False and got["reason"] == wallet.REFUSAL_PAY_ONLINE
        assert wallet.entitlement_state(TEST_USER, "ebook", str(book.id))["pay"] == "online"
        # Predictions and muhurats are still the wallet's.
        assert wallet.pay_mode("prediction") == "wallet"

    def test_the_price_is_the_servers(self, api_client, token, book, online):
        got = _pay(api_client, token, str(book.id)).json()
        assert got["razorpay"] == {"order_id": "order_rzp1", "amount_paise": 9900, "key_id": "rzp_test_key"}
        row = Payment.objects.get(provider_order_id="order_rzp1")
        assert row.status == "created" and row.entitlement_sku == "ebook"
        assert row.entitlement_ref == str(book.id) and row.shop_order_id is None

    def test_the_signed_answer_unlocks_it_once(self, api_client, token, book, online):
        _wallet(500)
        order = _pay(api_client, token, str(book.id)).json()["razorpay"]["order_id"]
        assert _file(api_client, token, book).status_code == 402
        assert _confirm(api_client, token, order)["ok"] is True
        assert _confirm(api_client, token, order)["duplicate"] is True
        assert _file(api_client, token, book).status_code == 200
        assert Entitlement.objects.filter(profile_id=TEST_USER, sku="ebook").count() == 1
        assert wallet.balance_of(TEST_USER) == 500 and _ledger() == []

    def test_the_webhook_unlocks_it_too(self, api_client, token, book, online):
        order = _pay(api_client, token, str(book.id)).json()["razorpay"]["order_id"]
        wallet.payment_capture(event_id="evt_1", order_id=order, payment_id="pay_9",
                               amount_paise=9900, status=PaymentStatus.CAPTURED, raw={})
        assert wallet.owns(TEST_USER, "ebook", str(book.id))

    def test_a_forged_answer_unlocks_nothing(self, api_client, token, book, online):
        order = _pay(api_client, token, str(book.id)).json()["razorpay"]["order_id"]
        assert _confirm(api_client, token, order, signature="0" * 64)["ok"] is False
        assert not wallet.owns(TEST_USER, "ebook", str(book.id))

    def test_owned_opens_no_order(self, api_client, token, book, online):
        Entitlement.objects.create(profile_id=TEST_USER, sku="ebook", ref=str(book.id), price_paise=9900)
        assert _pay(api_client, token, str(book.id)).json() == {"ok": True, "already": True}
        assert not Payment.objects.exists()

    def test_paid_twice_the_second_goes_to_the_wallet(self, api_client, token, book, online):
        _wallet(0)
        fake = FakeRazorpay()
        first = _pay(api_client, token, str(book.id), fake=fake).json()["razorpay"]["order_id"]
        second = _pay(api_client, token, str(book.id), fake=fake).json()["razorpay"]["order_id"]
        assert _confirm(api_client, token, first, "pay_1")["ok"] is True
        assert _confirm(api_client, token, second, "pay_2")["ok"] is True
        assert Entitlement.objects.filter(profile_id=TEST_USER, sku="ebook").count() == 1
        assert wallet.balance_of(TEST_USER) == 9900

    def test_nothing_else_is_sold_this_way(self, api_client, token, book, online):
        free = BhaktiAsset.objects.create(
            kind="ebook", title="Free", media_url="https://x/f.pdf", artist="Namo",
            licence="Public domain", source="Namo",
        )
        assert _pay(api_client, token, str(free.id)).status_code == 400
        assert _pay(api_client, token, "", sku="prediction").status_code == 400
