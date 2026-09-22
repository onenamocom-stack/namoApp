"""The admin console's own two tables — both of which already existed.

`admin_users` and `admin_actions` came across in the migration with real
rows in them: the Supabase build had an admin of some kind, and
`admin_actions` still carries its history (`shop.shipped`, `academy.refund`).
Nothing here invents a schema; it gives Django models to what is there, plus
the one column Django needs to log somebody in.

WHY AN ADMIN IS A PROFILE. `admin_users.profile_id` references `profiles`
and `admin_actions.admin_id` references `admin_users`. An admin is a person
who already exists in this product, and the audit trail points at that
person. Django's own `auth_user` is only the login — the identity stays the
profile, which is why `operator` is a link and not a replacement.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Tier(models.TextChoices):
    """The four the CHECK constraint already allows.

    docs/01-PRD.md §6 names the third one "Moderator"; the database says
    `fulfilment`. The database wins here because it has rows and a CHECK,
    and the PRD is the document that should move — recorded rather than
    quietly reconciled.
    """

    SUPPORT = "support", "Support — reads and searches"
    FULFILMENT = "fulfilment", "Fulfilment — shop, stock, shipping"
    FINANCE = "finance", "Finance — payouts and refunds"
    SUPERADMIN = "superadmin", "Superadmin — everything, including admins"


class AdminUser(models.Model):
    profile_id = models.UUIDField(primary_key=True)
    tier = models.CharField(max_length=16, choices=Tier.choices)
    active = models.BooleanField(default=True)
    added_by_note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    # Django's login, linked to the profile that owns the audit trail. Null
    # for an admin who has a row but has not been given console access yet —
    # the two superadmins that arrived with the migration are exactly that.
    operator = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="admin_profile",
        db_column="operator_user_id",
    )

    class Meta:
        db_table = "admin_users"
        verbose_name = "admin"
        verbose_name_plural = "admins"

    def __str__(self):
        return f"{self.profile_id} · {self.tier}"


class AdminAction(models.Model):
    """The audit trail. PRD §6: *every action of every tier is audited*, and
    the reason given there is the right one — it is what makes an appeal
    answerable. Append-only by intent: nothing in the console updates or
    deletes a row here."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admin = models.ForeignKey(
        AdminUser, on_delete=models.DO_NOTHING, db_column="admin_id",
        related_name="actions",
    )
    action = models.TextField()
    target_type = models.TextField()
    target_id = models.UUIDField(null=True, blank=True)
    detail = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "admin_actions"
        verbose_name = "audit entry"
        verbose_name_plural = "audit trail"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.action} · {self.target_type}"
