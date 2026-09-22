"""Phase 10 — the shop and the Academy on the Django API (the seeker half).

What runs here is everything that is Python: the cart merge, the quote's
arithmetic and refusals, who the caller is (always the JWT, never the body),
that no admin action is reachable from /v1, and the wallet's pay-for-an-order
path. What does NOT
run here is the SQL those endpoints call as the caller — shop_checkout,
academy_enrol, the settle/release/refund family and the RLS gates exist only
on Postgres. Those are 028_shop_check.sql and 031_academy_check.sql, run in
the SQL editor, plus the role-switch probe recorded in HANDOFF §24.
"""

import contextlib
import uuid
from types import SimpleNamespace

import pytest
from django.db import DatabaseError

from apps.shop import services
from apps.wallet import services as wallet
from apps.wallet.models import Payment

from .conftest import OTHER_USER, TEST_USER
from .test_wallet import StubOrderClient, _event, _wallet, _webhook

ORDER = "0b9d6f7e-1c2a-4b3c-8d4e-5f6a7b8c9d0e"
PRODUCT_A = "aaaaaaaa-0000-4000-8000-000000000001"
PRODUCT_B = "bbbbbbbb-0000-4000-8000-000000000002"


# ── The cart merge (pure) ────────────────────────────────────────────────────


class TestMergeItems:
    def test_repeats_merge_into_one_line(self):
        qty = services.merge_items(
            [{"product_id": PRODUCT_A, "qty": 2}, {"product_id": PRODUCT_A, "qty": 3}]
        )
        assert qty == {uuid.UUID(PRODUCT_A): 5}

    @pytest.mark.parametrize(
        "items",
        [None, "cart", [{"qty": 1}], [{"product_id": "nope", "qty": 1}],
         [{"product_id": PRODUCT_A, "qty": "2"}], [{"product_id": PRODUCT_A, "qty": True}]],
    )
    def test_unreadable_cart_is_refused(self, items):
        with pytest.raises(services.Refusal) as refused:
            services.merge_items(items)
        assert refused.value.reason == "That cart could not be read."

    def test_empty_cart_is_refused(self):
        with pytest.raises(services.Refusal, match="Your cart is empty."):
            services.merge_items([])

    def test_eleven_after_merging_is_refused(self):
        with pytest.raises(services.Refusal, match="up to 10 of each"):
            services.merge_items(
                [{"product_id": PRODUCT_A, "qty": 6}, {"product_id": PRODUCT_A, "qty": 5}]
            )


# ── The quote (shop-quote's rules; DB edges stubbed) ─────────────────────────


@pytest.fixture
def cart_db(monkeypatch):
    """The two DB edges of quote(): what the caller can read, and the insert."""
    state = {"pincode": "110001", "weights": {uuid.UUID(PRODUCT_A): 100, uuid.UUID(PRODUCT_B): 250}}
    stored = []
    monkeypatch.setattr(
        services, "_cart_for_quote",
        lambda uid, ids, address: (state["pincode"], {k: v for k, v in state["weights"].items() if k in set(ids)}),
    )

    def store(uid, pincode, grams, amount):
        stored.append((uid, pincode, grams, amount))
        return {"id": "q-1", "amount_paise": amount, "courier": None, "etd_days": None}

    monkeypatch.setattr(services, "_store_quote", store)
    return state, stored


class TestQuote:
    ITEMS = [{"product_id": PRODUCT_A, "qty": 2}, {"product_id": PRODUCT_B, "qty": 1}]

    def test_prices_the_merged_weight_at_the_flat_rate(self, cart_db, settings):
        settings.SHIPPING_FLAT_PAISE = 8000
        _, stored = cart_db
        result = services.quote(TEST_USER, self.ITEMS, "addr")
        assert stored == [(TEST_USER, "110001", 2 * 100 + 250, 8000)]
        assert result == {"ok": True, "quote_id": "q-1", "amount_paise": 8000,
                          "courier": None, "etd_days": None}

    def test_free_delivery_is_a_real_zero_quote(self, cart_db, settings):
        settings.SHIPPING_FLAT_PAISE = 0
        assert services.quote(TEST_USER, self.ITEMS, "addr")["amount_paise"] == 0

    def test_unset_rate_refuses_rather_than_defaulting(self, cart_db, settings):
        settings.SHIPPING_FLAT_PAISE = None
        with pytest.raises(services.Refusal) as refused:
            services.quote(TEST_USER, self.ITEMS, "addr")
        assert (refused.value.status, refused.value.reason) == (500, "Delivery is not available yet.")
        assert cart_db[1] == []

    def test_an_address_the_caller_cannot_read_is_refused(self, cart_db, settings):
        settings.SHIPPING_FLAT_PAISE = 0
        cart_db[0]["pincode"] = None
        with pytest.raises(services.Refusal, match="Pick a delivery address."):
            services.quote(TEST_USER, self.ITEMS, "addr")

    def test_a_product_no_longer_on_sale_is_refused(self, cart_db, settings):
        settings.SHIPPING_FLAT_PAISE = 0
        del cart_db[0]["weights"][uuid.UUID(PRODUCT_B)]
        with pytest.raises(services.Refusal, match="no longer sold"):
            services.quote(TEST_USER, self.ITEMS, "addr")
        assert cart_db[1] == []


# ── Endpoints: the caller is the JWT ─────────────────────────────────────────


@pytest.mark.django_db
class TestEndpoints:
    @pytest.mark.parametrize(
        "method,path",
        [("get", "/v1/shop/addresses/"), ("post", "/v1/shop/quote/"),
         ("post", "/v1/shop/checkout/"), ("get", "/v1/shop/orders/"),
         ("get", f"/v1/shop/orders/{ORDER}/"), ("post", f"/v1/shop/orders/{ORDER}/cancel/"),
         ("get", "/v1/academy/materials/"), ("post", "/v1/academy/enrol/")],
    )
    def test_signed_out_is_401(self, api_client, method, path):
        response = getattr(api_client, method)(path, {}, format="json")
        assert response.status_code == 401

    def test_no_admin_action_is_reachable_from_v1(self, authed_client):
        # The console is the only admin surface, behind its own login (§22).
        # The old `admin` Edge Function's actions must not come back here.
        response = authed_client.post("/v1/admin/", {"action": "whoami"}, format="json")
        assert response.status_code == 404

    def test_catalogue_and_academy_read_signed_out(self, api_client, monkeypatch):
        seen = []
        monkeypatch.setattr(services, "catalogue", lambda: {"categories": [], "products": []})
        monkeypatch.setattr(services, "academy", lambda uid: seen.append(uid) or {"courses": []})
        assert api_client.get("/v1/shop/catalogue/").status_code == 200
        assert api_client.get("/v1/academy/").status_code == 200
        assert seen == [None]

    def test_academy_signed_in_reads_as_the_caller(self, authed_client, monkeypatch):
        seen = []
        monkeypatch.setattr(services, "academy", lambda uid: seen.append(uid) or {})
        authed_client.get("/v1/academy/")
        assert seen == [TEST_USER]

    def test_checkout_identity_is_the_token_not_the_body(self, authed_client, monkeypatch):
        calls = []
        monkeypatch.setattr(
            services, "checkout",
            lambda *args: calls.append(args) or {"ok": False, "reason": "Your cart is empty."},
        )
        response = authed_client.post(
            "/v1/shop/checkout/",
            {"items": [], "address_id": None, "quote_id": None, "pay": "wallet",
             "profile_id": OTHER_USER},
            format="json",
        )
        # The function's own jsonb is the body, refusal sentence and all.
        assert response.status_code == 200
        assert response.json() == {"ok": False, "reason": "Your cart is empty."}
        assert calls == [(TEST_USER, [], None, None, "wallet")]

    def test_someone_elses_order_status_is_a_404(self, authed_client, monkeypatch):
        monkeypatch.setattr(services, "order_status", lambda uid, order_id: None)
        response = authed_client.get(f"/v1/shop/orders/{ORDER}/")
        assert response.status_code == 404

    def test_a_refusal_travels_with_its_status(self, authed_client, monkeypatch):
        def refuse(uid, path):
            raise services.Refusal(404, "Enrol in the course to open this.")

        monkeypatch.setattr(services, "material_url", refuse)
        response = authed_client.post("/v1/academy/materials/url/", {"path": "a.pdf"}, format="json")
        assert response.status_code == 404
        assert response.json() == {"ok": False, "reason": "Enrol in the course to open this."}

    def test_enrol_sends_what_and_how_never_a_price(self, authed_client, monkeypatch):
        calls = []
        monkeypatch.setattr(services, "enrol", lambda *args: calls.append(args) or {"ok": True})
        authed_client.post(
            "/v1/academy/enrol/",
            {"item_type": "event", "item_id": ORDER, "pay": "wallet", "price_paise": 1},
            format="json",
        )
        assert calls == [(TEST_USER, "event", uuid.UUID(ORDER), "wallet")]


# ── Paying for an order by card (the wallet side) ────────────────────────────


@pytest.fixture
def pending(monkeypatch):
    state = {"row": (TEST_USER, "pending", 5_000, True)}
    monkeypatch.setattr(wallet, "pending_order", lambda order_id: state["row"])
    return state


@pytest.fixture
def configured(settings):
    settings.RAZORPAY_KEY_ID = "rzp_test_123"
    settings.RAZORPAY_KEY_SECRET = "secret_456"
    settings.RAZORPAY_WEBHOOK_SECRET = "whsec-test-secret"
    return settings


@pytest.mark.django_db
class TestPayForOrder:
    def test_the_amount_is_the_orders_and_the_band_does_not_apply(self, pending, configured):
        stub = StubOrderClient()
        result = wallet.create_topup_order(TEST_USER, client=stub, order_id=ORDER)
        # ₹50 is under the ₹100 top-up floor — an order is not a top-up.
        assert result["amount_paise"] == 5_000
        assert stub.calls[0]["notes"] == {"profile_id": TEST_USER, "shop_order_id": ORDER}
        row = Payment.objects.get(provider_order_id="order_TESTSTUB")
        assert (str(row.order_id), row.amount_paise) == (ORDER, 5_000)

    def test_someone_elses_order(self, pending, configured):
        pending["row"] = (OTHER_USER, "pending", 5_000, True)
        with pytest.raises(wallet.Refusal) as refused:
            wallet.create_topup_order(TEST_USER, client=StubOrderClient(), order_id=ORDER)
        assert (refused.value.status, refused.value.reason) == (404, "That order is not yours.")

    @pytest.mark.parametrize("row", [(TEST_USER, "cancelled", 5_000, False), (TEST_USER, "pending", 5_000, False)])
    def test_a_released_or_lapsed_order_is_not_paid_for(self, pending, configured, row):
        pending["row"] = row
        with pytest.raises(wallet.Refusal) as refused:
            wallet.create_topup_order(TEST_USER, client=StubOrderClient(), order_id=ORDER)
        assert refused.value.status == 409
        assert not Payment.objects.exists()

    @pytest.mark.parametrize("body", [{}, {"amount_paise": 10_000, "order_id": ORDER}])
    def test_the_endpoint_takes_an_amount_or_an_order_not_both(self, authed_client, body):
        assert authed_client.post("/v1/wallet/topup/order/", body, format="json").status_code == 400

    def test_capture_settles_the_order_in_the_same_delivery(self, client, pending, configured, monkeypatch):
        _wallet(TEST_USER)
        settled = []
        monkeypatch.setattr(wallet, "settle_order",
                            lambda order_id: settled.append(str(uuid.UUID(str(order_id)))) or {"settled": True})
        monkeypatch.setattr(wallet, "RazorpayClient", lambda *a, **k: StubOrderClient())
        wallet.create_topup_order(TEST_USER, client=StubOrderClient(), order_id=ORDER)
        response = _webhook(client, _event("payment.captured", "order_TESTSTUB", "pay_1", 5_000))
        assert response.status_code == 200
        assert settled == [ORDER]
        assert wallet.balance_of(TEST_USER) == 5_000  # the stub settle spent nothing

    def test_a_plain_topup_settles_nothing(self, client, configured, monkeypatch):
        _wallet(TEST_USER)
        settled = []
        monkeypatch.setattr(wallet, "settle_order", lambda order_id: settled.append(order_id))
        wallet.create_topup_order(TEST_USER, 12_300, client=StubOrderClient())
        _webhook(client, _event("payment.captured", "order_TESTSTUB", "pay_1", 12_300))
        assert settled == []
        assert wallet.balance_of(TEST_USER) == 12_300

    def test_a_short_balance_leaves_the_money_in_the_wallet(self, failing_settle):
        class Short(Exception):
            sqlstate = "WB001"

        failing_settle(DatabaseError("short balance"), cause=Short())
        assert wallet.settle_order(ORDER) == {"ok": True, "settled": False, "status": "short"}

    def test_any_other_settle_failure_propagates_so_razorpay_retries(self, failing_settle):
        failing_settle(DatabaseError("connection lost"))
        with pytest.raises(DatabaseError):
            wallet.settle_order(ORDER)


@pytest.fixture
def failing_settle(monkeypatch):
    """settle_order's cursor raising what psycopg would, with no database."""

    def arm(error, cause=None):
        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def execute(self, sql, params):
                raise error from cause

        monkeypatch.setattr(wallet.transaction, "atomic", contextlib.nullcontext)
        monkeypatch.setattr(wallet, "connection", SimpleNamespace(cursor=Cursor))

    return arm
