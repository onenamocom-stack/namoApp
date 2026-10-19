"""A Pro's daily report (19 Oct 2026, Rahul): Online time from the switch's
moves, calls received and answered, the score, recharges, the badge."""

import uuid
from datetime import datetime, time, timedelta

import pytest
from django.utils import timezone

from apps.chat.models import MissedCall, Session
from apps.consultants import report
from apps.consultants import services as consultant_services
from apps.consultants.models import Consultant, ConsultantService, PresenceSwitch, ProDayReport
from apps.notifications.models import Notification
from apps.profiles.models import Profile
from apps.wallet.models import Payment

PRO = "aaaaaaaa-1111-2222-3333-444444444444"
DAY = datetime(2026, 10, 19).date()


def at(h, m=0, day=DAY):
    return datetime.combine(day, time(h, m), tzinfo=report.IST)


@pytest.fixture
def pro(db):
    Profile.objects.create(id=PRO, phone="9000000101", name="Pandit Ji")
    c = Consultant.objects.create(profile_id=PRO, category="Astrologer", status="approved", badge="master")
    service = ConsultantService.objects.create(
        consultant_id=PRO, band_id="11111111-2222-3333-4444-555555555555", mode="chat",
        billing="per_minute", duration_mins=1, price_paise=2000,
    )
    return c, service


def _session(service, *, mode="chat", audio_only=False, accepted=True, when=None, seeker=None):
    when = when or at(10)
    return Session.objects.create(
        seeker_id=seeker or uuid.uuid4(), consultant_id=PRO, service=service, mode=mode,
        audio_only=audio_only, rate_paise=2000, status="ended" if accepted else "declined",
        requested_at=when, accepted_at=when + timedelta(seconds=10) if accepted else None,
    )


class TestLiveTime:
    def test_adds_up_the_switch_on_spans_inside_the_day(self, pro):
        report.log_switch(PRO, True, at(9))
        report.log_switch(PRO, False, at(11, 30))
        report.log_switch(PRO, True, at(20))
        assert report.live_seconds(PRO, DAY, now=at(22)) == int(2.5 * 3600 + 2 * 3600)

    def test_a_switch_left_on_from_yesterday_counts_from_midnight(self, pro):
        report.log_switch(PRO, True, at(22, day=DAY - timedelta(days=1)))
        report.log_switch(PRO, False, at(1))
        assert report.live_seconds(PRO, DAY, now=at(23)) == 3600

    def test_the_beat_logs_only_real_changes(self, pro):
        consultant_services.touch_presence(PRO, accepting=True)
        consultant_services.touch_presence(PRO, accepting=True)
        consultant_services.touch_presence(PRO)
        consultant_services.touch_presence(PRO, accepting=False)
        assert list(PresenceSwitch.objects.order_by("at").values_list("on", flat=True)) == [True, False]


class TestScore:
    def test_video_weighs_double_and_audio_half_again(self):
        received = {"chat": 6, "audio": 2, "video": 2}
        attended = {"chat": 6, "audio": 2, "video": 0}
        # calls: (6 + 3) / (6 + 3 + 4) = 9/13; live: 4h of 8 = 0.5
        assert report.score(received, attended, 4 * 3600) == round(100 * (0.7 * 9 / 13 + 0.3 * 0.5))

    def test_no_calls_while_online_is_not_held_against_them(self):
        zero = {"chat": 0, "audio": 0, "video": 0}
        assert report.score(zero, zero, 8 * 3600) == 100
        assert report.score(zero, zero, 0) == 0


class TestTheDay:
    def test_counts_requests_answers_misses_and_recharges(self, pro):
        _, service = pro
        buyer = uuid.uuid4()
        _session(service, mode="call", audio_only=False, accepted=True, seeker=buyer, when=at(10))
        _session(service, mode="call", audio_only=True, accepted=False, when=at(11))
        _session(service, mode="chat", accepted=True, when=at(12))
        MissedCall.objects.create(consultant_id=PRO, seeker_id=uuid.uuid4(), mode="call", audio_only=False,
                                  created_at=at(13))
        # The buyer recharged after reaching this Pro; a shop payment is not a recharge.
        Payment.objects.create(profile_id=buyer, amount_paise=10000, status="captured", created_at=at(10, 5))
        Payment.objects.create(profile_id=buyer, amount_paise=5000, status="captured", created_at=at(10, 6),
                               shop_order_id=uuid.uuid4())
        d = report.day_numbers(PRO, DAY, now=at(23))
        assert d["received"] == {"chat": 1, "audio": 1, "video": 2}
        assert d["attended"] == {"chat": 1, "audio": 0, "video": 1}
        assert d["recharged"] == 1 and d["badge"] == "master"

    def test_10_ist_next_morning_writes_the_whole_day_once_and_tells_them(self, pro):
        # 00:00 to 24:00, sent at 10:00 the next morning (Rahul).
        _, service = pro
        _session(service, when=at(10))
        _session(service, when=at(23, 30))
        next_day = DAY + timedelta(days=1)
        report.tick(now=at(9, 59, day=next_day))
        assert not ProDayReport.objects.filter(day=DAY).exists()
        report.tick(now=at(10, 1, day=next_day))
        report.tick(now=at(10, 2, day=next_day))
        row = ProDayReport.objects.get(consultant_id=PRO, day=DAY)
        assert row.attended_chat == 2 and row.final and row.notified_at is not None
        assert Notification.objects.filter(profile_id=PRO, kind="pro.daily_report").count() == 1


class TestTheMonth:
    def test_scores_the_month_to_date_as_one(self, pro):
        # Rahul: "Score poore mahine ka rakhna hai. Till date."
        _, service = pro
        first = DAY.replace(day=1)
        _session(service, mode="call", audio_only=False, accepted=True, when=at(10, day=first))
        _session(service, mode="call", audio_only=False, accepted=False, when=at(10, day=DAY))
        report.log_switch(PRO, True, at(9, day=DAY))
        report.log_switch(PRO, False, at(17, day=DAY))
        m = report.month_numbers(PRO, DAY, now=at(23))
        assert m["days"] == DAY.day and m["received_total"] == 2 and m["attended_total"] == 1
        # calls 2/4 weighted; live 8h over 19 days on average
        assert m["score"] == report.score(m["received"], m["attended"], 8 * 3600 / DAY.day)

    def test_the_morning_row_and_notification_carry_it(self, pro):
        _, service = pro
        _session(service, when=at(10))
        report.tick(now=at(10, 5, day=DAY + timedelta(days=1)))
        row = ProDayReport.objects.get(consultant_id=PRO, day=DAY)
        assert row.month_score == report.month_numbers(PRO, DAY, now=at(23, 59))["score"]
        n = Notification.objects.get(profile_id=PRO, kind="pro.daily_report")
        assert n.title.startswith("October score so far")


def test_the_api_gives_the_last_seven_days(api_client, sign_hs256, hs256_mode, pro):
    from .conftest import make_claims

    token = sign_hs256(claims=make_claims(sub=PRO))
    got = api_client.get("/v1/consultants/me/report/", HTTP_AUTHORIZATION=f"Bearer {token}")
    assert got.status_code == 200
    days = got.json()["days"]
    assert len(days) == 7 and days[0]["day"] == report.ist_day().isoformat()
    assert {"live_seconds", "received", "attended", "score", "recharged", "badge"} <= set(days[0])
    assert got.json()["month"]["days"] == report.ist_day().day
    assert timezone
