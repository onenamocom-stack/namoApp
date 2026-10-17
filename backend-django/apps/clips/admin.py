"""The video review queue (part E, 17 Oct 2026; docs/06 Phase 19).

What waits here: a video SafeSearch was unsure of, one it could not
check, and the first 3 videos of anybody who is not an approved Pro or a
Creator. Each row shows the moderation sheet (a frame every 10 seconds,
nine to an image) beside SafeSearch's verdict. Approve puts the file and
every copy of it live; Reject deletes its files and refuses the same file
for good. Oldest first, in-review only by default.
"""

from django.contrib import admin as dj, messages
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import at_least, site
from apps.media.providers import public_url

from . import services
from .models import Video, VideoStatus


class InReviewFirst(dj.SimpleListFilter):
    title = "status"
    parameter_name = "status"

    def lookups(self, request, model_admin):
        return [("all", "All")] + list(VideoStatus.choices)

    def choices(self, changelist):
        for value, label in self.lookup_choices:
            yield {
                "selected": (self.value() or VideoStatus.IN_REVIEW) == value,
                "query_string": changelist.get_query_string({self.parameter_name: value}),
                "display": label,
            }

    def queryset(self, request, queryset):
        value = self.value() or VideoStatus.IN_REVIEW
        return queryset if value == "all" else queryset.filter(status=value)


@dj.register(Video, site=site)
class VideoAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "video"
    list_display = ("frames", "who", "verdict", "length", "status", "created_at")
    list_filter = (InReviewFirst,)
    readonly_fields = ("frames_large", "who", "verdict", "status", "duration_s", "width", "height",
                       "category", "moderation", "error", "source_video", "created_at", "processed_at")
    fields = readonly_fields
    actions = ("approve", "reject")
    list_per_page = 40
    ordering = ("created_at",)

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

    def _sheets(self, obj, height):
        paths = (obj.moderation or {}).get("sheets") or ([obj.thumb_path] if obj.thumb_path else [])
        if not paths:
            return "—"
        return format_html_join("", '<a href="{0}" target="_blank"><img src="{0}" style="height:{1}px;margin-right:4px"></a>',
                                ((public_url(p), height) for p in paths))

    @dj.display(description="Frames")
    def frames(self, obj):
        return self._sheets(obj, 120)

    @dj.display(description="Frames, every 10 seconds")
    def frames_large(self, obj):
        return self._sheets(obj, 640)

    @dj.display(description="Who")
    def who(self, obj):
        from apps.profiles.models import Profile

        p = Profile.objects.filter(pk=obj.user_id).values("name", "phone", "created_at").first()
        if not p:
            return str(obj.user_id)
        days = (timezone.now() - p["created_at"]).days if p["created_at"] else None
        joined = "" if days is None else (" · joined today" if days == 0 else f" · joined {days} days ago")
        return format_html("{}{}", p["name"] or p["phone"], joined)

    @dj.display(description="SafeSearch")
    def verdict(self, obj):
        m = obj.moderation or {}
        if m.get("error"):
            return f"not checked: {m['error'][:80]}"
        if not m.get("images"):
            return "—"
        return ", ".join(f"{k} {m.get(k, '?').replace('_', ' ').lower()}" for k in ("adult", "violence", "racy"))

    @dj.display(description="Length")
    def length(self, obj):
        return f"{obj.duration_s:.0f} s"

    @dj.action(description="Approve: the video goes live")
    def approve(self, request, queryset):
        done = 0
        for video in queryset.filter(status=VideoStatus.IN_REVIEW):
            if services.approve(video, by=request.user.get_username()):
                record(request, "video.approve", "video", target_id=str(video.pk), user=str(video.user_id))
                done += 1
        self.message_user(request, f"{done} video(s) live.", messages.SUCCESS if done else messages.WARNING)

    @dj.action(description="Reject: delete it; the same file can never be posted again")
    def reject(self, request, queryset):
        done = 0
        for video in queryset.filter(status__in=(VideoStatus.IN_REVIEW, VideoStatus.LIVE)):
            if services.reject(video, by=request.user.get_username()):
                record(request, "video.reject", "video", target_id=str(video.pk), user=str(video.user_id))
                done += 1
        self.message_user(request, f"{done} video(s) rejected.", messages.SUCCESS if done else messages.WARNING)
