"""Deleting your account, and blocking somebody's posts (19 Oct 2026, Rahul:
what Google Play asks of a social app)."""

import uuid

import pytest

from apps.consultants.models import Consultant
from apps.content import services as content
from apps.dms.models import DmBlock
from apps.profiles import services
from apps.profiles.models import Profile
from apps.referrals.models import ReferralCode

from .conftest import OTHER_USER, TEST_USER, make_claims


@pytest.fixture
def people(db):
    me = Profile.objects.create(id=TEST_USER, phone="9000000001", name="Ritu", bio="Hi",
                                birth_place="Delhi", username="ritu", avatar_url="https://x/y.jpg")
    other = Profile.objects.create(id=OTHER_USER, phone="9000000002", name="Other")
    return me, other


def _auth(sign_hs256, sub):
    return {"HTTP_AUTHORIZATION": f"Bearer {sign_hs256(claims=make_claims(sub=sub))}"}


class TestDelete:
    def test_it_needs_the_word(self, api_client, sign_hs256, hs256_mode, people):
        got = api_client.post("/v1/profiles/me/delete/", {"confirm": "yes"}, format="json",
                              **_auth(sign_hs256, TEST_USER))
        assert got.status_code == 400
        assert Profile.objects.get(pk=TEST_USER).name == "Ritu"

    def test_it_wipes_what_names_them_and_hides_their_posts(self, api_client, sign_hs256, hs256_mode, people):
        post = content.publish_content(TEST_USER, "", kind="post", caption="Jai Shri Ram")
        Consultant.objects.create(profile_id=TEST_USER, category="Astrologer", status="approved", accepting_now=True)
        ReferralCode.objects.create(profile_id=TEST_USER, kind="seeker", code="AB23")
        got = api_client.post("/v1/profiles/me/delete/", {"confirm": "delete"}, format="json",
                              **_auth(sign_hs256, TEST_USER))
        assert got.status_code == 200
        me = Profile.objects.get(pk=TEST_USER)
        assert me.name == services.DELETED_NAME and me.phone.startswith("deleted-")
        assert me.bio is None and me.birth_place is None and me.username is None and me.avatar_url is None
        assert me.blocked_at is not None
        assert not content.public_content().filter(pk=post.pk).exists()
        c = Consultant.objects.get(profile_id=TEST_USER)
        assert c.status == "blocked" and not c.accepting_now
        assert not ReferralCode.objects.get(profile_id=TEST_USER).active

    def test_the_phone_can_sign_up_again(self, people):
        services.delete_account(TEST_USER)
        Profile.objects.create(id=uuid.uuid4(), phone="9000000001", name="Ritu again")


class TestBlock:
    def test_a_blocked_persons_posts_and_comments_are_hidden_from_the_blocker(self, api_client, sign_hs256,
                                                                               hs256_mode, people):
        post = content.publish_content(OTHER_USER, "", kind="post", caption="Hello")
        mine = content.publish_content(TEST_USER, "", kind="post", caption="Mine")
        content.add_comment(mine.id, OTHER_USER, "Nice")
        DmBlock.objects.create(blocker_id=TEST_USER, blocked_id=OTHER_USER)
        me = _auth(sign_hs256, TEST_USER)
        feed = [r["id"] for r in api_client.get("/v1/content/feed/for-you/", **me).json()["results"]]
        assert str(post.id) not in feed and str(mine.id) in feed
        assert api_client.get(f"/v1/content/{mine.id}/comments/", **me).json() == []
        # Everybody else still sees them.
        anon = [r["id"] for r in api_client.get("/v1/content/feed/for-you/").json()["results"]]
        assert str(post.id) in anon
