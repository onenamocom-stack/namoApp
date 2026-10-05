"""Your followers and whom you follow, by name (5 Oct 2026)."""

import uuid

import pytest
from rest_framework.test import APIClient

from apps.consultants.models import Consultant
from apps.profiles.models import Profile
from apps.reactions.models import Reaction
from tests.conftest import TEST_USER, make_claims

ME = uuid.UUID(TEST_USER)
FAN = uuid.uuid4()
PRO = uuid.uuid4()


@pytest.fixture
def people(db):
    for pid, name in ((ME, "Me"), (FAN, "A Fan"), (PRO, "An Astrologer")):
        Profile.objects.create(id=pid, phone=str(pid)[:15], name=name)
    Consultant.objects.create(profile_id=PRO, category="Astrologer", status="approved")
    Reaction.objects.create(actor_id=FAN, kind=Reaction.Kind.FOLLOW,
                            target_type=Reaction.TargetType.PROFILE, target_id=ME)
    Reaction.objects.create(actor_id=ME, kind=Reaction.Kind.FOLLOW,
                            target_type=Reaction.TargetType.CONSULTANT, target_id=PRO)


@pytest.fixture
def me(sign_hs256, hs256_mode):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {sign_hs256(make_claims())}")
    return c


def test_my_followers_by_name(me, people):
    items = me.get("/v1/content/follows/followers/").json()["items"]
    assert [i["name"] for i in items] == ["A Fan"]


def test_whom_i_follow_marks_the_consultant(me, people):
    items = me.get("/v1/content/follows/following/").json()["items"]
    assert items == [{"id": str(PRO), "name": "An Astrologer", "avatar_url": None, "is_consultant": True}]


def test_signed_out_reads_nothing(people):
    assert APIClient().get("/v1/content/follows/followers/").status_code in (401, 403)
