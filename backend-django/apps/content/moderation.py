"""The daily moderation queue's two finders (14 Oct 2026, Phase 15d).

Reports are the queue's first source and live in `Report`. These two catch
what nobody reported, at the moment it is written:

- **A link from a new account.** An account under seven days old posting or
  commenting a link — the usual shape of spam on a new network.
- **The same text, again and again.** One person writing the same words
  three times or more in a day. Different people writing the same words is
  not flagged: "Jai Shri Ram" from a thousand devotees is the network
  working, not spam.

A flag is never a verdict, as a report is not: nothing is hidden until an
admin decides in the console (`ModerationFlag`). Finding never raises — a
post that published must not fail because the finder did.
"""

import logging
import re
from datetime import timedelta

from django.db import IntegrityError
from django.utils import timezone

logger = logging.getLogger(__name__)

NEW_ACCOUNT = timedelta(days=7)
REPEAT_WINDOW = timedelta(days=1)
REPEATS = 3

LINK = re.compile(
    r"(https?://|www\.|wa\.me/|t\.me/|bit\.ly/"
    r"|\b[a-z0-9-]{2,}\.(com|in|net|org|me|link|xyz|shop|site|online|info|io|co)\b)",
    re.IGNORECASE,
)


def has_link(text):
    return bool(text and LINK.search(text))


def _new_account(profile_id, now):
    from apps.profiles.models import Profile

    joined = Profile.objects.filter(pk=profile_id).values_list("created_at", flat=True).first()
    return joined is not None and now - joined < NEW_ACCOUNT


def _flag(kind, target_type, target_id, subject_id, text):
    from .models import ModerationFlag

    try:
        ModerationFlag.objects.create(
            kind=kind, target_type=target_type, target_id=target_id,
            subject_id=subject_id, excerpt=(text or "")[:280],
        )
    except IntegrityError:
        pass  # already in the queue


def _scan(target_type, row, text, same_by_author):
    now = timezone.now()
    if has_link(text) and _new_account(row.author_id, now):
        _flag("new_link", target_type, row.pk, row.author_id, text)
    if text and len(text.strip()) >= 4:
        n = same_by_author.filter(created_at__gte=now - REPEAT_WINDOW).count()
        if n >= REPEATS:
            _flag("repeated", target_type, row.pk, row.author_id, text)


def scan_post(row):
    """After a post is written."""
    try:
        from .models import Content

        text = " ".join(t for t in (row.title, row.caption, row.body) if t)
        same = Content.objects.filter(author_id=row.author_id)
        if row.caption:
            same = same.filter(caption__iexact=row.caption)
        elif row.body:
            same = same.filter(body__iexact=row.body)
        else:
            same = same.none()
        _scan("post", row, text, same)
    except Exception:  # noqa: BLE001 — a finder never blocks a write
        logger.exception("[moderation] post scan failed")


def scan_comment(row):
    """After a comment on a post is written."""
    try:
        from .models import Comment

        same = Comment.objects.filter(author_id=row.author_id, body__iexact=row.body)
        _scan("comment", row, row.body, same)
    except Exception:  # noqa: BLE001
        logger.exception("[moderation] comment scan failed")


def scan_bhakti_comment(row):
    """After a comment on a Bhakti picture is written."""
    try:
        from apps.bhakti.models import BhaktiComment

        same = BhaktiComment.objects.filter(author_id=row.author_id, body__iexact=row.body)
        _scan("bhakti_comment", row, row.body, same)
    except Exception:  # noqa: BLE001
        logger.exception("[moderation] bhakti comment scan failed")
