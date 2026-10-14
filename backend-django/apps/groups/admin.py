"""Groups in the console (14 Oct 2026, Phase 15c): read them, and block one
that breaks the rules. A blocked group and its posts leave the app; nothing
is deleted, and unblocking puts it all back."""

from django.contrib import admin as dj, messages
from django.db.models import Count, Q

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import at_least, site

from .models import Group, GroupMember


@dj.register(Group, site=site)
class GroupAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "group"
    list_display = ("name", "kind", "city", "members_now", "creator", "status", "last_post_at", "created_at")
    list_filter = ("status", "kind")
    search_fields = ("name", "city", "about")
    readonly_fields = ("name", "kind", "city", "about", "avatar_url", "created_by", "last_post_at", "created_at")
    fields = readonly_fields + ("status", "blocked_reason")
    actions = ("block", "unblock")
    ordering = ("-created_at",)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _members=Count("members", filter=Q(members__status=GroupMember.Status.ACTIVE)),
        )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    @dj.display(description="Members", ordering="_members")
    def members_now(self, obj):
        return obj._members

    @dj.display(description="Made by")
    def creator(self, obj):
        from apps.profiles.models import Profile

        p = Profile.objects.filter(pk=obj.created_by).only("name", "phone").first()
        return f"{p.name or '—'} · {p.phone}" if p else str(obj.created_by)[:8]

    @dj.action(description="Block — the group and its posts leave the app")
    def block(self, request, queryset):
        n = 0
        for g in queryset.filter(status=Group.Status.LIVE):
            Group.objects.filter(pk=g.pk).update(status=Group.Status.BLOCKED)
            record(request, "group.block", "group", target_id=g.pk)
            n += 1
        self.message_user(request, f"{n} group(s) blocked.", messages.SUCCESS if n else messages.WARNING)

    @dj.action(description="Unblock — put it back")
    def unblock(self, request, queryset):
        n = 0
        for g in queryset.filter(status=Group.Status.BLOCKED):
            Group.objects.filter(pk=g.pk).update(status=Group.Status.LIVE)
            record(request, "group.unblock", "group", target_id=g.pk)
            n += 1
        self.message_user(request, f"{n} group(s) unblocked.", messages.SUCCESS if n else messages.WARNING)
