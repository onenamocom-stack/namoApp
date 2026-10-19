"""A Pro's day, scored (19 Oct 2026, Rahul: "a daily report. For how much
time he was live in the day. Number of call received. No of calls attended.
Score them out of 100 ... Extra weight for video call. How many customer
recharged. His tag").

  live        time the Online switch was on, from `PresenceSwitch` (kept
              from 19 Oct 2026; earlier days read 0)
  received    session requests that day, plus the calls missed while busy
              (`MissedCall`), by chat, audio and video
  attended    the requests they accepted
  score       70% calls, attended over received, a video weighing 2, an
              audio call 1.5, a chat 1; 30% live time, 8 hours full marks.
              A day with no requests and the switch on counts the calls
              part full: nobody called, which is not the Pro's doing
  recharged   different customers who reached this Pro that day and then
              topped up their wallet the same day
  badge       Pro, Expert or Master, from the console

Days are whole IST calendar days, 00:00 to 24:00. At 10:00 IST the next
morning `write_day` keeps a row per approved Pro in `ProDayReport` for the
console and sends each their own numbers (Rahul, same day: "00:00 se 24:00
... notification next day 10 baje"; it was 23:00 the same night).
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Q
from django.utils import timezone

from .models import Consultant, ConsultantStatus, PresenceSwitch, ProDayReport

IST = ZoneInfo("Asia/Kolkata")
WEIGHT = {"chat": 1.0, "audio": 1.5, "video": 2.0}
FULL_DAY_SECONDS = 8 * 3600
CALLS_SHARE = 0.7
NOTIFY_AT = time(10, 0)  # IST, the morning after the day


def ist_day(now=None):
    return (now or timezone.now()).astimezone(IST).date()


def _window(day, now=None):
    start = datetime.combine(day, time.min, tzinfo=IST)
    end = min(start + timedelta(days=1), now or timezone.now())
    return start, end


def log_switch(consultant_id, on, at=None):
    """The Online switch moved. Called only on a real change."""
    PresenceSwitch.objects.create(consultant_id=consultant_id, on=bool(on), at=at or timezone.now())


def live_seconds(consultant_id, day, now=None):
    start, end = _window(day, now)
    if end <= start:
        return 0
    before = (PresenceSwitch.objects.filter(consultant_id=consultant_id, at__lt=start)
              .order_by("-at").values_list("on", flat=True).first())
    on_since = start if before else None
    total = 0.0
    for on, at in (PresenceSwitch.objects.filter(consultant_id=consultant_id, at__gte=start, at__lt=end)
                   .order_by("at").values_list("on", "at")):
        if on and on_since is None:
            on_since = at
        elif not on and on_since is not None:
            total += (at - on_since).total_seconds()
            on_since = None
    if on_since is not None:
        total += (end - on_since).total_seconds()
    return int(total)


def _kind(mode, audio_only):
    if mode == "chat":
        return "chat"
    return "audio" if audio_only else "video"


def score(received, attended, live):
    got = sum(WEIGHT[k] * received[k] for k in WEIGHT)
    took = sum(WEIGHT[k] * attended[k] for k in WEIGHT)
    calls = took / got if got else (1.0 if live > 0 else 0.0)
    hours = min(live / FULL_DAY_SECONDS, 1.0)
    return round(100 * (CALLS_SHARE * calls + (1 - CALLS_SHARE) * hours))


def day_numbers(consultant_id, day, now=None):
    from apps.chat.models import MissedCall, Session
    from apps.wallet.models import Payment, PaymentStatus

    start, end = _window(day, now)
    received = dict.fromkeys(WEIGHT, 0)
    attended = dict.fromkeys(WEIGHT, 0)
    first_seen = {}
    for mode, audio_only, accepted_at, seeker_id, at in (
        Session.objects.filter(consultant_id=consultant_id, requested_at__gte=start, requested_at__lt=end)
        .exclude(mode="live").values_list("mode", "audio_only", "accepted_at", "seeker_id", "requested_at")
    ):
        k = _kind(mode, audio_only)
        received[k] += 1
        if accepted_at is not None:
            attended[k] += 1
        first_seen[str(seeker_id)] = min(first_seen.get(str(seeker_id), at), at)
    for mode, audio_only, seeker_id, at in (
        MissedCall.objects.filter(consultant_id=consultant_id, created_at__gte=start, created_at__lt=end)
        .values_list("mode", "audio_only", "seeker_id", "created_at")
    ):
        received[_kind(mode, audio_only)] += 1
        first_seen[str(seeker_id)] = min(first_seen.get(str(seeker_id), at), at)

    recharged = 0
    if first_seen:
        # Wallet top-ups only: a shop order or an e-book paid at the gateway
        # is not a recharge.
        paid = (Payment.objects.filter(profile_id__in=list(first_seen), status=PaymentStatus.CAPTURED,
                                       created_at__gte=start, created_at__lt=end)
                .filter(shop_order_id__isnull=True)
                .filter(Q(entitlement_sku__isnull=True) | Q(entitlement_sku=""))
                .values_list("profile_id", "created_at"))
        recharged = len({str(p) for p, at in paid if at >= first_seen.get(str(p), end)})

    live = live_seconds(consultant_id, day, now)
    badge = Consultant.objects.filter(profile_id=consultant_id).values_list("badge", flat=True).first() or "pro"
    return {
        "day": day.isoformat(),
        "live_seconds": live,
        "received": received,
        "attended": attended,
        "received_total": sum(received.values()),
        "attended_total": sum(attended.values()),
        "recharged": recharged,
        "score": score(received, attended, live),
        "badge": badge,
    }


def recent(consultant_id, days=7, now=None):
    today = ist_day(now)
    return [day_numbers(consultant_id, today - timedelta(days=i), now) for i in range(days)]


def _hm(seconds):
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h {m}m" if h else f"{m}m"


def write_day(day, *, notify=False, final=False, now=None):
    """A row per approved Pro for `day`; with `notify`, each hears theirs."""
    from apps.notifications import services as notify_service

    n = 0
    for cid in Consultant.objects.filter(status=ConsultantStatus.APPROVED).values_list("profile_id", flat=True):
        d = day_numbers(cid, day, now)
        ProDayReport.objects.update_or_create(
            consultant_id=cid, day=day,
            defaults=dict(
                live_seconds=d["live_seconds"],
                received_chat=d["received"]["chat"], received_audio=d["received"]["audio"],
                received_video=d["received"]["video"],
                attended_chat=d["attended"]["chat"], attended_audio=d["attended"]["audio"],
                attended_video=d["attended"]["video"],
                recharged=d["recharged"], score=d["score"], badge=d["badge"], final=final,
            ),
        )
        if notify and (d["received_total"] or d["live_seconds"]):
            notify_service.push(
                cid, kind="pro.daily_report", title=f"Yesterday's score: {d['score']}/100",
                body=(f"{day.strftime('%d %b')}: Online {_hm(d['live_seconds'])} · calls {d['attended_total']} of "
                      f"{d['received_total']} answered · {d['recharged']} recharged"),
                ref_type="pro_report", ref_id=None, dedupe_key=f"pro-report:{cid}:{day.isoformat()}",
            )
        n += 1
    if notify:
        ProDayReport.objects.filter(day=day).update(notified_at=now or timezone.now())
    return n


def tick(now=None):
    """From the minute sweep: at 10:00 IST, yesterday's whole day written
    for every Pro and each told theirs, once."""
    now = now or timezone.now()
    local = now.astimezone(IST)
    yesterday = local.date() - timedelta(days=1)
    if local.time() < NOTIFY_AT or ProDayReport.objects.filter(day=yesterday, notified_at__isnull=False).exists():
        return []
    return [("notified", write_day(yesterday, notify=True, final=True, now=now))]
