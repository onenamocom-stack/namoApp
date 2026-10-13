"""A consultant editing their own profile (13 Oct 2026, Rahul): the direct
fields save at once; category, credentials and degree wait for the console."""

import uuid

import pytest

from apps.consultants import profile_edit
from apps.consultants.models import Consultant, ProfileReview
from apps.media.models import MediaAsset

from .test_consultants import (  # noqa: F401 — fixtures are used by name
    PRO,
    SEEKER,
    auth,
    catalogue,
    money_tables,
    pro_token,
    roster,
    seeker_token,
)

EDIT = "/v1/consultants/me/profile/"
REVIEW = "/v1/consultants/me/review/"


def document(owner=PRO):
    return MediaAsset.objects.create(
        owner=str(owner), kind=MediaAsset.Kind.DOCUMENT, bucket_key=f"docs/{uuid.uuid4()}.pdf",
        mime="application/pdf", size_bytes=1000, status=MediaAsset.Status.READY,
    )


@pytest.mark.django_db
class TestDirectEdit:
    def test_saves_only_what_was_sent(self, api_client, pro_token, roster):
        before = Consultant.objects.get(pk=PRO)
        r = api_client.patch(
            EDIT,
            {"specialization": " Vedic Astrology, Numerology ", "experience_yrs": 12,
             "languages": ["Hindi", "English", "Hindi"]},
            format="json", **auth(pro_token),
        )
        assert r.status_code == 200
        assert r.json()["specialization"] == "Vedic Astrology, Numerology"
        c = Consultant.objects.get(pk=PRO)
        assert c.experience_yrs == 12
        assert c.languages == ["Hindi", "English"]
        assert c.bio == before.bio and c.category == before.category

    def test_blank_specialization_refused(self, api_client, pro_token, roster):
        r = api_client.patch(EDIT, {"specialization": "  "}, format="json", **auth(pro_token))
        assert r.status_code == 400

    def test_category_cannot_ride_along(self, api_client, pro_token, roster):
        before = Consultant.objects.get(pk=PRO).category
        api_client.patch(EDIT, {"category": "Tarot", "bio": "New words"}, format="json", **auth(pro_token))
        c = Consultant.objects.get(pk=PRO)
        assert c.category == before and c.bio == "New words"

    def test_not_a_consultant(self, api_client, seeker_token, roster):
        r = api_client.patch(EDIT, {"bio": "x"}, format="json", **auth(seeker_token))
        assert r.status_code == 404


@pytest.mark.django_db
class TestReview:
    def test_none_until_sent(self, api_client, pro_token, roster):
        assert api_client.get(REVIEW, **auth(pro_token)).json() == {"status": "none"}

    def test_waits_for_the_console(self, api_client, pro_token, roster):
        before = Consultant.objects.get(pk=PRO)
        scan = document()
        r = api_client.put(
            REVIEW,
            {"category": "Astrologer, Tarot", "credentials": ["Jyotish Visharad"],
             "degree": "Jyotish Acharya, BHU", "degree_asset_id": str(scan.pk)},
            format="json", **auth(pro_token),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "pending" and r.json()["new_certificate"] is True
        c = Consultant.objects.get(pk=PRO)
        assert c.category == before.category and c.credentials == before.credentials

        review = ProfileReview.objects.get(pk=PRO)
        assert profile_edit.decide(review, True, "op") is True
        c = Consultant.objects.get(pk=PRO)
        assert c.category == "Astrologer, Tarot"
        assert c.credentials == ["Jyotish Visharad"]
        assert c.degree == "Jyotish Acharya, BHU"
        assert c.degree_asset_id == scan.pk
        assert api_client.get(REVIEW, **auth(pro_token)).json()["status"] == "approved"
        assert profile_edit.decide(ProfileReview.objects.get(pk=PRO), True, "op") is False

    def test_rejected_keeps_the_profile_and_says_why(self, api_client, pro_token, roster):
        before = Consultant.objects.get(pk=PRO).category
        api_client.put(REVIEW, {"category": "Tarot"}, format="json", **auth(pro_token))
        assert profile_edit.decide(ProfileReview.objects.get(pk=PRO), False, "op", "Send the certificate") is True
        assert Consultant.objects.get(pk=PRO).category == before
        body = api_client.get(REVIEW, **auth(pro_token)).json()
        assert body["status"] == "rejected" and body["review_note"] == "Send the certificate"

    def test_nothing_changed_is_refused(self, api_client, pro_token, roster):
        c = Consultant.objects.get(pk=PRO)
        r = api_client.put(
            REVIEW,
            {"category": c.category, "credentials": c.credentials or [], "degree": c.degree or ""},
            format="json", **auth(pro_token),
        )
        assert r.status_code == 400

    def test_someone_elses_scan_is_refused(self, api_client, pro_token, roster):
        r = api_client.put(
            REVIEW, {"category": "Tarot", "degree_asset_id": str(document(owner=SEEKER).pk)},
            format="json", **auth(pro_token),
        )
        assert r.status_code == 404
