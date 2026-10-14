"""The japa and sadhana streak (14 Oct 2026, Phase 15c): a day counts on
a finished japa or an aarti; the streak breaks after a missed IST day and
not before."""

from datetime import datetime, timezone as tz

import pytest

from apps.bhakti import streak
from apps.bhakti.models import SadhanaDay

from .conftest import OTHER_USER, make_claims

ME = "11111111-1111-1111-1111-111111111111"


def at(day, hour_ist):
    """A UTC instant for <day> at <hour_ist> o'clock IST (Oct 2026)."""
    return datetime(2026, 10, day, hour_ist, 0, tzinfo=tz.utc) - streak.IST


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def me(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=ME))


@pytest.fixture
def other(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=OTHER_USER))


@pytest.mark.django_db
class TestStreak:
    def test_consecutive_days_count_and_one_day_counts_once(self):
        streak.mark(ME, "japa", 108, now=at(10, 7))
        streak.mark(ME, "aarti", now=at(10, 19))
        s = streak.mark(ME, "japa", 11, now=at(11, 6))
        assert s == {"current": 2, "best": 2, "today": True}
        row = SadhanaDay.objects.get(profile_id=ME, day="2026-10-10")
        assert row.japa_rounds == 108 and row.aarti is True

    def test_alive_through_today_and_broken_after_a_missed_day(self):
        streak.mark(ME, "japa", now=at(10, 7))
        streak.mark(ME, "japa", now=at(11, 7))
        # 12 Oct, late evening IST: nothing yet today, the run still stands.
        assert streak.summary(ME, now=at(12, 23)) == {"current": 2, "best": 2, "today": False}
        # 13 Oct: the 12th passed with nothing. Broken.
        assert streak.summary(ME, now=at(13, 1))["current"] == 0
        assert streak.summary(ME, now=at(13, 1))["best"] == 2

    def test_the_day_is_ist_not_utc(self):
        # 00:30 IST on the 11th is still the 10th in UTC.
        streak.mark(ME, "japa", now=at(10, 21))
        streak.mark(ME, "japa", now=datetime(2026, 10, 10, 19, 0, tzinfo=tz.utc))  # 00:30 IST, 11 Oct
        assert streak.summary(ME, now=at(11, 9))["current"] == 2

    def test_api_marks_and_reads(self, api_client, me, other):
        made = api_client.post("/v1/bhakti/streak/", {"kind": "aarti"}, format="json", **auth(me))
        assert made.status_code == 200 and made.json()["current"] == 1
        assert api_client.post("/v1/bhakti/streak/", {"kind": "puja"}, format="json", **auth(me)).status_code == 400
        theirs = api_client.get(f"/v1/bhakti/streak/{ME}/", **auth(other)).json()
        assert theirs == {"current": 1, "best": 1}
        assert api_client.get("/v1/bhakti/streak/").status_code == 401
