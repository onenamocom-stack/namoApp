"""The japa and sadhana streak (14 Oct 2026, Phase 15c).

A day counts when the person finished a mantra's japa in Bhakti (every
repetition they asked for) or did an aarti in Darshan. Days are IST
calendar days (docs/02-TRD.md §10; IST has no DST, so the shift is a
constant). The streak is the run of consecutive counted days ending today,
or ending yesterday while today is still open: it breaks only once a whole
IST day has passed with nothing, and not before.
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from .models import SadhanaDay

IST = timedelta(hours=5, minutes=30)
KINDS = ("japa", "aarti")
MAX_ROUNDS = 1008


def ist_today(now=None):
    return ((now or timezone.now()) + IST).date()


def mark(profile_id, kind, rounds=1, now=None):
    """Count today for this person. Japa adds its rounds; aarti sets the
    flag. Marking twice in a day is harmless."""
    day = ist_today(now)
    rounds = max(1, min(int(rounds or 1), MAX_ROUNDS))
    try:
        with transaction.atomic():
            SadhanaDay.objects.get_or_create(profile_id=profile_id, day=day)
    except IntegrityError:
        pass  # a second tab marked the same day first
    rows = SadhanaDay.objects.filter(profile_id=profile_id, day=day)
    if kind == "japa":
        rows.update(japa_rounds=F("japa_rounds") + rounds)
    else:
        rows.update(aarti=True)
    return summary(profile_id, now=now)


def summary(profile_id, now=None):
    """{current, best, today}: the live run, the longest run, and whether
    today is already counted."""
    today = ist_today(now)
    days = list(
        SadhanaDay.objects.filter(profile_id=profile_id, day__lte=today)
        .order_by("-day")
        .values_list("day", flat=True)
    )
    current = 0
    if days and days[0] >= today - timedelta(days=1):
        current = 1
        for prev, day in zip(days, days[1:]):
            if prev - day != timedelta(days=1):
                break
            current += 1
    best, run = 0, 0
    for i, day in enumerate(days):
        run = run + 1 if i and days[i - 1] - day == timedelta(days=1) else 1
        best = max(best, run)
    return {"current": current, "best": best, "today": bool(days) and days[0] == today}
