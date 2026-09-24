"""Writing and reading one person's alerts."""

import logging

from django.db import IntegrityError
from django.utils import timezone

from .models import Notification

logger = logging.getLogger("apps.notifications")


def push(profile_id, *, kind, title, body=None, ref_type=None, ref_id=None,
         dedupe_key=None):
    """Tell somebody something. NEVER RAISES.

    A notification that fails must not undo the thing it was announcing —
    a referral that was credited and went unannounced is recoverable by
    looking at the wallet; a referral rolled back because the alert failed
    is a bug the seeker cannot see the cause of. Every caller here is on
    the far side of its own commit for the same reason.
    """
    try:
        return Notification.objects.create(
            profile_id=profile_id, kind=kind, title=title, body=body,
            ref_type=ref_type, ref_id=ref_id, dedupe_key=dedupe_key,
        )
    except IntegrityError:
        # The dedupe key. A retried job saying the same thing twice is the
        # normal case, not an error.
        return None
    except Exception as exc:  # noqa: BLE001
        logger.error("[notify] %s for %s failed: %s", kind, profile_id, exc)
        return None


def list_for(profile_id, *, after=None, limit=50, unread_only=False):
    qs = Notification.objects.filter(profile_id=profile_id)
    if unread_only:
        qs = qs.filter(read_at__isnull=True)
    if after:
        # The poller's "anything since this one". Keyed on created_at and
        # id together so two alerts written in the same tick cannot hide
        # each other.
        anchor = Notification.objects.filter(pk=after).first()
        if anchor is not None:
            qs = qs.filter(created_at__gt=anchor.created_at)
    return list(qs[:limit])


def unread_count(profile_id):
    return Notification.objects.filter(
        profile_id=profile_id, read_at__isnull=True
    ).count()


def mark_read(profile_id, ids=None):
    """Mark some, or all. Returns how many actually moved — already-read
    rows are not touched, so a client that re-marks on every poll does not
    keep rewriting the same timestamps."""
    qs = Notification.objects.filter(profile_id=profile_id, read_at__isnull=True)
    if ids:
        qs = qs.filter(pk__in=ids)
    return qs.update(read_at=timezone.now())


def row(notification):
    return {
        "id": str(notification.id),
        "kind": notification.kind,
        "title": notification.title,
        "body": notification.body,
        "ref_type": notification.ref_type,
        "ref_id": notification.ref_id,
        "read": notification.read_at is not None,
        "created_at": notification.created_at.isoformat(),
    }
