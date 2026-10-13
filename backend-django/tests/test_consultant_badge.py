"""The consultant badge — Pro, Expert or Master, set in the console (13 Oct
2026, Rahul). It replaced the paid-session milestones in the app."""

import pytest
from django.db import IntegrityError, transaction

from apps.consultants.models import Consultant

from .test_consultants import (  # noqa: F401 — fixtures are used by name
    PRO,
    auth,
    catalogue,
    money_tables,
    pro_token,
    roster,
)


@pytest.mark.django_db
class TestBadge:
    def test_everyone_starts_at_pro(self, api_client, pro_token, roster):
        assert api_client.get(f"/v1/consultants/{PRO}/").json()["badge"] == "pro"
        listed = next(c for c in api_client.get("/v1/consultants/").json() if c["profile_id"] == PRO)
        assert listed["badge"] == "pro"
        assert api_client.get("/v1/consultants/me/", **auth(pro_token)).json()["badge"] == "pro"

    def test_the_console_value_is_what_seekers_read(self, api_client, roster):
        Consultant.objects.filter(pk=PRO).update(badge="master")
        assert api_client.get(f"/v1/consultants/{PRO}/").json()["badge"] == "master"

    def test_only_the_three_badges(self, roster):
        with pytest.raises(IntegrityError), transaction.atomic():
            Consultant.objects.filter(pk=PRO).update(badge="rising")
