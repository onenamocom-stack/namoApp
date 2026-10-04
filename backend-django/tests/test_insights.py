"""The consultant's Insights tab (4 Oct 2026): their own posts, the last 7
days, and products sold with their coupon."""

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.content.models import Comment, Content, ContentView
from apps.reactions.models import Reaction
from apps.referrals.models import Referral, ReferralKind
from apps.shop.models import Order, OrderItem, Product, ShopCategory

from .conftest import make_claims
from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
    SECOND_SEEKER,
    SEEKER,
    _publish,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)

URL = "/v1/consultants/me/insights/"


@pytest.fixture
def consultant_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=APPROVED))


def _view(content_id, viewer, days_ago=0):
    when = timezone.now() - timedelta(days=days_ago)
    ContentView.objects.create(
        content_id=content_id, viewer_id=viewer, day=when.date(), created_at=when
    )
    Content.objects.filter(pk=content_id).update(view_count=Content.objects.get(pk=content_id).view_count + 1)


def _sale(product, qty, *, status=Order.Status.PAID, referrer=APPROVED):
    buyer = uuid.uuid4()
    order = Order.objects.create(profile_id=buyer, status=status, total_paise=product.price_paise * qty)
    OrderItem.objects.create(
        order=order, item_type="product", item_id=product.id, title=product.name,
        qty=qty, unit_price_paise=product.price_paise,
    )
    Referral.objects.create(
        kind=ReferralKind.PURCHASE, referrer_id=referrer, referee_id=buyer, code="ATEST234", order=order,
    )
    return order


@pytest.mark.django_db
class TestInsights:
    def test_only_my_own_posts_with_their_views(
        self, api_client, consultant_token, seeker_token, roster
    ):
        mine = _publish(api_client, consultant_token, kind="clip", caption="mine", media_url="https://x/a.mp4").json()["id"]
        _publish(api_client, seeker_token, kind="post", caption="not mine")
        _view(mine, SEEKER)
        _view(mine, SECOND_SEEKER, days_ago=10)  # older than the week

        body = api_client.get(URL, **auth(consultant_token)).json()
        assert [p["id"] for p in body["pieces"]] == [mine]
        piece = body["pieces"][0]
        assert piece["views"] == 2 and piece["views_7d"] == 1
        assert piece["media_url"] == "https://x/a.mp4" and piece["kind"] == "clip"
        assert body["week"]["views"] == 1
        assert body["totals"] == {"pieces": 1, "views": 2}

    def test_the_week_counts_follows_saves_and_live_comments(
        self, api_client, consultant_token, roster
    ):
        cid = _publish(api_client, consultant_token, kind="post", caption="p").json()["id"]
        Reaction.objects.create(actor_id=SEEKER, target_type="consultant", target_id=APPROVED, kind="follow")
        old = Reaction.objects.create(actor_id=SECOND_SEEKER, target_type="profile", target_id=APPROVED, kind="follow")
        Reaction.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=9))
        Reaction.objects.create(actor_id=SEEKER, target_type="content", target_id=cid, kind="save")
        Comment.objects.create(content_id=cid, author_id=SEEKER, body="nice")
        Comment.objects.create(content_id=cid, author_id=SEEKER, body="gone", status="removed")

        week = api_client.get(URL, **auth(consultant_token)).json()["week"]
        assert week == {"views": 0, "new_followers": 1, "saves": 1, "comments": 1}

    def test_products_sold_with_my_coupon(self, api_client, consultant_token, roster):
        cat = ShopCategory.objects.create(name="Gemstones")
        ruby = Product.objects.create(name="Ruby", category=cat, price_paise=100_000, mrp_paise=120_000, stock=9, weight_grams=10, image_url="https://x/ruby.jpg")
        pearl = Product.objects.create(name="Pearl", category=cat, price_paise=50_000, mrp_paise=60_000, stock=9, weight_grams=10)
        _sale(ruby, 1)
        _sale(ruby, 2)
        _sale(pearl, 1)
        _sale(pearl, 5, status=Order.Status.REFUNDED)       # refunded: left out
        _sale(ruby, 4, referrer=SECOND_SEEKER)               # someone else's code

        shop = api_client.get(URL, **auth(consultant_token)).json()["shop"]
        assert shop["orders"] == 3 and shop["units"] == 4
        assert [(p["name"], p["units"], p["buyers"]) for p in shop["products"]] == [("Ruby", 3, 2), ("Pearl", 1, 1)]
        assert shop["products"][0]["image_url"] == "https://x/ruby.jpg"

    def test_consultants_only(self, api_client, seeker_token, roster):
        assert api_client.get(URL, **auth(seeker_token)).status_code == 404
        assert api_client.get(URL).status_code == 401
