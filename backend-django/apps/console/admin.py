"""Stage 1 — the approval queue, and the console's own two tables.

Consultant approval is first for a reason that is not sentiment: **it is
the only thing here that is currently impossible.** A consultant who
applies today lands at `pending` and stays there forever, invisible and
unbookable, because nothing anywhere can move them. Shop, reels and
analytics all have workarounds; this one does not.
"""

from django.contrib import admin as dj, messages
from django.utils.html import format_html

from apps.consultants.models import Consultant
from apps.profiles.models import Profile

from .audit import AuditedAdmin, record
from .models import AdminAction, AdminUser, Tier
from .site import at_least, site


@dj.register(Consultant, site=site)
class ConsultantAdmin(AuditedAdmin, dj.ModelAdmin):
    """The queue. Pending first, because that is the job."""

    audit_target = "consultant"
    list_display = ("who", "category", "specialization", "status", "verified", "created_at")
    list_filter = ("status", "verified", "category")
    search_fields = ("specialization", "bio", "category")
    ordering = ("status", "-created_at")
    readonly_fields = (
        "profile_id", "created_at", "rating_avg_cache", "rating_count_cache",
        "rank_score_cache", "legacy_id", "who",
    )
    actions = ("approve", "block", "unblock")
    list_per_page = 50

    @dj.display(description="Applicant")
    def who(self, obj):
        p = Profile.objects.filter(pk=obj.profile_id).only("name", "phone").first()
        if p is None:
            return str(obj.profile_id)
        return format_html("<strong>{}</strong><br><small>{}</small>", p.name or "—", p.phone or "")

    def has_delete_permission(self, request, obj=None):
        """Never. PRD §6 capability 6: soft delete only — a removed record
        in a dispute is evidence. Blocking is the verb; deletion is not."""
        return False

    def has_add_permission(self, request):
        """A consultant is created by applying, not by an admin typing one
        in. An admin-made row would have no account behind it."""
        return False

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def _set_status(self, request, queryset, status, verb):
        """One place, so approve/block/unblock cannot drift apart. The audit
        row names the consultant and what it was before — an appeal needs
        the previous state, not just the new one."""
        moved = 0
        for consultant in queryset:
            was = consultant.status
            if was == status:
                continue
            Consultant.objects.filter(pk=consultant.pk).update(status=status)
            record(request, f"consultant.{verb}", "consultant",
                   target_id=consultant.profile_id, was=was, now=status)
            moved += 1
        self.message_user(
            request, f"{moved} {verb}.", messages.SUCCESS if moved else messages.WARNING
        )

    @dj.action(description="Approve — make visible and bookable")
    def approve(self, request, queryset):
        if not at_least(request, Tier.SUPPORT, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        self._set_status(request, queryset, Consultant.Status.APPROVED, "approve")

    @dj.action(description="Block — invisible, unbookable, cannot earn")
    def block(self, request, queryset):
        """PRD §6 flags this as unresolved policy: a blocked consultant with
        confirmed bookings and a pending balance leaves seekers who have
        paid. Blocking is allowed here because the alternative is no way to
        stop a bad actor at all; what it does NOT do is touch money or
        cancel bookings. That call is still open and must not be made by a
        side effect."""
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        self._set_status(request, queryset, Consultant.Status.BLOCKED, "block")

    @dj.action(description="Unblock — back to approved")
    def unblock(self, request, queryset):
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        self._set_status(request, queryset, Consultant.Status.APPROVED, "unblock")


@dj.register(AdminUser, site=site)
class AdminUserAdmin(AuditedAdmin, dj.ModelAdmin):
    """Who the admins are. Superadmin only — PRD §6: *Superadmin manages
    admins*."""

    audit_target = "admin"
    list_display = ("profile_id", "tier", "active", "operator", "created_at")
    list_filter = ("tier", "active")
    readonly_fields = ("created_at",)

    # Spelled out rather than aliased: Django's four permission hooks do
    # not share a signature (`view`, `change` and `delete` take an object;
    # `module` and `add` do not), and one alias with the wrong arity fails
    # at request time rather than at import.
    def has_module_permission(self, request):
        return at_least(request)  # superadmin only

    def has_view_permission(self, request, obj=None):
        return at_least(request)

    def has_add_permission(self, request):
        return at_least(request)

    def has_change_permission(self, request, obj=None):
        return at_least(request)

    def has_delete_permission(self, request, obj=None):
        """Deactivate, never delete. `admin_actions` points at this row, and
        an audit trail whose author can be erased is not a trail."""
        return False


@dj.register(AdminAction, site=site)
class AdminActionAdmin(dj.ModelAdmin):
    """The trail, readable and nothing else. No add, no change, no delete —
    at any tier, including superadmin. An append-only log with an edit
    button is a log nobody can rely on."""

    list_display = ("created_at", "admin", "action", "target_type", "target_id")
    list_filter = ("action", "target_type")
    search_fields = ("action", "target_type")
    date_hierarchy = "created_at"
    list_per_page = 100

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
