"""The two steps of the Content module (Rahul, 17 Oct 2026; docs/01 §12).

  step 1  100 followers, 10 live videos, an account 30 days old. Granted
          on its own the moment the person asks with all three met
          (`profiles.referrer`): referral earnings, no pay on views.
  step 2  500 followers, and in the last 90 days 3 videos (Rahul, 17 Oct;
          it was 10 the same day) and 100,000
          views (every view, not only engaged ones). Opens the request;
          the console approves (`profiles.influencer`): pay on views.

`progress` is what the completion bars draw: each condition with what is
needed and what the person has.
"""

from django.db.models import Sum
from django.utils import timezone

STEP1 = {"followers": 100, "videos": 10, "days": 30}
STEP2 = {"followers": 500, "videos_90d": 3, "views_90d": 100_000}
WINDOW_DAYS = 90


def _counts(profile_id, today):
    from apps.content.models import Content, ContentKind, ContentStatus, ContentView
    from apps.content.services import follow_counts

    from .models import Profile

    since = today - timezone.timedelta(days=WINDOW_DAYS)
    videos = Content.objects.filter(author_id=profile_id, kind=ContentKind.CLIP, status=ContentStatus.LIVE)
    joined = Profile.objects.filter(pk=profile_id).values_list("created_at", flat=True).first()
    views = ContentView.objects.filter(content__author_id=profile_id, day__gte=since) \
        .aggregate(n=Sum("views"))["n"] or 0
    return {
        "followers": follow_counts(profile_id)["followers"],
        "videos": videos.count(),
        "videos_90d": videos.filter(created_at__date__gte=since).count(),
        "views_90d": int(views),
        "days": (timezone.now() - joined).days if joined else 0,
    }


LABELS = {
    "followers": "Followers",
    "videos": "Videos live",
    "days": "Days since you joined",
    "videos_90d": "Videos in the last 90 days",
    "views_90d": "Views in the last 90 days",
}


def _rows(need, have):
    return [{"key": k, "label": LABELS[k], "need": n, "have": have[k], "done": have[k] >= n}
            for k, n in need.items()]


def progress(profile_id, today=None):
    today = today or timezone.localdate()
    have = _counts(profile_id, today)
    step1, step2 = _rows(STEP1, have), _rows(STEP2, have)
    return {
        "step1": {"conditions": step1, "met": all(r["done"] for r in step1)},
        "step2": {"conditions": step2, "met": all(r["done"] for r in step2)},
    }
