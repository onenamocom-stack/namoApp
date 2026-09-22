"""Analytics (stage 4).

The table was chosen over PostHog for a privacy reason, so the tests are
mostly about what does NOT end up in it. An event store that quietly
accumulates ids, free text or fingerprints is the thing we were avoiding by
not using a third party in the first place.
"""

import uuid

import pytest
from django.test import Client
from django.utils import timezone

from apps.analytics import services
from apps.analytics.models import Attribution, Event, Source

COLLECT = "/v1/events/"


def _post(rows, client=None):
    return (client or Client()).post(
        COLLECT, {"events": rows}, content_type="application/json"
    )


@pytest.mark.django_db
class TestWhatIsNotStored:
    def test_ids_are_stripped_out_of_paths(self):
        """`/consult/8f3e…` becomes `/consult/:id`. A path carrying a real
        id turns a page-view counter into a record of who looked at whom."""
        assert services.normalise_path(
            "#/consult/8f3ec0de-1111-4222-8333-444444444444"
        ) == "/consult/:id"
        assert services.normalise_path("/read/12345") == "/read/:n"
        assert services.normalise_path("/home?utm=x") == "/home"

    def test_props_keep_only_flat_values_and_only_a_few(self):
        _post([{
            "name": "reel_play", "visit_id": str(uuid.uuid4()),
            "props": {
                "seconds": 12, "muted": True, "quality": "hd",
                "nested": {"anything": "here"},
                "essay": "x" * 400,
                **{f"k{i}": i for i in range(20)},
            },
        }])
        props = Event.objects.get().props
        assert props["seconds"] == 12 and props["muted"] is True
        assert "nested" not in props, "a nested blob can carry anything"
        assert "essay" not in props, "long strings are where typed text hides"
        assert len(props) <= 12

    def test_no_ip_or_user_agent_column_exists(self):
        """Not "we do not fill it" — the column is not there to be filled
        later by somebody who thinks it would be handy."""
        fields = {f.name for f in Event._meta.get_fields()}
        for forbidden in ("ip", "ip_address", "user_agent", "ua", "fingerprint"):
            assert forbidden not in fields


@pytest.mark.django_db
class TestIngest:
    def test_a_batch_is_recorded_and_answered_202(self):
        visit = str(uuid.uuid4())
        response = _post([
            {"name": "page_view", "path": "/home", "visit_id": visit, "app": "seeker"},
            {"name": "reel_play", "path": "/reels/:id", "visit_id": visit},
        ])
        assert response.status_code == 202
        assert Event.objects.count() == 2

    def test_malformed_rows_are_dropped_not_refused(self):
        """A client that gets a 400 and retries is worse than a lost event.
        Analytics must never be able to break a screen."""
        visit = str(uuid.uuid4())
        response = _post([
            {"name": "page_view", "visit_id": visit},
            {"name": "Bad Name!", "visit_id": visit},
            {"name": "no_visit"},
            {"name": "page_view", "visit_id": "not-a-uuid"},
        ])
        assert response.status_code == 202
        assert Event.objects.count() == 1

    def test_a_giant_batch_is_capped(self):
        visit = str(uuid.uuid4())
        _post([{"name": "page_view", "visit_id": visit} for _ in range(500)])
        assert Event.objects.count() == services.MAX_BATCH

    def test_signed_out_visitors_are_counted(self):
        """Most of the question is how many people bounced BEFORE signing
        up. Requiring a session would make that unanswerable."""
        _post([{"name": "page_view", "path": "/onboarding", "visit_id": str(uuid.uuid4())}])
        assert Event.objects.get().profile_id is None

    def test_a_broken_body_still_answers_202(self):
        assert Client().post(
            COLLECT, {"events": "not a list"}, content_type="application/json"
        ).status_code == 202


@pytest.mark.django_db
class TestAttribution:
    def test_first_touch_is_never_overwritten(self):
        """Last touch would credit whoever was in front of somebody when
        they finally paid. "How many came by referral" is a first-touch
        question."""
        profile_id = uuid.uuid4()
        referrer = uuid.uuid4()
        services.remember_first_touch(profile_id, Source.REFERRAL, referrer_id=referrer)
        services.remember_first_touch(profile_id, Source.CAMPAIGN, campaign="diwali")

        row = Attribution.objects.get(profile_id=profile_id)
        assert row.source == Source.REFERRAL
        assert row.referrer_id == referrer
        assert row.campaign == ""

    def test_referral_against_organic_is_countable(self):
        for _ in range(3):
            services.remember_first_touch(uuid.uuid4(), Source.REFERRAL)
        for _ in range(7):
            services.remember_first_touch(uuid.uuid4(), Source.ORGANIC)
        counted = services.acquisition(days=1)
        assert counted["total"] == 10
        assert counted["by_source"]["referral"] == 3
        assert counted["by_source"]["organic"] == 7


@pytest.mark.django_db
class TestDashboardQueries:
    def test_page_views_and_features_are_counted_separately(self):
        visit = uuid.uuid4()
        Event.objects.create(name="page_view", path="/home", visit_id=visit)
        Event.objects.create(name="page_view", path="/home", visit_id=uuid.uuid4())
        Event.objects.create(name="reel_play", path="/home", visit_id=visit)

        paths = services.top_paths(days=1)
        assert paths[0]["path"] == "/home"
        assert paths[0]["views"] == 2

        # "Everything that is not a page view" needs no maintenance as
        # features are added.
        features = services.top_features(days=1)
        assert [f["name"] for f in features] == ["reel_play"]

    def test_sales_come_from_orders_not_from_an_event(self):
        """A blocked analytics request must not be able to lose a sale from
        the numbers."""
        figures = services.money(days=1)
        assert {"orders", "gross_paise", "topped_up_paise", "signups"} <= set(figures)

    def test_money_is_formatted_in_python_not_in_the_template(self):
        """The first cut chained `|floatformat:0|divisibleby:1` and the
        dashboard rendered "₹True". Template filters compose in ways that
        fail silently, and money is the last thing to format by guess."""
        assert services.rupees(498_600) == "₹4,986"
        assert services.rupees(498_650) == "₹4,986.50"
        assert services.rupees(0) == "₹0"
        assert services.money(days=1)["gross"].startswith("₹")


# ── the dashboard's periods and comparisons ─────────────────────────────────


@pytest.mark.django_db
class TestPeriods:
    """Calendar windows, not rolling ones.

    "How did this month go" is not "the last 30 days": on the 3rd a rolling
    window is mostly last month, and comparing two rolling windows compares
    two things that overlap.
    """

    def test_this_month_compares_against_last_month(self):
        from apps.analytics import periods

        window = periods.resolve("this_month")
        assert window["start"].day == 1
        assert window["previous_end"] == window["start"]
        # The previous window is a whole month, ending where this one begins.
        assert window["previous_start"].day == 1
        assert window["grain"] == "day"

    def test_a_year_is_bucketed_by_month_not_by_day(self):
        """365 bars is 365 columns nobody can read."""
        from apps.analytics import periods

        assert periods.resolve("this_year")["grain"] == "month"
        assert periods.resolve("last_year")["grain"] == "month"

    def test_last_year_compares_against_the_year_before(self):
        from apps.analytics import periods

        window = periods.resolve("last_year")
        assert window["end"].year == window["start"].year + 1
        assert window["previous_start"].year == window["start"].year - 1

    def test_a_running_period_says_so(self):
        from apps.analytics import periods

        assert periods.resolve("this_month")["in_progress"] is True
        assert periods.resolve("last_month")["in_progress"] is False

    def test_zero_to_something_is_not_infinity_percent(self):
        """It is a first, and the card says so rather than rendering a
        number that means nothing."""
        from apps.analytics.periods import change

        assert change(10, 0) is None
        assert change(10, None) is None
        assert change(150, 100) == 50.0
        assert change(50, 100) == -50.0


@pytest.mark.django_db
class TestSeries:
    def test_empty_buckets_are_filled_not_skipped(self):
        """A chart that skips days with no sales draws a line through the
        gap and makes a quiet week look like a busy one."""
        from apps.analytics import periods

        window = periods.resolve("last_7")
        series = services.revenue_series(window)
        assert len(series["labels"]) == 7
        assert len(series["values"]) == 7

    def test_revenue_is_charted_in_rupees_not_paise(self):
        """Paise put five zeroes on every axis label."""
        from apps.analytics import periods

        Event.objects.all().delete()
        window = periods.resolve("this_month")
        series = services.revenue_series(window)
        assert all(v < 10_000_000 for v in series["values"])

    def test_traffic_carries_both_views_and_visits(self):
        """The gap between them is whether people go deeper or bounce,
        which neither line says alone."""
        from apps.analytics import periods

        visit = uuid.uuid4()
        Event.objects.create(name="page_view", path="/home", visit_id=visit)
        Event.objects.create(name="page_view", path="/shop", visit_id=visit)
        series = services.traffic_series(periods.resolve("this_month"))
        assert sum(series["views"]) == 2
        assert sum(series["visits"]) == 1

    def test_the_headline_carries_its_comparison(self):
        from apps.analytics import periods

        cards = services.headline(periods.resolve("this_month"))
        for key in ("revenue", "orders", "signups", "visits", "views", "ai_questions"):
            assert set(cards[key]) >= {"now", "before", "change"}, key
        assert cards["revenue"]["now_text"].startswith("₹")
