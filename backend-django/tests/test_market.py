"""The Market's sellers (15 Oct 2026, docs/06 Phase 17; owner's yes, Rahul's
terms in docs/01 §4.7).

  who sells     -> TestSellers: Pros and Creators list; anybody else is refused
  the rules     -> TestListing: each kind's fields, an edit goes back to review
  the console   -> TestReview: nothing shows until approved; a rejection says why;
                   a product becomes a shop row
  buying        -> TestBuying: free is taken, paid goes through the gateway once,
                   the seller earns 30% less (or the admin's rate), only owners open it
  products      -> TestProducts: earns on delivery, 20% + ₹100 a unit, once
  payouts       -> TestPayouts: the 7th makes last month's rows, once; paid is paid
"""

import uuid
from datetime import date, timedelta
from unittest import mock

import pytest
from django.utils import timezone

from apps.market import services
from apps.market.models import Listing, Purchase, SellerEarning, SellerPayout
from apps.media.models import MediaAsset
from apps.profiles.models import Profile
from apps.shop.models import Order, OrderItem, Product, Shipment, ShopCategory
from apps.wallet import services as wallet
from apps.wallet.razorpay import signature_hex

from .conftest import TEST_USER, make_claims
from .test_astro import auth
from .test_shop_pay_online import SECRET, FakeRazorpay

CREATOR = uuid.UUID("00000000-0000-4000-8000-0000000000c1")
NOBODY = uuid.UUID("00000000-0000-4000-8000-0000000000c2")


@pytest.fixture
def creator(db):
    return Profile.objects.create(id=CREATOR, phone="9000000c1", name="Asha Creator", influencer=True)


@pytest.fixture
def token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


@pytest.fixture
def keys(settings):
    settings.RAZORPAY_KEY_ID = "rzp_test_key"
    settings.RAZORPAY_KEY_SECRET = SECRET
    settings.MEDIA_PROVIDER = "local"
    settings.R2_PRIVATE_BUCKET = "namo-docs"


def _file(owner=CREATOR, name="guide.pdf"):
    return MediaAsset.objects.create(owner=str(owner), kind="download", bucket_key=f"downloads/{owner}/x/{name}",
                                     mime="application/pdf", size_bytes=2_000_000, status="ready")


def _download(price=9900, **over):
    data = {"kind": "download", "title": "Navgraha Mantra Book", "cover_url": "https://x/c.jpg",
            "price_paise": price, "file_asset_id": _file().pk}
    data.update(over)
    return services.create(CREATOR, data)


def _approved(**over):
    row = _download(**over)
    return services.approve(row, "admin")


@pytest.mark.django_db
class TestSellers:
    def test_a_creator_lists(self, creator):
        row = _download()
        assert row.status == "pending" and row.seller_id == CREATOR

    def test_anybody_else_is_refused(self, creator):
        Profile.objects.create(id=NOBODY, phone="9000000c2", name="Seeker")
        with pytest.raises(services.Refused) as err:
            services.create(NOBODY, {"kind": "download", "title": "x"})
        assert err.value.status == 403

    def test_the_endpoint_says_whether_you_may_sell(self, api_client, token):
        body = api_client.get("/v1/market/me/listings/", **auth(token)).json()
        assert body == {"seller": False, "listings": []}


@pytest.mark.django_db
class TestListing:
    def test_a_file_must_be_your_own(self, creator):
        theirs = _file(owner=NOBODY)
        with pytest.raises(services.Refused):
            _download(file_asset_id=theirs.pk)

    def test_mrp_above_the_price(self, creator):
        with pytest.raises(services.Refused):
            _download(mrp_paise=9900)
        assert _download(mrp_paise=19900).mrp_paise == 19900

    def test_an_event_needs_a_future_time_seats_and_a_link(self, creator):
        base = {"kind": "event", "title": "Live katha", "cover_url": "https://x/c.jpg", "price_paise": 29900,
                "duration_minutes": 90, "seats": 50, "join_url": "https://meet.google.com/abc"}
        with pytest.raises(services.Refused):
            services.create(CREATOR, {**base, "starts_at": timezone.now() - timedelta(hours=1)})
        with pytest.raises(services.Refused):
            services.create(CREATOR, {**base, "starts_at": timezone.now() + timedelta(days=2), "join_url": "zoom"})
        assert services.create(CREATOR, {**base, "starts_at": timezone.now() + timedelta(days=2)}).seats == 50

    def test_a_course_needs_lessons_and_the_first_is_a_preview(self, creator):
        lessons = [{"title": "One", "minutes": 10, "asset_id": _file().pk},
                   {"title": "Two", "minutes": 20, "asset_id": _file().pk, "preview": True}]
        row = services.create(CREATOR, {"kind": "course", "title": "Kundli", "cover_url": "https://x/c.jpg",
                                        "price_paise": 149900, "lessons": lessons})
        assert [r["preview"] for r in row.lessons] == [True, False]

    def test_a_product_is_never_free(self, creator):
        with pytest.raises(services.Refused):
            services.create(CREATOR, {"kind": "product", "title": "Mala", "cover_url": "https://x/c.jpg",
                                      "price_paise": 0, "stock": 5, "weight_grams": 200})

    def test_an_edit_goes_back_to_review(self, creator):
        row = _approved()
        services.update(CREATOR, row.id, {"title": "New name", "cover_url": "https://x/c.jpg", "price_paise": 9900})
        row.refresh_from_db()
        assert row.status == "pending" and row.title == "New name"


@pytest.mark.django_db
class TestReview:
    def test_nothing_shows_until_approved(self, api_client, creator):
        row = _download()
        assert api_client.get("/v1/market/listings/").json() == []
        assert api_client.get(f"/v1/market/listings/{row.id}/").status_code == 404
        services.approve(row, "admin")
        [card] = api_client.get("/v1/market/listings/?kind=download").json()
        assert card["title"] == "Navgraha Mantra Book" and card["seller"]["is_creator"] is True

    def test_a_rejection_says_why(self, creator):
        row = services.reject(_download(), "admin", "The cover is blurred.")
        assert row.status == "rejected" and row.review_note == "The cover is blurred."

    def test_a_product_becomes_a_shop_row(self, creator):
        ShopCategory.objects.create(name="Maalas", sort=1)
        row = services.create(CREATOR, {"kind": "product", "title": "Tulsi Mala", "cover_url": "https://x/c.jpg",
                                        "price_paise": 89000, "stock": 10, "weight_grams": 150,
                                        "category_name": "maalas"})
        services.approve(row, "admin")
        product = Product.objects.get(pk=row.product_id)
        assert product.brand == "Asha Creator" and product.category.name == "Maalas" and product.stock == 10


def _pay(api_client, token, ref, fake=None):
    with mock.patch("apps.wallet.services.RazorpayClient", return_value=fake or FakeRazorpay()):
        return api_client.post("/v1/wallet/pay/", {"sku": "listing", "ref": str(ref)}, format="json", **auth(token))


def _confirm(api_client, token, order_id, payment_id="pay_1"):
    sig = signature_hex(SECRET, f"{order_id}|{payment_id}".encode())
    return api_client.post("/v1/wallet/pay/confirm/", {
        "razorpay_order_id": order_id, "razorpay_payment_id": payment_id, "razorpay_signature": sig,
    }, format="json", **auth(token)).json()


@pytest.mark.django_db
class TestBuying:
    def test_free_is_taken(self, api_client, token, creator, keys):
        row = _approved(price=0)
        assert api_client.post(f"/v1/market/listings/{row.id}/take/", **auth(token)).json() == {"ok": True}
        assert Purchase.objects.filter(listing=row, buyer_id=TEST_USER).exists()
        assert not SellerEarning.objects.exists()

    def test_paid_goes_through_the_gateway_once(self, api_client, token, creator, keys):
        row = _approved(price=9900)
        assert api_client.post(f"/v1/market/listings/{row.id}/take/", **auth(token)).status_code == 402
        order = _pay(api_client, token, row.id).json()["razorpay"]
        assert order["amount_paise"] == 9900
        assert api_client.get(f"/v1/market/listings/{row.id}/access/", **auth(token)).status_code == 402
        assert _confirm(api_client, token, order["order_id"])["ok"] is True
        assert _confirm(api_client, token, order["order_id"])["duplicate"] is True
        [earning] = SellerEarning.objects.all()
        assert (earning.gross_paise, earning.commission_paise, earning.net_paise) == (9900, 2970, 6930)
        got = api_client.get(f"/v1/market/listings/{row.id}/access/", **auth(token)).json()
        assert got["file_url"].endswith("guide.pdf")
        assert api_client.get(f"/v1/market/listings/{row.id}/", **auth(token)).json()["owned"] is True

    def test_the_admins_rate_is_used(self, api_client, token, creator, keys):
        row = services.approve(_download(price=10000), "admin", bps=1500)
        order = _pay(api_client, token, row.id).json()["razorpay"]["order_id"]
        _confirm(api_client, token, order)
        assert SellerEarning.objects.get().net_paise == 8500

    def test_a_full_event_sells_no_more(self, api_client, token, creator, keys):
        row = services.approve(services.create(CREATOR, {
            "kind": "event", "title": "Live katha", "cover_url": "https://x/c.jpg", "price_paise": 0,
            "starts_at": timezone.now() + timedelta(days=1), "duration_minutes": 60, "seats": 1,
            "join_url": "https://meet.google.com/abc"}), "admin")
        Purchase.objects.create(listing=row, buyer_id=NOBODY, amount_paise=0)
        assert api_client.post(f"/v1/market/listings/{row.id}/take/", **auth(token)).status_code == 400

    def test_the_seller_opens_their_own(self, creator, keys):
        row = _approved()
        assert services.access(CREATOR, row)["file_name"] == "guide.pdf"


def _delivered(listing, qty=2):
    order = Order.objects.create(profile_id=TEST_USER, status="paid", total_paise=listing.price_paise * qty)
    line = OrderItem.objects.create(order=order, item_type="product", item_id=listing.product_id,
                                    title=listing.title, qty=qty, unit_price_paise=listing.price_paise)
    return order, line


@pytest.mark.django_db
class TestProducts:
    def test_earns_on_delivery_twenty_percent_and_delivery(self, creator):
        ShopCategory.objects.create(name="Maalas", sort=1)
        row = services.approve(services.create(CREATOR, {
            "kind": "product", "title": "Tulsi Mala", "cover_url": "https://x/c.jpg", "price_paise": 100000,
            "stock": 10, "weight_grams": 150}), "admin")
        order, _ = _delivered(row, qty=2)
        assert services.on_shipment_status(order.pk, Shipment.Status.SHIPPED) == 0
        assert services.on_shipment_status(order.pk, Shipment.Status.DELIVERED) == 1
        assert services.on_shipment_status(order.pk, Shipment.Status.DELIVERED) == 0
        e = SellerEarning.objects.get()
        assert (e.gross_paise, e.commission_paise, e.delivery_paise, e.net_paise) == (200000, 40000, 20000, 140000)


@pytest.mark.django_db
class TestPayouts:
    def _earned(self, when, net=7000):
        row = Listing.objects.first() or _approved()
        p = Purchase.objects.create(listing=row, buyer_id=uuid.uuid4(), amount_paise=10000)
        return SellerEarning.objects.create(seller_id=CREATOR, listing=row, purchase=p, gross_paise=10000,
                                            commission_bps=3000, commission_paise=10000 - net,
                                            net_paise=net, created_at=when)

    def test_the_seventh_pays_last_month_once(self, creator):
        sept = timezone.make_aware(timezone.datetime(2026, 9, 20))
        octo = timezone.make_aware(timezone.datetime(2026, 10, 3))
        self._earned(sept)
        self._earned(sept)
        self._earned(octo)
        [payout] = services.run_payouts(today=date(2026, 10, 7))
        assert payout.month == date(2026, 9, 1) and payout.amount_paise == 14000
        assert services.run_payouts(today=date(2026, 10, 8)) == []
        assert SellerEarning.objects.filter(payout__isnull=True).count() == 1

    def test_paid_is_paid(self, creator):
        self._earned(timezone.make_aware(timezone.datetime(2026, 9, 20)))
        [payout] = services.run_payouts(today=date(2026, 10, 7))
        services.mark_paid(payout, "UTR123", "finance")
        summary = services.earnings(CREATOR)
        assert summary["paid_paise"] == 7000 and summary["due_paise"] == 0
        assert SellerPayout.objects.get().reference == "UTR123"

    def test_next_payout_day(self):
        assert services.next_payout_day(date(2026, 10, 3)) == date(2026, 10, 7)
        assert services.next_payout_day(date(2026, 10, 15)) == date(2026, 11, 7)


@pytest.mark.django_db
class TestBank:
    def test_a_creator_saves_an_account(self, settings, creator):
        from cryptography.fernet import Fernet

        settings.PAYOUT_ENCRYPTION_KEY = Fernet.generate_key().decode()
        got = services.save_bank(CREATOR, {"account_holder": "Asha", "account_number": "123456789012",
                                           "ifsc": "SBIN0001234", "pan": "ABCDE1234F"})
        assert got["account_last4"] == "9012" and got["pan_last4"] == "234F"
        with pytest.raises(services.Refused):
            services.save_bank(CREATOR, {"account_holder": "Asha", "account_number": "12", "ifsc": "x"})
