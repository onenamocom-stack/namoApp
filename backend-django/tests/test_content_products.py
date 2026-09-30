"""Products tagged on a post or reel (ContentProduct, 30 Sep 2026).

The rules: an approved consultant (or an admin) may tag up to three ACTIVE
shop products at publish; the feed, the author page and the detail view all
carry them, in the author's order, with the author's A code so the tap-through
is an affiliate link. A retired product drops off; an unapproved
consultant's tagged posts leave the feed with the rest of their posts.
"""

import pytest

from apps.content.models import Content, ContentProduct
from apps.content.services import TAG_LIMIT_REFUSAL, TAG_MISSING_REFUSAL, TAG_REFUSAL
from apps.referrals.models import CodeKind, ReferralCode

from .conftest import make_claims
from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
    _publish,
    _set_consultant_status,
    admin_token,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)


@pytest.fixture
def consultant_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=APPROVED))


@pytest.fixture
def products():
    from apps.shop.models import Product, ShopCategory

    category = ShopCategory.objects.create(name="Gemstones")

    def make(name, active=True):
        return Product.objects.create(
            name=name, category=category, price_paise=185_000, mrp_paise=240_000,
            stock=3, weight_grams=12, active=active,
        )

    return {
        "sapphire": make("Blue Sapphire"),
        "ruby": make("Ruby"),
        "maala": make("Tulsi Maala"),
        "pearl": make("Pearl"),
        "retired": make("Old Stone", active=False),
    }


def _ids(*rows):
    return [str(r.id) for r in rows]


@pytest.mark.django_db
class TestTagging:
    def test_consultant_tags_products_in_order(
        self, api_client, consultant_token, roster, products
    ):
        p = products
        response = _publish(
            api_client, consultant_token, kind="clip", caption="wear this",
            media_url="https://x/reel.mp4", product_ids=_ids(p["ruby"], p["sapphire"]),
        )
        assert response.status_code == 201
        tags = list(ContentProduct.objects.order_by("sort"))
        assert [t.product.name for t in tags] == ["Ruby", "Blue Sapphire"]
        # Tagging mints the A code the links will carry.
        assert ReferralCode.objects.filter(
            profile_id=APPROVED, kind=CodeKind.CONSULTANT
        ).exists()

    def test_no_products_is_an_ordinary_post(self, api_client, consultant_token, roster):
        response = _publish(api_client, consultant_token, kind="post", caption="plain")
        assert response.status_code == 201
        assert ContentProduct.objects.count() == 0
        assert not ReferralCode.objects.filter(profile_id=APPROVED).exists()

    def test_seeker_cannot_tag(self, api_client, seeker_token, roster, products):
        response = _publish(
            api_client, seeker_token, kind="post", caption="buy this",
            product_ids=_ids(products["ruby"]),
        )
        assert response.status_code == 403
        assert response.json()["message"] == TAG_REFUSAL
        # Refused whole: no post without its tags.
        assert Content.objects.count() == 0

    def test_admin_may_tag(self, api_client, admin_token, roster, products):
        response = _publish(
            api_client, admin_token, kind="post", caption="house pick",
            product_ids=_ids(products["pearl"]),
        )
        assert response.status_code == 201
        assert ContentProduct.objects.count() == 1

    def test_at_most_three(self, api_client, consultant_token, roster, products):
        p = products
        response = _publish(
            api_client, consultant_token, kind="post", caption="too many",
            product_ids=_ids(p["ruby"], p["sapphire"], p["maala"], p["pearl"]),
        )
        assert response.status_code == 400
        assert TAG_LIMIT_REFUSAL in json_text(response)
        assert Content.objects.count() == 0

    def test_duplicates_collapse(self, api_client, consultant_token, roster, products):
        ruby = products["ruby"]
        response = _publish(
            api_client, consultant_token, kind="post", caption="twice",
            product_ids=_ids(ruby, ruby),
        )
        assert response.status_code == 201
        assert ContentProduct.objects.count() == 1

    def test_retired_product_refused(self, api_client, consultant_token, roster, products):
        response = _publish(
            api_client, consultant_token, kind="post", caption="old",
            product_ids=_ids(products["retired"]),
        )
        assert response.status_code == 400
        assert TAG_MISSING_REFUSAL in json_text(response)
        assert Content.objects.count() == 0


def json_text(response):
    return response.content.decode()


@pytest.mark.django_db
class TestReading:
    def _tagged_post(self, api_client, consultant_token, products, *names):
        response = _publish(
            api_client, consultant_token, kind="post", caption="this one",
            product_ids=_ids(*(products[n] for n in names)),
        )
        assert response.status_code == 201
        return response.json()["id"]

    def test_feed_carries_products_and_code(
        self, api_client, consultant_token, roster, products
    ):
        self._tagged_post(api_client, consultant_token, products, "sapphire", "ruby")
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert [p["name"] for p in row["products"]] == ["Blue Sapphire", "Ruby"]
        assert row["products"][0]["price_paise"] == 185_000
        code = ReferralCode.objects.get(profile_id=APPROVED, kind=CodeKind.CONSULTANT)
        assert row["shop_ref"] == code.code
        assert row["shop_ref"].startswith("A")

    def test_untagged_row_is_empty_and_null(
        self, api_client, consultant_token, roster
    ):
        _publish(api_client, consultant_token, kind="post", caption="plain")
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["products"] == []
        assert row["shop_ref"] is None

    def test_detail_and_by_author_carry_them_too(
        self, api_client, consultant_token, roster, products
    ):
        cid = self._tagged_post(api_client, consultant_token, products, "maala")
        detail = api_client.get(f"/v1/content/{cid}/").json()
        assert [p["name"] for p in detail["products"]] == ["Tulsi Maala"]
        mine = api_client.get(f"/v1/content/by-author/?author_id={APPROVED}").json()
        assert [p["name"] for p in mine[0]["products"]] == ["Tulsi Maala"]

    def test_retired_after_posting_drops_off(
        self, api_client, consultant_token, roster, products
    ):
        self._tagged_post(api_client, consultant_token, products, "ruby", "pearl")
        products["ruby"].active = False
        products["ruby"].save(update_fields=["active"])
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert [p["name"] for p in row["products"]] == ["Pearl"]

    def test_unapproved_consultant_takes_the_links_with_the_post(
        self, api_client, consultant_token, roster, products
    ):
        """A consultant who stops being approved takes their posts out of the
        feed (the 025 NOT EXISTS clause), so a tagged link that would still
        credit them is never served — the post is a 404 before the code is
        ever looked up."""
        cid = self._tagged_post(api_client, consultant_token, products, "ruby")
        _set_consultant_status(APPROVED, "pending")
        assert api_client.get(f"/v1/content/{cid}/").status_code == 404
        assert api_client.get("/v1/content/feed/").json()["results"] == []


# ── views (ContentView, once per person) ───────────────────────────────────────────


@pytest.mark.django_db
class TestViews:
    def _reel(self, api_client, consultant_token):
        response = _publish(
            api_client, consultant_token, kind="clip", caption="watch",
            media_url="https://x/reel.mp4",
        )
        return response.json()["id"]

    def _view(self, api_client, token, cid):
        return api_client.post(f"/v1/content/{cid}/view/", **auth(token))

    def test_one_person_counts_once(
        self, api_client, consultant_token, seeker_token, second_seeker_token, roster
    ):
        cid = self._reel(api_client, consultant_token)
        assert self._view(api_client, seeker_token, cid).json() == {"views": 1}
        # Replaying, scrolling back, a second tab: still one person.
        assert self._view(api_client, seeker_token, cid).json() == {"views": 1}
        assert self._view(api_client, second_seeker_token, cid).json() == {"views": 2}
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["view_count"] == 2

    def test_author_does_not_count(self, api_client, consultant_token, roster):
        cid = self._reel(api_client, consultant_token)
        assert self._view(api_client, consultant_token, cid).json() == {"views": 0}

    def test_needs_a_session(self, api_client, consultant_token, roster):
        cid = self._reel(api_client, consultant_token)
        assert api_client.post(f"/v1/content/{cid}/view/").status_code == 401

    def test_hidden_content_is_a_404(
        self, api_client, consultant_token, seeker_token, roster
    ):
        cid = self._reel(api_client, consultant_token)
        _set_consultant_status(APPROVED, "pending")
        assert self._view(api_client, seeker_token, cid).status_code == 404
