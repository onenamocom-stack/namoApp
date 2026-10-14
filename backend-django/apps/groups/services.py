"""The rules of groups (Phase 15c; models.py says what a group is).

Every refusal is a sentence the person reads, raised as `Refused`.
"""

import uuid

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q
from django.utils import timezone

from apps.core import limits

from .models import Group, GroupMember

NAME_MIN, NAME_MAX = 3, 80
ABOUT_MAX = 500
NEW_GROUPS = ((limits.DAY, 3, "You can start three groups a day. Try again tomorrow."),)

NOT_FOUND = "That group is not available."
NOT_ADMIN = "Only the group's admins can do that."
REMOVED = "An admin removed you from this group."
NOT_MEMBER = "Join the group to post in it."
BLOCKED_ACCOUNT = "Your account cannot do this."
LAST_ADMIN = "Make somebody else an admin before you leave."


class Refused(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _u(value):
    return uuid.UUID(str(value))


def _assert_person(profile_id):
    from apps.profiles import services as profile_services

    if profile_services.is_blocked(profile_id):
        raise Refused(BLOCKED_ACCOUNT, 403)


def live_group(group_id):
    group = Group.objects.filter(pk=group_id, status=Group.Status.LIVE).first()
    if group is None:
        raise Refused(NOT_FOUND, 404)
    return group


def membership(group_id, profile_id):
    return GroupMember.objects.filter(group_id=group_id, profile_id=profile_id).first()


def is_admin(group_id, profile_id):
    m = membership(group_id, profile_id)
    return bool(m and m.status == GroupMember.Status.ACTIVE and m.role == GroupMember.Role.ADMIN)


def my_group_ids(profile_id):
    """The live groups this person is an active member of — their Home feed
    carries these groups' posts."""
    if not profile_id:
        return []
    return list(
        GroupMember.objects.filter(
            profile_id=profile_id, status=GroupMember.Status.ACTIVE, group__status=Group.Status.LIVE,
        ).values_list("group_id", flat=True)
    )


def create(profile_id, *, name, kind="other", city="", about="", avatar_url=""):
    _assert_person(profile_id)
    name = (name or "").strip()
    if not (NAME_MIN <= len(name) <= NAME_MAX):
        raise Refused(f"A group's name is {NAME_MIN} to {NAME_MAX} characters.")
    about = (about or "").strip()
    if len(about) > ABOUT_MAX:
        raise Refused(f"The description is at most {ABOUT_MAX} characters.")
    if kind not in Group.Kind.values:
        kind = Group.Kind.OTHER
    too_fast = limits.first_broken(Group.objects.filter(created_by=profile_id), NEW_GROUPS)
    if too_fast:
        raise Refused(too_fast, 429)
    with transaction.atomic():
        group = Group.objects.create(
            name=name, kind=kind, city=(city or "").strip()[:80], about=about,
            avatar_url=(avatar_url or "").strip(), created_by=profile_id,
        )
        GroupMember.objects.create(group=group, profile_id=profile_id, role=GroupMember.Role.ADMIN)
    return group


def update(group_id, profile_id, **fields):
    group = live_group(group_id)
    if not is_admin(group_id, profile_id):
        raise Refused(NOT_ADMIN, 403)
    if "name" in fields:
        name = (fields["name"] or "").strip()
        if not (NAME_MIN <= len(name) <= NAME_MAX):
            raise Refused(f"A group's name is {NAME_MIN} to {NAME_MAX} characters.")
        group.name = name
    if "about" in fields:
        about = (fields["about"] or "").strip()
        if len(about) > ABOUT_MAX:
            raise Refused(f"The description is at most {ABOUT_MAX} characters.")
        group.about = about
    if "city" in fields:
        group.city = (fields["city"] or "").strip()[:80]
    if "avatar_url" in fields:
        group.avatar_url = (fields["avatar_url"] or "").strip()
    if fields.get("kind") in Group.Kind.values:
        group.kind = fields["kind"]
    group.save()
    return group


def join(group_id, profile_id):
    _assert_person(profile_id)
    group = live_group(group_id)
    m = membership(group_id, profile_id)
    if m is None:
        try:
            with transaction.atomic():
                GroupMember.objects.create(group=group, profile_id=profile_id)
        except IntegrityError:
            pass
        return group
    if m.status == GroupMember.Status.REMOVED:
        raise Refused(REMOVED, 403)
    if m.status == GroupMember.Status.LEFT:
        m.status, m.role, m.joined_at = GroupMember.Status.ACTIVE, GroupMember.Role.MEMBER, timezone.now()
        m.save(update_fields=["status", "role", "joined_at"])
    return group


def leave(group_id, profile_id):
    m = membership(group_id, profile_id)
    if m is None or m.status != GroupMember.Status.ACTIVE:
        return
    if m.role == GroupMember.Role.ADMIN:
        others = GroupMember.objects.filter(
            group_id=group_id, status=GroupMember.Status.ACTIVE, role=GroupMember.Role.ADMIN,
        ).exclude(pk=m.pk)
        if not others.exists():
            members = GroupMember.objects.filter(group_id=group_id, status=GroupMember.Status.ACTIVE).exclude(pk=m.pk)
            if members.exists():
                raise Refused(LAST_ADMIN)
    m.status = GroupMember.Status.LEFT
    m.save(update_fields=["status"])


def remove_member(group_id, admin_id, profile_id):
    """An admin removes somebody. They cannot post in the group again, nor
    rejoin; their earlier posts stay unless removed one by one."""
    live_group(group_id)
    if not is_admin(group_id, admin_id):
        raise Refused(NOT_ADMIN, 403)
    if _u(admin_id) == _u(profile_id):
        raise Refused("Leave the group instead.")
    m = membership(group_id, profile_id)
    if m is None:
        raise Refused("That person is not in this group.", 404)
    m.status, m.role = GroupMember.Status.REMOVED, GroupMember.Role.MEMBER
    m.save(update_fields=["status", "role"])


def make_admin(group_id, admin_id, profile_id):
    live_group(group_id)
    if not is_admin(group_id, admin_id):
        raise Refused(NOT_ADMIN, 403)
    m = membership(group_id, profile_id)
    if m is None or m.status != GroupMember.Status.ACTIVE:
        raise Refused("That person is not in this group.", 404)
    m.role = GroupMember.Role.ADMIN
    m.save(update_fields=["role"])


def assert_may_post(group_id, profile_id):
    """Publishing into a group: an active member of a live group. Raised
    as Refused; the content service turns it into its own refusal."""
    live_group(group_id)
    m = membership(group_id, profile_id)
    if m is not None and m.status == GroupMember.Status.REMOVED:
        raise Refused(REMOVED, 403)
    if m is None or m.status != GroupMember.Status.ACTIVE:
        raise Refused(NOT_MEMBER, 403)


def posted(group_id):
    Group.objects.filter(pk=group_id).update(last_post_at=timezone.now())


def remove_post(group_id, admin_id, content_id):
    """A group admin takes a post out of their group: it is removed, as an
    admin's removal is (the post lived only in the group)."""
    from apps.content import services as content_services
    from apps.content.models import Content

    live_group(group_id)
    if not is_admin(group_id, admin_id):
        raise Refused(NOT_ADMIN, 403)
    if not Content.objects.filter(pk=content_id, group_id=group_id).exists():
        raise Refused("That post is not in this group.", 404)
    content_services.admin_remove_content(content_id)


def _with_counts(qs):
    return qs.annotate(
        member_count=Count("members", filter=Q(members__status=GroupMember.Status.ACTIVE)),
    )


def mine(profile_id):
    ids = my_group_ids(profile_id)
    return list(_with_counts(Group.objects.filter(pk__in=ids)).order_by("-last_post_at", "-created_at"))


def search(q="", limit=40):
    qs = Group.objects.filter(status=Group.Status.LIVE)
    q = (q or "").strip()
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(city__icontains=q) | Q(about__icontains=q))
    return list(_with_counts(qs).order_by("-last_post_at", "-created_at")[:limit])


def suggest(profile_id, limit=10):
    """Home's "Groups for you" (14 Oct 2026, Rahul): live groups the person
    is not in and was not removed from, the busiest first."""
    taken = GroupMember.objects.filter(profile_id=profile_id).exclude(
        status=GroupMember.Status.LEFT
    ).values("group_id")
    qs = _with_counts(Group.objects.filter(status=Group.Status.LIVE).exclude(pk__in=taken))
    return list(qs.order_by("-member_count", F("last_post_at").desc(nulls_last=True))[:limit])


def detail(group_id):
    group = _with_counts(Group.objects.filter(pk=group_id, status=Group.Status.LIVE)).first()
    if group is None:
        raise Refused(NOT_FOUND, 404)
    return group


def members(group_id, limit=200):
    from apps.profiles.models import Profile

    rows = list(
        GroupMember.objects.filter(group_id=group_id, status=GroupMember.Status.ACTIVE)
        .order_by("role", "joined_at")[:limit]
    )
    people = {
        p.id: p for p in Profile.objects.filter(pk__in=[r.profile_id for r in rows]).only("id", "name", "avatar_url")
    }
    out = []
    for r in rows:
        p = people.get(r.profile_id)
        out.append({
            "profile_id": str(r.profile_id), "role": r.role,
            "name": p.name if p else "", "avatar_url": getattr(p, "avatar_url", None) if p else None,
        })
    return out


def row(group, viewer_id=None):
    m = membership(group.id, viewer_id) if viewer_id else None
    return {
        "id": str(group.id),
        "name": group.name,
        "kind": group.kind,
        "city": group.city,
        "about": group.about,
        "avatar_url": group.avatar_url or None,
        "member_count": getattr(group, "member_count", None),
        "last_post_at": group.last_post_at.isoformat() if group.last_post_at else None,
        "me": None if m is None else {"status": m.status, "role": m.role},
        # "Groups you created" on the groups page (14 Oct 2026, Rahul).
        "created_by_me": bool(viewer_id) and str(group.created_by).replace("-", "") == str(viewer_id).replace("-", ""),
    }
