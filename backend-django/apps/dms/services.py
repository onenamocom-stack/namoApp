"""The rules of person-to-person messages (docs/06 Phase 15b).

Every refusal is a sentence the app shows as it is. Identity is always the
verified caller (rule 3): no body can say who is sending.
"""

import uuid

from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.core import limits
from apps.reactions.models import Reaction

from .models import DmBlock, DmMessage, DmThread

MAX_CHARS = 2000

SELF_REFUSAL = "You cannot message yourself."
NOBODY_REFUSAL = "That person is not on NAMO."
CONSULTANT_REFUSAL = "Astrologers and experts take messages through a paid chat. Use Chat on their page."
BLOCKED_REFUSAL = "You cannot message this person."
ACCOUNT_REFUSAL = "Your account cannot send messages."
EMPTY_REFUSAL = "Write a message first."
LONG_REFUSAL = f"Keep it under {MAX_CHARS} characters."
WAIT_REFUSAL = "They have not accepted your message yet. You can send one until they do."
DECLINED_REFUSAL = "They declined your message."
NOT_YOURS = "That conversation is not yours."


class Refused(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _u(value):
    return uuid.UUID(str(value))


def _pair(x, y):
    x, y = _u(x), _u(y)
    return (x, y) if str(x) < str(y) else (y, x)


def _other(thread, me):
    return thread.b_id if _u(thread.a_id) == _u(me) else thread.a_id


def _is_member(thread, me):
    return _u(me) in (_u(thread.a_id), _u(thread.b_id))


def _follows(actor, target):
    return Reaction.objects.filter(
        actor_id=actor, target_id=target, kind=Reaction.Kind.FOLLOW,
        target_type__in=[Reaction.TargetType.PROFILE, Reaction.TargetType.CONSULTANT],
    ).exists()


def _approved_consultant(profile_id):
    from apps.consultants.models import Consultant

    return Consultant.objects.filter(profile_id=profile_id, status="approved").exists()


def blocked_between(x, y):
    return DmBlock.objects.filter(
        Q(blocker_id=x, blocked_id=y) | Q(blocker_id=y, blocked_id=x)
    ).exists()


def _profile(profile_id):
    from apps.profiles.models import Profile

    return Profile.objects.filter(pk=profile_id).first()


def start(me, to):
    """The conversation with `to`, made if there is none. A free message
    never reaches an approved consultant unless they started it or follow
    you: their paid chat is how a client reaches them (01-PRD.md §4)."""
    if _u(me) == _u(to):
        raise Refused(SELF_REFUSAL)
    other = _profile(to)
    if other is None or other.blocked_at is not None:
        raise Refused(NOBODY_REFUSAL, 404)
    a, b = _pair(me, to)
    thread = DmThread.objects.filter(a_id=a, b_id=b).first()
    if thread is not None:
        return thread
    if blocked_between(me, to):
        raise Refused(BLOCKED_REFUSAL, 403)
    if _approved_consultant(to) and not _approved_consultant(me) and not _follows(to, me):
        raise Refused(CONSULTANT_REFUSAL, 403)
    too_fast = limits.first_broken(DmThread.objects.filter(started_by=me), limits.NEW_CONVERSATIONS)
    if too_fast:
        raise Refused(too_fast, 429)
    try:
        with transaction.atomic():
            return DmThread.objects.create(
                a_id=a, b_id=b, started_by=me,
                accepted_at=timezone.now() if _follows(to, me) else None,
            )
    except IntegrityError:
        return DmThread.objects.get(a_id=a, b_id=b)


def _thread_for(me, thread_id):
    thread = DmThread.objects.filter(pk=thread_id).first()
    if thread is None or not _is_member(thread, me):
        raise Refused(NOT_YOURS, 404)
    return thread


def send(me, thread_id, body):
    text = (body or "").strip()
    if not text:
        raise Refused(EMPTY_REFUSAL)
    if len(text) > MAX_CHARS:
        raise Refused(LONG_REFUSAL)
    sender = _profile(me)
    if sender is None or sender.blocked_at is not None:
        raise Refused(ACCOUNT_REFUSAL, 403)
    thread = _thread_for(me, thread_id)
    other = _other(thread, me)
    if blocked_between(me, other):
        raise Refused(BLOCKED_REFUSAL, 403)
    now = timezone.now()
    too_fast = limits.first_broken(DmMessage.objects.filter(sender_id=me), limits.MESSAGES, now)
    if too_fast:
        raise Refused(too_fast, 429)
    starter = _u(thread.started_by) == _u(me)
    if thread.accepted_at is None:
        if starter:
            if thread.declined_at is not None:
                raise Refused(DECLINED_REFUSAL, 403)
            if thread.messages.filter(sender_id=me).exists():
                raise Refused(WAIT_REFUSAL, 403)
        else:
            # Replying to a request accepts it.
            thread.accepted_at = now
            thread.declined_at = None
    message = DmMessage.objects.create(thread=thread, sender_id=me, body=text, created_at=now)
    thread.last_message_at = now
    thread.last_preview = text[:120]
    thread.save(update_fields=["accepted_at", "declined_at", "last_message_at", "last_preview"])
    _notify(thread, me, other, now)
    return message


def _notify(thread, me, other, now):
    """Tell the other person, at most once per conversation per IST hour,
    and never what was written: the message stays in the conversation."""
    from apps.notifications import services as notify

    sender = _profile(me)
    hour = (now + timezone.timedelta(hours=5, minutes=30)).strftime("%Y%m%d%H")
    notify.push(
        other,
        kind="dm.message",
        title=f"{(sender.name if sender else None) or 'Someone'} sent you a message",
        ref_type="dm",
        ref_id=str(thread.id),
        dedupe_key=f"dm:{thread.id}:{hour}",
    )


def accept(me, thread_id):
    thread = _thread_for(me, thread_id)
    if _u(thread.started_by) != _u(me) and thread.accepted_at is None:
        thread.accepted_at = timezone.now()
        thread.declined_at = None
        thread.save(update_fields=["accepted_at", "declined_at"])
    return thread


def decline(me, thread_id):
    thread = _thread_for(me, thread_id)
    if _u(thread.started_by) != _u(me) and thread.accepted_at is None:
        thread.declined_at = timezone.now()
        thread.save(update_fields=["declined_at"])
    return thread


def block(me, profile_id):
    if _u(me) == _u(profile_id):
        raise Refused(SELF_REFUSAL)
    try:
        with transaction.atomic():
            DmBlock.objects.create(blocker_id=me, blocked_id=profile_id)
    except IntegrityError:
        pass
    return True


def unblock(me, profile_id):
    DmBlock.objects.filter(blocker_id=me, blocked_id=profile_id).delete()
    return True


DELETED_BODY = "\u2014"  # what a deleted message's words become (the CHECK forbids "")
DELETED_PREVIEW = "This message was deleted"
NOT_YOURS_MESSAGE = "You can delete only your own messages."


def _cleared_at(thread, me):
    return thread.a_cleared_at if _u(thread.a_id) == _u(me) else thread.b_cleared_at


def _mine_after_clear(qs, me):
    """Messages of threads I am in, newer than my own clearing of each."""
    return qs.filter(
        (Q(thread__a_id=me) & (Q(thread__a_cleared_at__isnull=True) | Q(created_at__gt=F("thread__a_cleared_at"))))
        | (Q(thread__b_id=me) & (Q(thread__b_cleared_at__isnull=True) | Q(created_at__gt=F("thread__b_cleared_at"))))
    )


def delete_message(me, thread_id, message_id):
    """The sender deletes a message, for both people (14 Oct 2026)."""
    thread = _thread_for(me, thread_id)
    message = thread.messages.filter(pk=message_id).first()
    if message is None:
        raise Refused("That message is not here.", 404)
    if _u(message.sender_id) != _u(me):
        raise Refused(NOT_YOURS_MESSAGE, 403)
    if message.deleted_at is None:
        message.body = DELETED_BODY
        message.deleted_at = timezone.now()
        message.save(update_fields=["body", "deleted_at"])
        newest = thread.messages.order_by("-created_at", "-id").first()
        if newest is not None and newest.pk == message.pk:
            thread.last_preview = DELETED_PREVIEW
            thread.save(update_fields=["last_preview"])
    return message


def clear(me, thread_id):
    """"Delete chat" for me: everything up to now leaves my side only."""
    thread = _thread_for(me, thread_id)
    field = "a_cleared_at" if _u(thread.a_id) == _u(me) else "b_cleared_at"
    setattr(thread, field, timezone.now())
    thread.save(update_fields=[field])
    return thread


def messages(me, thread_id, after=None, limit=500):
    thread = _thread_for(me, thread_id)
    rows = thread.messages.all()
    cleared = _cleared_at(thread, me)
    if cleared is not None:
        rows = rows.filter(created_at__gt=cleared)
    if after:
        anchor = thread.messages.filter(pk=after).first()
        if anchor is not None:
            rows = rows.filter(Q(created_at__gt=anchor.created_at) | Q(created_at=anchor.created_at, pk__gt=anchor.pk))
    return thread, list(rows.order_by("created_at", "id")[:limit])


def mark_read(me, thread_id):
    thread = _thread_for(me, thread_id)
    thread.messages.filter(read_at__isnull=True).exclude(sender_id=me).update(read_at=timezone.now())
    return True


def box(me, which):
    """Your conversations, newest first. `inbox`: accepted, or requests you
    sent. `requests`: requests to you, not declined."""
    mine = DmThread.objects.filter(Q(a_id=me) | Q(b_id=me)).exclude(last_message_at=None)
    # A chat I deleted stays off my list until a newer message arrives.
    mine = mine.exclude(Q(a_id=me) & Q(a_cleared_at__gte=F("last_message_at"))).exclude(
        Q(b_id=me) & Q(b_cleared_at__gte=F("last_message_at"))
    )
    if which == "requests":
        mine = mine.filter(accepted_at=None, declined_at=None).exclude(started_by=me)
    else:
        mine = mine.filter(Q(accepted_at__isnull=False) | Q(started_by=me))
    return list(mine.order_by("-last_message_at")[:100])


def row(thread, me):
    """A conversation as the list draws it: the other person, the last line,
    unread count, and where it stands."""
    other = _profile(_other(thread, me))
    starter = _u(thread.started_by) == _u(me)
    return {
        "id": str(thread.id),
        "with": {
            "id": str(other.id) if other else None,
            "name": (other.name if other else None) or "NAMO member",
            "avatar_url": other.avatar_url if other else None,
        },
        "last_preview": thread.last_preview,
        "last_message_at": thread.last_message_at,
        "unread": (
            thread.messages.filter(read_at__isnull=True).exclude(sender_id=me)
            .filter(**({"created_at__gt": _cleared_at(thread, me)} if _cleared_at(thread, me) else {}))
            .count()
        ),
        "state": (
            "open" if thread.accepted_at else
            "declined" if thread.declined_at else
            "waiting" if starter else
            "request"
        ),
        "blocked": blocked_between(me, other.id) if other else False,
        "i_blocked": DmBlock.objects.filter(blocker_id=me, blocked_id=other.id).exists() if other else False,
    }


def message_row(m):
    deleted = m.deleted_at is not None
    return {
        "id": str(m.id),
        "sender_id": str(m.sender_id),
        "body": None if deleted else m.body,
        "deleted": deleted,
        "created_at": m.created_at,
        "read_at": m.read_at,
    }


def unread_total(me):
    return _mine_after_clear(DmMessage.objects.filter(read_at__isnull=True), me).exclude(sender_id=me).filter(
        Q(thread__accepted_at__isnull=False) | Q(thread__started_by=me)
    ).count()
