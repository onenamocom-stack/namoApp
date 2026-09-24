"""Alerts, read-only — support answering "did they ever get told?"."""

from django.contrib import admin as dj

from apps.console.models import Tier
from apps.console.site import at_least, site

from .models import Notification


@dj.register(Notification, site=site)
class NotificationAdmin(dj.ModelAdmin):
    list_display = ("created_at", "who", "kind", "title", "read")
    list_filter = ("kind", "created_at")
    search_fields = ("title", "body")
    date_hierarchy = "created_at"
    list_per_page = 50

    def has_add_permission(self, request):
        """The console does not write alerts. Every one of these is a
        record of something a module did, and one typed here would be a
        message from nobody about nothing."""
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT)

    @dj.display(description="To")
    def who(self, obj):
        from apps.profiles.models import Profile

        p = Profile.objects.filter(pk=obj.profile_id).only("name", "phone").first()
        return f"{p.name} · {p.phone}" if p else str(obj.profile_id)[:8]

    @dj.display(description="Read", boolean=True)
    def read(self, obj):
        return obj.read_at is not None
