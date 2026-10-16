"""The Market's sellers (15 Oct 2026, docs/06 Phase 17; owner's yes, Rahul's
terms in docs/01 §4.7).

  who sells     -> TestSellers: Pros and Creators list; anybody else is refused
  the rules     -> TestListing: each kind's fields, an edit goes back to review
  the console   -> TestReview: nothing shows until approved; a rejection says why;
                   a product becomes a shop row
  buying        -> TestBuying: free is taken, paid goes through the gateway once,
                   the seller earns 30% less (or the admin's rate), only owners open it
  products      -> TestProducts: earns on delivery, the category rate + ₹100 a unit, once
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

    def test_the_categorys_rate_is_used(self, api_client, token, creator, keys):
        from apps.market.models import CommissionRate

        CommissionRate.objects.update_or_create(category="download", defaults={"bps": 1500})
        row = services.approve(_download(price=10000), "admin")
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
    def test_earns_on_delivery_thirty_percent_and_delivery(self, creator):
        ShopCategory.objects.create(name="Maalas", sort=1)
        row = services.approve(services.create(CREATOR, {
            "kind": "product", "title": "Tulsi Mala", "cover_url": "https://x/c.jpg", "price_paise": 100000,
            "stock": 10, "weight_grams": 150}), "admin")
        order, _ = _delivered(row, qty=2)
        assert services.on_shipment_status(order.pk, Shipment.Status.SHIPPED) == 0
        assert services.on_shipment_status(order.pk, Shipment.Status.DELIVERED) == 1
        assert services.on_shipment_status(order.pk, Shipment.Status.DELIVERED) == 0
        e = SellerEarning.objects.get()
        assert (e.gross_paise, e.commission_paise, e.delivery_paise, e.net_paise) == (200000, 60000, 20000, 120000)


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
class TestEarningsPeriod:
    """The Market's Earnings page (16 Oct 2026): one period, by kind and by
    listing, and the endpoint's own refusals."""

    def _sale(self, listing, when, net=7000, buyer=None):
        p = Purchase.objects.create(listing=listing, buyer_id=buyer or uuid.uuid4(), amount_paise=10000)
        return SellerEarning.objects.create(seller_id=CREATOR, listing=listing, purchase=p, gross_paise=10000,
                                            commission_bps=3000, commission_paise=10000 - net,
                                            net_paise=net, created_at=when)

    def test_a_period_by_kind_and_by_listing(self, creator):
        ShopCategory.objects.create(name="Maalas", sort=1)
        book = _approved()
        mala = services.approve(services.create(CREATOR, {
            "kind": "product", "title": "Tulsi Mala", "cover_url": "https://x/c.jpg", "price_paise": 100000,
            "stock": 10, "weight_grams": 150}), "admin")
        now = timezone.make_aware(timezone.datetime(2026, 10, 16, 12))
        self._sale(book, timezone.make_aware(timezone.datetime(2026, 10, 15)))
        self._sale(book, timezone.make_aware(timezone.datetime(2026, 10, 2)))
        self._sale(book, timezone.make_aware(timezone.datetime(2026, 9, 20)))
        order, line = _delivered(mala, qty=2)
        services.on_shipment_status(order.pk, Shipment.Status.DELIVERED)
        SellerEarning.objects.filter(order_item_id=line.pk).update(
            created_at=timezone.make_aware(timezone.datetime(2026, 10, 10)))

        got = services.earnings_period(CREATOR, "this_month", now=now)
        assert got["count"] == 3 and got["units"] == 4 and got["buyers"] == 3
        assert got["net_paise"] == 7000 * 2 + 120000
        assert [(k["kind"], k["count"], k["units"]) for k in got["by_kind"]] == [("product", 1, 2), ("download", 2, 2)]
        assert [(x["title"], x["sales"], x["units"], x["buyers"]) for x in got["listings"]] == [
            ("Tulsi Mala", 1, 2, 1), ("Navgraha Mantra Book", 2, 2, 2)]
        assert got["rows"][0]["title"] == "Navgraha Mantra Book" and got["rows"][0]["namo_paise"] == 3000
        assert sum(d["net_paise"] for d in got["last_7_days"]) == 7000 + 120000
        assert services.earnings_period(CREATOR, "last_month", now=now)["net_paise"] == 7000
        assert services.earnings_period(CREATOR, "lifetime", now=now)["count"] == 4

    def test_the_endpoint(self, api_client, token, creator):
        got = api_client.get("/v1/market/me/earnings/period/?range=this_month", **auth(token))
        assert got.status_code == 200 and got.json()["count"] == 0
        assert api_client.get("/v1/market/me/earnings/period/?range=week", **auth(token)).status_code == 400
        assert api_client.get("/v1/market/me/earnings/period/").status_code in (401, 403)


@pytest.mark.django_db
class TestBank:
    def test_a_creator_saves_an_account(self, settings, creator):
        from cryptography.fernet import Fernet

        settings.PAYOUT_ENCRYPTION_KEY = Fernet.generate_key().decode()
        with pytest.raises(services.Refused):  # an account needs its type (16 Oct 2026)
            services.save_bank(CREATOR, {"account_holder": "Asha", "account_number": "123456789012",
                                         "ifsc": "SBIN0001234", "pan": "ABCDE1234F"})
        got = services.save_bank(CREATOR, {"account_holder": "Asha", "account_number": "123456789012",
                                           "ifsc": "SBIN0001234", "pan": "ABCDE1234F", "account_type": "current",
                                           "firm_name": "Asha Arts", "gst_number": "07ABCDE1234F1Z5"})
        assert got["account_last4"] == "9012" and got["pan_last4"] == "234F"
        assert (got["account_type"], got["firm_name"], got["gst_number"]) == ("current", "Asha Arts", "07ABCDE1234F1Z5")
        with pytest.raises(services.Refused):
            services.save_bank(CREATOR, {"account_holder": "Asha", "upi_id": "a@b", "gst_number": "bad"})
        with pytest.raises(services.Refused):
            services.save_bank(CREATOR, {"account_holder": "Asha", "account_number": "12", "ifsc": "x"})


@pytest.mark.django_db
class TestTagsAndLinks:
    """A Pro or a Creator tags a listing on a post and shares a link to it
    (15 Oct 2026, Rahul). The buyer a link brings is recorded on the
    purchase; nothing is paid on it until the rate is decided."""

    def test_a_post_tags_a_listing_and_carries_the_code(self, creator):
        from apps.content import services as content

        row = _approved()
        post = content.publish_content(CREATOR, "", kind="post", caption="Read this", listing_ids=[row.id])
        [got] = content.attach_products(list(content.public_content().filter(pk=post.pk)))
        assert [x.id for x in got._listings] == [row.id] and got._shop_ref

    def test_three_tags_at_most_counting_both(self, creator):
        from rest_framework.exceptions import ValidationError

        from apps.content import services as content

        rows = [_approved() for _ in range(4)]
        with pytest.raises(ValidationError):
            content.publish_content(CREATOR, "", kind="post", caption="x", listing_ids=[r.id for r in rows])

    def test_a_seeker_cannot_tag(self, creator):
        from rest_framework.exceptions import PermissionDenied

        from apps.content import services as content

        Profile.objects.create(id=NOBODY, phone="9000000c2", name="Seeker")
        with pytest.raises(PermissionDenied):
            content.publish_content(NOBODY, "", kind="post", caption="x", listing_ids=[_approved().id])

    def test_the_link_opens_the_listing(self, creator, settings):
        from apps.referrals import services as referrals

        settings.APP_PUBLIC_URL = "https://1namo.com"
        row = _approved()
        link = referrals.affiliate_link(CREATOR, listing_id=row.id)
        assert link["url"].startswith(f"https://1namo.com/shop/l/{row.id}?ref=")

    def test_the_buyer_a_link_brought_is_recorded(self, creator):
        from apps.referrals import services as referrals
        from apps.referrals.models import CodeKind

        Profile.objects.create(id=NOBODY, phone="9000000c2", name="A Pro")
        code = referrals.code_for(NOBODY, CodeKind.CONSULTANT).code
        with mock.patch("apps.referrals.services.may_share", return_value=True):
            referrals.record_visit(TEST_USER, code)
            row = _approved(price=0)
            services.take_free(TEST_USER, row.id)
        assert Purchase.objects.get(buyer_id=TEST_USER).referrer_id == NOBODY
        # A free one does not use the link up; a paid one does.
        assert referrals.live_visit(TEST_USER) is not None
        paid = _approved(price=10000)
        Purchase.objects.create(listing=paid, buyer_id=TEST_USER, amount_paise=10000, referrer_id=NOBODY)
        assert referrals.live_visit(TEST_USER) is None

    def test_a_link_switched_off_after_the_click_earns_nothing(self, creator):
        # Checked when buying, as the shop does (16 Oct 2026).
        from apps.referrals import services as referrals
        from apps.referrals.models import CodeKind, ReferralCode

        Profile.objects.create(id=NOBODY, phone="9000000c2", name="A Pro")
        code = referrals.code_for(NOBODY, CodeKind.CONSULTANT).code
        with mock.patch("apps.referrals.services.may_share", return_value=True):
            referrals.record_visit(TEST_USER, code)
            ReferralCode.objects.filter(code=code).update(active=False)
            row = _approved(price=0)
            services.take_free(TEST_USER, row.id)
        assert Purchase.objects.get(buyer_id=TEST_USER).referrer_id is None
        # And a sharer who is no longer a Pro or Creator, likewise.
        ReferralCode.objects.filter(code=code).update(active=True)
        assert services._referrer(TEST_USER, _approved(price=0)) is None


@pytest.mark.django_db
class TestReminders:
    def test_an_hour_before_everybody_booked_hears_it_once(self, creator):
        from apps.notifications.models import Notification

        row = services.approve(services.create(CREATOR, {
            "kind": "event", "title": "Live katha", "cover_url": "https://x/c.jpg", "price_paise": 0,
            "starts_at": timezone.now() + timedelta(hours=3), "duration_minutes": 60, "seats": 10,
            "join_url": "https://meet.google.com/abc"}), "admin")
        Purchase.objects.create(listing=row, buyer_id=TEST_USER, amount_paise=0)
        assert services.remind_events() == 0                                  # three hours out
        later = timezone.now() + timedelta(hours=2, minutes=30)
        assert services.remind_events(now=later) == 2                          # the buyer and the host
        assert services.remind_events(now=later + timedelta(minutes=1)) == 0  # once
        assert Notification.objects.filter(kind="market.event_soon", profile_id=TEST_USER).count() == 1

    def test_an_approved_product_tells_the_seller_to_send_stock(self, creator):
        from apps.notifications.models import Notification

        ShopCategory.objects.create(name="Maalas", sort=1)
        services.approve(services.create(CREATOR, {
            "kind": "product", "title": "Tulsi Mala", "cover_url": "https://x/c.jpg", "price_paise": 89000,
            "stock": 10, "weight_grams": 150}), "admin")
        note = Notification.objects.get(profile_id=CREATOR, kind="market.approved")
        assert "Send the 10" in note.body and "address" in note.body



@pytest.mark.django_db
class TestRates:
    """One rate per category, 30% blank; the sharer's 6% from Namo's share;
    a product's delivery written per order (15 Oct 2026, owner's yes)."""

    def test_every_kind_is_thirty_by_default_and_the_console_changes_one(self, creator):
        from apps.market.models import CommissionRate

        assert services.namo_bps("product") == services.namo_bps("event") == 3000
        CommissionRate.objects.update_or_create(category="download", defaults={"bps": 2000})
        assert services.commission_bps(_download()) == 2000

    def test_a_product_pays_thirty_and_its_delivery(self, creator):
        ShopCategory.objects.create(name="Maalas", sort=1)
        row = services.approve(services.create(CREATOR, {
            "kind": "product", "title": "Tulsi Mala", "cover_url": "https://x/c.jpg", "price_paise": 100000,
            "stock": 10, "weight_grams": 150}), "admin")
        order, _ = _delivered(row, qty=1)
        services.on_shipment_status(order.pk, Shipment.Status.DELIVERED)
        e = SellerEarning.objects.get()
        assert (e.commission_paise, e.delivery_paise, e.net_paise) == (30000, 10000, 60000)
        e = services.set_delivery(e, 6500, "finance")
        assert (e.delivery_paise, e.net_paise) == (6500, 63500)

    def test_the_sharer_gets_six_percent_of_each_purchase_through_their_link(self, api_client, token, creator, keys):
        from apps.referrals.models import CreatorEarning

        SHARER = uuid.UUID("00000000-0000-4000-8000-0000000000c9")
        Profile.objects.create(id=SHARER, phone="9000000c9", name="Sharer", influencer=True)
        row = _approved(price=10000)
        with mock.patch("apps.market.services._referrer", return_value=SHARER):
            order = _pay(api_client, token, row.id).json()["razorpay"]["order_id"]
            _confirm(api_client, token, order)
        [paid] = CreatorEarning.objects.filter(profile_id=SHARER)
        assert paid.amount_paise == 600
        # The seller's share is untouched: 6% comes out of Namo's.
        assert SellerEarning.objects.get().net_paise == 7000
        second = _approved(price=10000)
        with mock.patch("apps.market.services._referrer", return_value=SHARER):
            order = _pay(api_client, token, second.id, fake=FakeRazorpay()).json()["razorpay"]["order_id"]
            _confirm(api_client, token, order, payment_id="pay_2")
        assert CreatorEarning.objects.filter(profile_id=SHARER).count() == 2  # old customer too (15 Oct)

    def test_an_event_pays_out_only_once_it_has_happened(self, creator):
        row = services.approve(services.create(CREATOR, {
            "kind": "event", "title": "Live katha", "cover_url": "https://x/c.jpg", "price_paise": 0,
            "starts_at": timezone.now() + timedelta(days=40), "duration_minutes": 60, "seats": 10,
            "join_url": "https://meet.google.com/abc"}), "admin")
        p = Purchase.objects.create(listing=row, buyer_id=TEST_USER, amount_paise=10000)
        SellerEarning.objects.create(seller_id=CREATOR, listing=row, purchase=p, gross_paise=10000,
                                     commission_bps=3000, commission_paise=3000, net_paise=7000,
                                     created_at=timezone.now() - timedelta(days=40))
        assert services.run_payouts() == []
