"""Payouts P1: earnings by period (apps/consultants/earnings.py).

The rules under test are the ones the monthly payout will rely on: IST
month and financial-year edges, a booking counting in the month of its
session, upcoming money kept out of every total, and the source split.
"""

from datetime import date, datetime, timedelta, timezone as dt_tz

import pytest

from apps.consultants import earnings
from apps.consultants.models import Booking, EarningsLedger

from .test_consultants import (  # noqa: F401 — fixtures are used by name
    PRO,
    auth,
    catalogue,
    money_tables,
    pro_token,
    roster,
    seeker_token,
    SEEKER,
)

UTC = dt_tz.utc


def at(y, m, d, hh=12, mm=0):
    """A UTC instant."""
    return datetime(y, m, d, hh, mm, tzinfo=UTC)


def row(net_rupees, when, *, kind="Tara · 5 min chat", booking=None, fee=True):
    """One ledger row; `net_rupees` negative for a reversal."""
    net = int(round(net_rupees * 100))
    gross = round(net / 0.82) if fee else net
    return EarningsLedger.objects.create(
        consultant_id=PRO,
        booking=booking,
        gross_paise=gross,
        fee_bps=1800 if fee else 0,
        fee_paise=gross - net,
        net_paise=net,
        kind=kind,
        created_at=when,
    )


def booking(service, starts):
    return Booking.objects.create(
        seeker_id=SEEKER,
        consultant_id=PRO,
        service=service,
        starts_at=starts,
        duration_mins=20,
        amount_paise=149900,
        mode="call",
        status="confirmed",
    )


def total(result, source=None):
    if source is None:
        return result["net_paise"]
    return next(s for s in result["by_source"] if s["source"] == source)["net_paise"]


# ── periods ──────────────────────────────────────────────────────────────────


class TestPeriods:
    def test_months(self):
        assert earnings.period("this_month", date(2026, 10, 3)) == (date(2026, 10, 1), date(2026, 11, 1))
        assert earnings.period("last_month", date(2026, 10, 3)) == (date(2026, 9, 1), date(2026, 10, 1))

    def test_last_month_in_january_is_last_year(self):
        assert earnings.period("last_month", date(2027, 1, 5)) == (date(2026, 12, 1), date(2027, 1, 1))

    def test_financial_year_turns_on_1_april(self):
        assert earnings.period("fy", date(2026, 3, 31)) == (date(2025, 4, 1), date(2026, 4, 1))
        assert earnings.period("fy", date(2026, 4, 1)) == (date(2026, 4, 1), date(2027, 4, 1))
        assert earnings.period("last_fy", date(2026, 10, 3)) == (date(2025, 4, 1), date(2026, 4, 1))

    def test_custom_is_inclusive(self):
        assert earnings.period("custom", date(2026, 10, 3), "2026-09-01", "2026-09-30") == (
            date(2026, 9, 1),
            date(2026, 10, 1),
        )

    @pytest.mark.parametrize(
        "key,lo,hi",
        [("custom", "2026-09-30", "2026-09-01"), ("custom", "yesterday", "2026-09-01"), ("weekly", None, None)],
    )
    def test_bad_ranges_refuse(self, key, lo, hi):
        with pytest.raises(earnings.BadRange):
            earnings.period(key, date(2026, 10, 3), lo, hi)

    def test_lifetime_is_unbounded(self):
        assert earnings.period("lifetime", date(2026, 10, 3)) == (None, None)


# ── what counts where ────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestSummary:
    def test_the_month_ends_at_midnight_ist_not_utc(self, roster):
        row(100, at(2026, 9, 30, 18, 29))  # 23:59 IST, 30 Sep
        row(200, at(2026, 9, 30, 18, 31))  # 00:01 IST, 1 Oct
        now = at(2026, 10, 15)
        assert total(earnings.summary(PRO, "last_month", now=now)) == 10000
        assert total(earnings.summary(PRO, "this_month", now=now)) == 20000

    def test_a_booking_counts_in_the_month_of_its_session(self, roster):
        _, service = roster
        b = booking(service, at(2026, 10, 15, 4, 30))  # 10:00 IST, 15 Oct
        row(1229.18, at(2026, 9, 30), booking=b, kind="Tara · 20 min")

        before = earnings.summary(PRO, "this_month", now=at(2026, 10, 10))
        assert total(before) == 0
        assert before["upcoming_paise"] == 122918
        assert total(earnings.summary(PRO, "last_month", now=at(2026, 10, 10))) == 0

        after = earnings.summary(PRO, "this_month", now=at(2026, 10, 20))
        assert total(after, "bookings") == 122918
        assert after["upcoming_paise"] == 0
        assert total(earnings.summary(PRO, "last_month", now=at(2026, 10, 20))) == 0

    def test_a_decline_before_the_session_cancels_in_the_same_month(self, roster):
        _, service = roster
        b = booking(service, at(2026, 10, 15, 4, 30))
        row(1229.18, at(2026, 9, 30), booking=b)
        row(-1229.18, at(2026, 10, 2), booking=b, kind="Reversed · declined")
        result = earnings.summary(PRO, "this_month", now=at(2026, 10, 20))
        assert total(result, "bookings") == 122918
        assert total(result, "reversals") == -122918
        assert total(result) == 0
        assert total(earnings.summary(PRO, "last_month", now=at(2026, 10, 20))) == 0

    def test_sources(self, roster):
        row(410, at(2026, 10, 2))
        row(69, at(2026, 10, 3), kind="Referral cashback · 10% on order 1a2b", fee=False)
        row(-53.30, at(2026, 10, 4), kind="Reversal · call never connected")
        result = earnings.summary(PRO, "this_month", now=at(2026, 10, 15))
        assert total(result, "sessions") == 41000
        assert total(result, "shop") == 6900
        assert total(result, "reversals") == -5330
        assert total(result) == 41000 + 6900 - 5330
        assert result["count"] == 3
        shop = next(s for s in result["by_source"] if s["source"] == "shop")
        assert shop["fee_paise"] == 0

    def test_pay_day_is_the_7th_of_the_next_month(self, roster):
        now = at(2026, 10, 15)
        assert earnings.summary(PRO, "this_month", now=now)["pays_on"] == "2026-11-07"
        assert earnings.summary(PRO, "last_month", now=now)["pays_on"] == "2026-10-07"
        assert earnings.summary(PRO, "fy", now=now)["pays_on"] is None

    def test_financial_year_and_lifetime(self, roster):
        row(100, at(2026, 3, 31, 12))  # FY 2025-26
        row(200, at(2026, 4, 1, 12))  # FY 2026-27
        now = at(2026, 10, 15)
        assert total(earnings.summary(PRO, "fy", now=now)) == 20000
        assert total(earnings.summary(PRO, "last_fy", now=now)) == 10000
        assert total(earnings.summary(PRO, "lifetime", now=now)) == 30000

    def test_last_seven_days(self, roster):
        row(100, at(2026, 10, 15, 6))
        row(50, at(2026, 10, 15, 8))
        row(20, at(2026, 10, 9, 6))
        row(999, at(2026, 10, 8, 6))  # eight days back: outside
        days = earnings.summary(PRO, "lifetime", now=at(2026, 10, 15, 12))["last_7_days"]
        assert [d["date"] for d in days][0] == "2026-10-09"
        assert [d["date"] for d in days][-1] == "2026-10-15"
        assert days[-1]["net_paise"] == 15000
        assert days[0]["net_paise"] == 2000
        assert sum(d["net_paise"] for d in days) == 17000

    def test_other_consultants_rows_never_count(self, roster):
        row(100, at(2026, 10, 2))
        assert total(earnings.summary(SEEKER, "lifetime", now=at(2026, 10, 15))) == 0


@pytest.mark.django_db
class TestRows:
    def test_pages_newest_first(self, roster):
        first = row(1, at(2026, 10, 1))
        second = row(2, at(2026, 10, 2))
        third = row(3, at(2026, 10, 3))
        now = at(2026, 10, 15)
        page = earnings.rows(PRO, "this_month", limit=2, now=now)
        assert [r["id"] for r in page["rows"]] == [str(third.id), str(second.id)]
        assert page["next_offset"] == 2
        rest = earnings.rows(PRO, "this_month", offset=2, limit=2, now=now)
        assert [r["id"] for r in rest["rows"]] == [str(first.id)]
        assert rest["next_offset"] is None


# ── the API ──────────────────────────────────────────────────────────────────


@pytest.mark.django_db
class TestApi:
    def test_summary_is_the_owners_alone(self, api_client, pro_token, seeker_token, roster):
        url = f"/v1/consultants/{PRO}/earnings/summary/?range=lifetime"
        assert api_client.get(url, **auth(pro_token)).status_code == 200
        assert api_client.get(url, **auth(seeker_token)).status_code == 403
        assert api_client.get(url).status_code == 401

    def test_summary_shape(self, api_client, pro_token, roster):
        from django.utils import timezone

        row(410, timezone.now() - timedelta(minutes=5))
        body = api_client.get(
            f"/v1/consultants/{PRO}/earnings/summary/?range=this_month", **auth(pro_token)
        ).json()
        assert body["net_paise"] == 41000
        assert [s["source"] for s in body["by_source"]] == ["sessions", "bookings", "shop", "reversals"]
        assert len(body["last_7_days"]) == 7
        assert body["pays_on"].endswith("-07")

    def test_a_bad_range_is_a_400_with_a_reason(self, api_client, pro_token, roster):
        response = api_client.get(
            f"/v1/consultants/{PRO}/earnings/summary/?range=custom&from=2026-09-30&to=2026-09-01",
            **auth(pro_token),
        )
        assert response.status_code == 400
        assert "after the end date" in str(response.json())

    def test_rows_with_a_range_are_paged(self, api_client, pro_token, roster):
        from django.utils import timezone

        row(1, timezone.now() - timedelta(minutes=2))
        body = api_client.get(
            f"/v1/consultants/{PRO}/earnings/?range=lifetime&limit=10", **auth(pro_token)
        ).json()
        assert set(body) == {"rows", "next_offset"}
        assert body["rows"][0]["source"] == "sessions"

    def test_rows_without_a_range_stay_a_list(self, api_client, pro_token, roster):
        """Apps built before 3 Oct read a bare list."""
        from django.utils import timezone

        row(1, timezone.now() - timedelta(minutes=2))
        body = api_client.get(f"/v1/consultants/{PRO}/earnings/", **auth(pro_token)).json()
        assert isinstance(body, list) and len(body) == 1
