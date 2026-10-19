"""Namo's own e-books are tagged and linked as a Market listing is (15 Oct
2026, Rahul: "Why there is no button of tags and referral links on
download"): a Pro or a Creator tags one on a post or shares its page, and an
e-book bought through that link pays them 6% from Namo's share — new
customer or old, the purchase using the click up."""

import uuid
from unittest import mock

import pytest

from apps.profiles.models import Profile
from apps.referrals import services as referrals
from apps.referrals.models import CodeKind, CreatorEarning
from apps.wallet.models import Entitlement

from .conftest import TEST_USER
from .test_ebook_pay_online import _confirm, _pay, book, keys, online, token  # noqa: F401

CREATOR = uuid.UUID("00000000-0000-4000-8000-0000000000e1")


@pytest.fixture
def creator(db):
    return Profile.objects.create(id=CREATOR, phone="9000000e1", name="Asha Creator", influencer=True)


def _arrive(code):
    with mock.patch("apps.referrals.services.may_share", return_value=True):
        return referrals.record_visit(TEST_USER, code)


@pytest.mark.django_db
class TestTagsAndLinks:
    def test_the_link_opens_the_download(self, creator, book, settings):
        settings.APP_PUBLIC_URL = "https://1namo.com"
        link = referrals.affiliate_link(CREATOR, ebook_id=book.id)
        assert link["url"] == f"https://1namo.com/shop/d/{book.id}?ref={link['code']}"

    def test_a_post_tags_an_ebook_and_carries_the_code(self, creator, book):
        from apps.content import services as content
        from apps.content.views import _public_row

        post = content.publish_content(CREATOR, "", kind="post", caption="Read this", ebook_ids=[book.id])
        [got] = content.attach_products(list(content.public_content().filter(pk=post.pk)))
        assert [x.id for x in got._ebooks] == [book.id] and got._shop_ref
        assert _public_row(got)["ebooks"][0]["title"] == book.title

    def test_three_tags_at_most_counting_everything(self, creator, book):
        from rest_framework.exceptions import ValidationError

        from apps.bhakti.models import BhaktiAsset
        from apps.content import services as content

        more = [BhaktiAsset.objects.create(kind="ebook", title=f"Book {i}", media_url="x.pdf", artist="Namo",
                                           licence="All rights reserved", source="Namo original")
                for i in range(3)]
        with pytest.raises(ValidationError):
            content.publish_content(CREATOR, "", kind="post", caption="x",
                                    ebook_ids=[book.id] + [b.id for b in more])


@pytest.mark.django_db
class TestTheSharersShare:
    def test_an_ebook_through_a_link_pays_six_percent_once_per_click(self, api_client, token, creator, book,
                                                                     online):
        code = referrals.code_for(CREATOR, CodeKind.CONSULTANT).code
        assert _arrive(code)["recorded"] is True
        order = _pay(api_client, token, str(book.id)).json()["checkout"]["order_id"]
        _confirm(api_client, token, order)
        [paid] = CreatorEarning.objects.filter(profile_id=CREATOR)
        assert paid.amount_paise == 9900 * 6 // 100
        assert Entitlement.objects.get(profile_id=TEST_USER).referrer_id == CREATOR
        # The purchase used the click: the next order pays nobody until a fresh one.
        assert referrals.live_visit(TEST_USER) is None

    def test_no_link_pays_nobody(self, api_client, token, creator, book, online):
        order = _pay(api_client, token, str(book.id)).json()["checkout"]["order_id"]
        _confirm(api_client, token, order)
        assert not CreatorEarning.objects.exists()
        assert Entitlement.objects.get(profile_id=TEST_USER).referrer_id is None
