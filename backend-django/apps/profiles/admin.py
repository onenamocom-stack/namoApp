"""People, in the console — the video flag and the block switch.

Only two things are editable here and both are moderation decisions. A
profile's name, phone and birth details are the person's own and are
read-only: the console is not a place to correct somebody's birth time for
them, and an admin who can rewrite a birth chart can rewrite every reading
derived from it without anybody noticing.
"""

from django.contrib import admin as dj, messages

from apps.console.audit import record
from apps.console.models import Tier
from apps.console.site import at_least, site
from apps.content import services as content_services

from . import services
from .models import Profile


@dj.register(Profile, site=site)
class ProfileAdmin(dj.ModelAdmin):
    list_display = ("name", "phone", "video", "standing", "complaints", "created_at")
    list_filter = ("video_enabled", "admin", "created_at")
    search_fields = ("name", "phone", "email")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 40
    actions = ("enable_video", "disable_video", "block", "unblock")

    # Everything except the two switches. See the module docstring.
    readonly_fields = (
        "id", "phone", "name", "email", "birth_date", "birth_time",
        "birth_time_known", "birth_place", "birth_lat", "birth_lon",
        "birth_zone", "admin", "avatar_url", "legacy_id", "created_at",
        "blocked_at", "blocked_reason",
    )

    def has_add_permission(self, request):
        """A profile is created when somebody signs up with a phone they
        control. One typed here would be an account with no verified
        number, which is the one thing this product's identity rests on."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Blocking is the verb; deletion is not — the same rule the
        consultant list already follows."""
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    @dj.display(description="Video", boolean=True)
    def video(self, obj):
        return obj.video_enabled

    @dj.display(description="Standing")
    def standing(self, obj):
        return "Blocked" if obj.blocked_at else "OK"

    @dj.display(description="Reports")
    def complaints(self, obj):
        counts = content_services.reports_against(obj.pk)
        if not counts["total"]:
            return "—"
        return f"{counts['total']} ({counts['open']} open)"

    def _switch(self, request, queryset, verb, apply):
        done = sum(1 for row in queryset if apply(row))
        for row in queryset:
            record(request, f"profile.{verb}", "profile", target_id=row.pk)
        self.message_user(
            request,
            f"{done} of {queryset.count()} changed." if done != queryset.count()
            else f"{done} {verb}.",
            messages.SUCCESS if done else messages.WARNING,
        )

    @dj.action(description="Allow video — reels, without making them a consultant")
    def enable_video(self, request, queryset):
        """The flag the seeker asked for: *"kal ko influencer aaye as
        normal user and vo post kare videos toh uske lie vo flag on kar
        denge"*. Granting it does not make somebody bookable, does not put
        them in the astrologer list, and gives them no rate card."""
        self._switch(request, queryset, "video enabled",
                     lambda r: services.set_video_enabled(r.pk, True))

    @dj.action(description="Revoke video")
    def disable_video(self, request, queryset):
        self._switch(request, queryset, "video revoked",
                     lambda r: services.set_video_enabled(r.pk, False))

    @dj.action(description="Block — posts hidden, cannot post again")
    def block(self, request, queryset):
        self._switch(request, queryset, "blocked",
                     lambda r: services.set_blocked(r.pk, True, reason="Blocked from the console"))

    @dj.action(description="Unblock — everything comes back")
    def unblock(self, request, queryset):
        """Nothing was deleted, so nothing has to be restored — their rows
        were only being filtered out of the feed. That is the whole reason
        blocking is a timestamp and not a delete."""
        self._switch(request, queryset, "unblocked",
                     lambda r: services.set_blocked(r.pk, False))
