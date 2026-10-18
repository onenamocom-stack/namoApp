"""People, in the console — the video flag and the block switch.

Editable here: the two switches and the username (11 Oct 2026 — to take
back a name that impersonates somebody or is abusive; the form runs the
same rules as the app), and the bio, gender and interests, which the
read-only list below does not cover. A profile's name, phone and birth details are the person's own and are
read-only: the console is not a place to correct somebody's birth time for
them, and an admin who can rewrite a birth chart can rewrite every reading
derived from it without anybody noticing.
"""

from django import forms
from django.contrib import admin as dj, messages

from apps.console.audit import record
from apps.console.models import Tier
from apps.console.site import at_least, site
from apps.content import services as content_services

from . import services
from .models import GENDERS, Profile


class ProfileForm(forms.ModelForm):
    """An empty box saves as NULL, not ''. Django's text field saves '',
    and `profiles_gender_check` refuses '' — so ticking Influencer on
    anybody who never gave a gender failed with "Constraint
    profiles_gender_check is violated" (14 Oct 2026, Rahul). Gender is a
    list for the same reason; '' in `username` would collide with the next
    blank one on its unique index."""

    gender = forms.TypedChoiceField(
        choices=[("", "Not given")] + [(g, g.title()) for g in GENDERS],
        required=False,
        empty_value=None,
    )

    class Meta:
        model = Profile
        fields = "__all__"
        # The column is `influencer`; the word on every screen is Creator
        # (13 Oct in the app, 14 Oct here, Rahul). Since 17 Oct it is
        # Content step 2, and `referrer` is step 1.
        labels = {"influencer": "Creator (Content, step 2)", "referrer": "Content, step 1"}

    def clean_username(self):
        return self.cleaned_data.get("username") or None

    def clean_bio(self):
        return self.cleaned_data.get("bio") or None


class CreatorFilter(dj.SimpleListFilter):
    """The `influencer` filter, under the name the console uses."""

    title = "creator"
    parameter_name = "creator"

    def lookups(self, request, model_admin):
        return (("yes", "Yes"), ("no", "No"))

    def queryset(self, request, queryset):
        if self.value() in ("yes", "no"):
            return queryset.filter(influencer=self.value() == "yes")
        return queryset


@dj.register(Profile, site=site)
class ProfileAdmin(dj.ModelAdmin):
    form = ProfileForm
    list_display = (
        "name", "username", "phone", "video", "is_influencer", "brought", "standing", "complaints", "created_at",
    )
    list_filter = ("video_enabled", CreatorFilter, "admin", "created_at")
    search_fields = ("name", "username", "phone", "email")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 40
    actions = (
        "enable_video", "disable_video", "make_influencer", "remove_influencer", "block", "unblock",
    )

    # Everything except the two switches. See the module docstring.
    readonly_fields = (
        "id", "phone", "name", "email", "birth_date", "birth_time",
        "birth_time_known", "birth_place", "birth_lat", "birth_lon",
        "birth_zone", "admin", "avatar_url", "legacy_id", "created_at",
        "blocked_at", "blocked_reason", "username_changed_at",
    )

    def save_model(self, request, obj, form, change):
        """Logs a username an admin changed. It does not start the person's
        30 days: that clock is for their own choices."""
        super().save_model(request, obj, form, change)
        if change and "username" in form.changed_data:
            record(request, "username.change", "profile", obj.pk,
                   was=form.initial.get("username"), now=obj.username)
        # The two switches ticked on this page are audited as the list's
        # actions are.
        for field, verb in (("influencer", "creator"), ("video_enabled", "video")):
            if change and field in form.changed_data:
                record(request, f"profile.{verb} {'on' if getattr(obj, field) else 'off'}", "profile", obj.pk)

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

    @dj.display(description="Creator", boolean=True)
    def is_influencer(self, obj):
        return obj.influencer

    @dj.display(description="Brought (this month)")
    def brought(self, obj):
        """An influencer's numbers, the same ones their tab shows: people who
        joined with their code, and how many of those have paid. Filter the
        list by Creator to see them all."""
        if not obj.influencer:
            return "—"
        from apps.referrals.influencer import totals_for

        t = totals_for([obj.pk])[obj.pk]
        return (
            f"{t['signups']} joined · {t['buyers']} paid "
            f"({t['month_signups']} · {t['month_buyers']})"
        )

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

    @dj.action(description="Make creator — blue tick, video, the Creator tab and its numbers")
    def make_influencer(self, request, queryset):
        """Owner's request, 3 Oct 2026: an influencer sees how many people
        joined with their code and how many of those paid. Their code is the
        N invite code they already have; this flag only turns on the tab."""
        self._switch(request, queryset, "made creator",
                     lambda r: services.set_influencer(r.pk, True))

    @dj.action(description="Remove creator")
    def remove_influencer(self, request, queryset):
        self._switch(request, queryset, "creator removed",
                     lambda r: services.set_influencer(r.pk, False))

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


# ── module requests (docs/06 Phase 18, 16 Oct 2026) ─────────────────────────


def _register_module_requests():
    from apps.console.audit import AuditedAdmin, DecideButtons

    from . import modules
    from .models import ModuleRequest

    @dj.register(ModuleRequest, site=site)
    class ModuleRequestAdmin(DecideButtons, AuditedAdmin, dj.ModelAdmin):
        """Requests for the Creator and the Seller module. Approve switches
        the module on; Reject needs the reason in the review note, which the
        person sees. Either way they get a notification. A Pro applies with
        the consultant form, in the consultant queue."""

        audit_target = "module request"
        list_display = ("submitted_at", "who", "module", "status", "summary")
        list_filter = ("status", "module")
        ordering = ("status", "-submitted_at")
        readonly_fields = ("who", "module", "status", "answers_shown", "submitted_at", "reviewed_at", "reviewed_by")
        fields = ("who", "module", "status", "answers_shown", "review_note", "submitted_at", "reviewed_at",
                  "reviewed_by")
        actions = ("approve", "reject")
        # On the request's own page too (18 Oct 2026, Rahul could not find them).
        decide_buttons = (("Approve", "approve", "go"), ("Reject", "reject", "stop"))
        decide_note = "To turn down, write the reason in the review note first; the person sees it."

        def decide_shown(self, obj):
            return obj.status == ModuleRequest.Status.PENDING

        @dj.display(description="Who")
        def who(self, obj):
            p = Profile.objects.filter(pk=obj.profile_id).values("name", "phone").first() or {}
            return f"{p.get('name') or '—'} · {p.get('phone') or ''}"

        @dj.display(description="Answers")
        def summary(self, obj):
            return " · ".join(v for v in obj.answers.values() if v)[:120]

        @dj.display(description="Answers")
        def answers_shown(self, obj):
            labels = {k: label for k, label, _ in modules.QUESTIONS.get(obj.module, [])}
            return "\n".join(f"{labels.get(k, k)}: {v}" for k, v in obj.answers.items())

        def has_module_permission(self, request):
            return at_least(request, Tier.SUPPORT)

        def has_view_permission(self, request, obj=None):
            return at_least(request, Tier.SUPPORT)

        def has_change_permission(self, request, obj=None):
            return at_least(request, Tier.SUPPORT)

        def has_add_permission(self, request):
            return False

        def has_delete_permission(self, request, obj=None):
            return False

        def _decide(self, request, queryset, approve):
            who = getattr(request.user, "email", "") or str(request.user)
            done = 0
            for row in queryset:
                try:
                    modules.decide(row, approve, who, row.review_note)
                except modules.Refused as err:
                    self.message_user(request, f"{row}: {err.message}", messages.ERROR)
                    continue
                record(request, f"module.{'approve' if approve else 'reject'}", "module_request", target_id=row.pk)
                done += 1
            if done:
                self.message_user(request, f"{done} {'approved' if approve else 'turned down'}.", messages.SUCCESS)

        @dj.action(description="Approve — switch the module on and tell them")
        def approve(self, request, queryset):
            self._decide(request, queryset, True)

        @dj.action(description="Reject — with the reason saved in the review note")
        def reject(self, request, queryset):
            self._decide(request, queryset, False)


_register_module_requests()
