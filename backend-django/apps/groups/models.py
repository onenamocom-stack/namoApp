"""Groups (14 Oct 2026, docs/06 Phase 15c): a mandir, a sampradaya, a city.

Anyone signed in makes one and is its first admin. Public: anyone joins.
A post made in a group carries `content.group_id`; it shows on the group's
page and in its members' Home feeds, not in everybody's. An admin removes
members and posts and makes other admins; a removed member cannot post in
the group again. Namo blocks a group from the console, which takes it and
its posts out of the app; nothing is deleted.
"""

import uuid

from django.db import models
from django.utils import timezone


class GroupKind(models.TextChoices):
    MANDIR = "mandir", "Mandir"
    # A group around one deity (14 Oct 2026, Rahul).
    BHAGWAN = "bhagwan", "Bhagwan"
    SAMPRADAYA = "sampradaya", "Sampradaya"
    CITY = "city", "City"
    OTHER = "other", "Other"


class GroupStatus(models.TextChoices):
    LIVE = "live", "Live"
    BLOCKED = "blocked", "Blocked by Namo"


class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=16, choices=GroupKind.choices, default=GroupKind.OTHER)
    city = models.CharField(max_length=80, blank=True, default="")
    about = models.TextField(blank=True, default="")
    avatar_url = models.TextField(blank=True, default="")
    created_by = models.UUIDField()
    status = models.CharField(max_length=16, choices=GroupStatus.choices, default=GroupStatus.LIVE)
    blocked_reason = models.TextField(blank=True, default="")
    last_post_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Kind = GroupKind
    Status = GroupStatus

    class Meta:
        db_table = "groups"
        indexes = [
            models.Index(fields=["status", "-last_post_at"], name="groups_live_idx"),
            models.Index(fields=["created_by", "created_at"], name="groups_creator_idx"),
        ]

    def __str__(self):
        return self.name


class MemberRole(models.TextChoices):
    ADMIN = "admin", "Admin"
    MEMBER = "member", "Member"


class MemberStatus(models.TextChoices):
    ACTIVE = "active", "Member"
    LEFT = "left", "Left"
    REMOVED = "removed", "Removed by an admin"


class GroupMember(models.Model):
    """One person in one group. Leaving keeps the row (`left`), so a
    removal (`removed`) cannot be undone by leaving and joining again."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="members")
    profile_id = models.UUIDField()
    role = models.CharField(max_length=16, choices=MemberRole.choices, default=MemberRole.MEMBER)
    status = models.CharField(max_length=16, choices=MemberStatus.choices, default=MemberStatus.ACTIVE)
    joined_at = models.DateTimeField(default=timezone.now)

    Role = MemberRole
    Status = MemberStatus

    class Meta:
        db_table = "group_members"
        constraints = [
            models.UniqueConstraint(fields=["group", "profile_id"], name="group_members_once"),
        ]
        indexes = [models.Index(fields=["profile_id", "status"], name="group_members_person_idx")]

    def __str__(self):
        return f"{self.profile_id} in {self.group_id}"
