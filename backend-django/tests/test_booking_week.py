"""The booking calendar as a week of windows (15 Oct 2026, Rahul): each day
takes up to two windows ("9 to 12"), a customer books 20 minutes inside
one, and whole days can be blocked. The windows are stored as the 20-minute
cells the slots function already reads."""

from datetime import timedelta

import pytest

from apps.consultants import services
from apps.consultants.models import ConsultantAvailability
from apps.consultants.services import dow_of, ist_today

from .test_consultants import PRO, auth, catalogue, money_tables, pro_token, roster, seeker_token  # noqa: F401


def _week(api_client, token, days):
    return api_client.post(f"/v1/consultants/{PRO}/week/", {"days": days}, format="json", **auth(token))


@pytest.mark.django_db
class TestTheWeek:
    def test_a_window_becomes_twenty_minute_slots(self, api_client, pro_token, roster):
        got = _week(api_client, pro_token, {"1": [{"start": "09:00", "end": "12:00"},
                                                  {"start": "16:00", "end": "17:10"}]})
        assert got.status_code == 200
        cells = list(ConsultantAvailability.objects.filter(consultant_id=PRO, weekday=1)
                     .order_by("slot_time").values_list("slot_time", flat=True))
        assert len(cells) == 9 + 3  # 9:00 … 11:40, and 16:00, 16:20, 16:40 (the last 10 minutes are not a slot)
        assert got.json()["days"]["1"] == [{"from": "09:00", "to": "12:00"}, {"from": "16:00", "to": "17:00"}]
        assert got.json()["days"]["0"] == []

    def test_it_replaces_the_whole_week(self, api_client, pro_token, roster):
        _week(api_client, pro_token, {"1": [{"start": "09:00", "end": "10:00"}]})
        _week(api_client, pro_token, {"3": [{"start": "18:00", "end": "19:00"}]})
        assert set(ConsultantAvailability.objects.filter(consultant_id=PRO).values_list("weekday", flat=True)) == {3}

    @pytest.mark.parametrize("windows", [
        [{"start": "09:00", "end": "10:00"}] * 3,                                      # three
        [{"start": "09:00", "end": "09:10"}],                                          # shorter than a slot
        [{"start": "09:00", "end": "11:00"}, {"start": "10:00", "end": "12:00"}],      # overlapping
    ])
    def test_refusals(self, api_client, pro_token, roster, windows):
        assert _week(api_client, pro_token, {"2": windows}).status_code == 400

    def test_only_the_owner(self, api_client, seeker_token, roster):
        assert _week(api_client, seeker_token, {"1": []}).status_code == 403
        assert api_client.get(f"/v1/consultants/{PRO}/week/", **auth(seeker_token)).status_code == 403

    def test_customers_see_the_slots(self, api_client, pro_token, roster):
        day = ist_today() + timedelta(days=3)
        _week(api_client, pro_token, {str(dow_of(day)): [{"start": "09:00", "end": "10:00"}]})
        assert [o["slot_time"].strftime("%H:%M") for o in services.open_slots(PRO, day)] == ["09:00", "09:20", "09:40"]


@pytest.mark.django_db
class TestBlockedDates:
    def test_a_blocked_day_offers_nothing_and_comes_back(self, api_client, pro_token, roster):
        day = ist_today() + timedelta(days=3)
        _week(api_client, pro_token, {str(dow_of(day)): [{"start": "09:00", "end": "10:00"}]})
        rows = api_client.post(f"/v1/consultants/{PRO}/blocked/", {"first": day.isoformat()}, format="json",
                               **auth(pro_token)).json()
        assert rows[0]["from"] == rows[0]["to"] == day.isoformat()
        assert services.open_slots(PRO, day) == []
        api_client.post(f"/v1/consultants/{PRO}/blocked/{rows[0]['id']}/remove/", format="json", **auth(pro_token))
        assert len(services.open_slots(PRO, day)) == 3

    def test_a_past_day_is_refused(self, api_client, pro_token, roster):
        got = api_client.post(f"/v1/consultants/{PRO}/blocked/",
                              {"first": (ist_today() - timedelta(days=1)).isoformat()}, format="json",
                              **auth(pro_token))
        assert got.status_code == 400
