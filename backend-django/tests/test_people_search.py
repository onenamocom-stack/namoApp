"""Search's People tab (14 Oct 2026, Rahul): by name or username, only
people the public surfaces already show (01-PRD privacy; the same rule as
public_profile), never a blocked account."""

import pytest
from django.utils import timezone

from apps.profiles.models import Profile

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

URL = "/v1/profiles/search/"


@pytest.mark.django_db
class TestPeopleSearch:
    def test_finds_posters_and_pros_not_silent_seekers(self, api_client, seeker_token, second_seeker_token, roster):
        Profile.objects.filter(pk=SEEKER).update(name="Tara Verma", username="taraverma")
        Profile.objects.filter(pk=SECOND_SEEKER).update(name="Tara Silent")
        # Before posting, Tara Verma is not findable.
        assert api_client.get(f"{URL}?q=tara", **auth(second_seeker_token)).json()["items"] == []
        _publish(api_client, seeker_token, kind="post", caption="hello")
        got = api_client.get(f"{URL}?q=tara", **auth(second_seeker_token)).json()["items"]
        assert [g["id"] for g in got] == [SEEKER]
        assert got[0]["username"] == "taraverma" and "phone" not in got[0]
        by_handle = api_client.get(f"{URL}?q=@taraver", **auth(second_seeker_token)).json()["items"]
        assert [g["id"] for g in by_handle] == [SEEKER]

    def test_an_approved_pro_is_found_and_marked(self, api_client, seeker_token, roster):
        name = Profile.objects.get(pk=APPROVED).name
        got = api_client.get(f"{URL}?q={name.split()[0]}", **auth(seeker_token)).json()["items"]
        assert any(g["id"] == APPROVED and g["is_consultant"] for g in got)

    def test_blocked_and_short_queries(self, api_client, seeker_token, second_seeker_token, roster):
        Profile.objects.filter(pk=SEEKER).update(name="Tara Verma")
        _publish(api_client, seeker_token, kind="post", caption="hello")
        Profile.objects.filter(pk=SEEKER).update(blocked_at=timezone.now())
        assert api_client.get(f"{URL}?q=tara", **auth(second_seeker_token)).json()["items"] == []
        assert api_client.get(f"{URL}?q=t", **auth(second_seeker_token)).json()["items"] == []
        assert api_client.get(f"{URL}?q=tara").status_code == 401
