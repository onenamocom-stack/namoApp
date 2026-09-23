"""Reels and posts, uploaded from the console (stage 3).

The feed is `content` rows; a reel is one with `kind='clip'` and a
`media_url`. Until now the only way to put one there was to write the row
by hand and get the file into R2 some other way.

THE FILE GOES TO R2, NOT INTO POSTGRES. That is the rule the migration was
run to establish (HANDOFF §14): 202 MB of video came out of the database
and onto object storage, and an admin upload that put it back would undo
that quietly. `media_url` is a pointer and nothing here writes bytes to a
column.
"""

import uuid

from django import forms
from django.contrib import admin as dj, messages
from django.utils import timezone
from django.utils.html import format_html

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import admin_row, at_least, site
from apps.content import services
from apps.content.models import (
    Content, ContentKind, ContentStatus, Report,
)
from apps.profiles import services as profile_services
from apps.media import providers as media
from apps.media.models import MediaAsset, MediaKind, MediaStatus

# A video/* file is a "reel" to the media module and a "clip" to the feed —
# two names for one thing, from two modules written months apart. Mapped
# here rather than renamed, because renaming a stored `kind` means a
# migration over 49 rows to fix a word.
#
# The size limits come from the seeker path (media.KIND_RULES: 100 MB for
# video, 10 MB for an image) and apply to the console too. An operator
# uploading a 200 MB master would pay for it in Cloudflare egress on every
# single view.
MIME_FAMILY_TO_UPLOAD_KIND = {"video": "reel", "image": "image"}
MIME_FAMILY_TO_MEDIA_KIND = {"video": MediaKind.REEL, "image": MediaKind.IMAGE}


class ContentForm(forms.ModelForm):
    upload = forms.FileField(
        required=False,
        label="Video or image",
        help_text="Goes straight to R2. Leave empty to keep the current file.",
    )

    class Meta:
        model = Content
        fields = ("kind", "title", "body", "caption", "media_url", "status")
        widgets = {"media_url": forms.TextInput(attrs={"size": 90})}

    def clean(self):
        data = super().clean()
        kind = data.get("kind")
        upload = data.get("upload")
        has_media = bool(upload or data.get("media_url"))

        # A clip with no file is an empty tile in the feed — the reel plays
        # nothing and the screen has no way to say why.
        if kind == ContentKind.CLIP and not has_media:
            raise forms.ValidationError(
                {"upload": "A clip needs a video. Upload one or paste a URL."}
            )
        if kind == ContentKind.ARTICLE and not data.get("title"):
            raise forms.ValidationError({"title": "An article needs a title."})

        if upload:
            mime = getattr(upload, "content_type", "") or ""
            family = mime.split("/")[0]
            if family not in MIME_FAMILY_TO_UPLOAD_KIND:
                raise forms.ValidationError(
                    {"upload": f"Only video or image files here (got {mime or 'unknown'})."}
                )
            try:
                media.validate_upload(
                    MIME_FAMILY_TO_UPLOAD_KIND[family], upload.name, upload.size, mime
                )
            except media.ValidationError as exc:
                raise forms.ValidationError({"upload": str(exc)}) from None
        return data


@dj.register(Content, site=site)
class ContentAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "content"
    form = ContentForm
    list_display = ("preview", "kind", "headline", "author", "status", "view_count", "published_at")
    list_filter = ("kind", "status", "published_at")
    search_fields = ("title", "body", "caption")
    date_hierarchy = "created_at"
    readonly_fields = ("view_count", "created_at", "published_at", "author")
    actions = ("publish", "unpublish", "remove")
    list_per_page = 40

    @dj.display(description="")
    def preview(self, obj):
        if not obj.media_url:
            return "—"
        if obj.kind == ContentKind.CLIP:
            return format_html(
                '<video src="{}" style="height:56px;border-radius:4px" muted></video>',
                obj.media_url,
            )
        return format_html(
            '<img src="{}" style="height:56px;width:56px;object-fit:cover;border-radius:4px">',
            obj.media_url,
        )

    @dj.display(description="What it says")
    def headline(self, obj):
        return (obj.title or obj.caption or obj.body or "—")[:70]

    @dj.display(description="Author")
    def author(self, obj):
        from apps.profiles.models import Profile

        p = Profile.objects.filter(pk=obj.author_id).only("name").first()
        return p.name if p and p.name else str(obj.author_id)[:8]

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_add_permission(self, request):
        return at_least(request, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_delete_permission(self, request, obj=None):
        """PRD §6 capability 6, verbatim: soft delete only. A removed post
        in a dispute is evidence. `remove` sets the status."""
        return False

    def save_model(self, request, obj, form, change):
        upload = form.cleaned_data.get("upload")
        if upload:
            obj.media_url = self._store(request, obj, upload)

        # An admin post is authored by the admin's own profile, not by a
        # nobody: the feed joins to `profiles` for a name, and content with
        # no real author renders blank.
        if not change:
            admin = admin_row(request)
            obj.author_id = admin.profile_id if admin else uuid.uuid4()

        # Publishing is what puts it in the feed. The seeker's feed orders
        # by published_at, so a published row without one sorts last
        # forever — set it here rather than trusting whoever fills the form.
        if obj.status == ContentStatus.LIVE and not obj.published_at:
            obj.published_at = timezone.now()
        super().save_model(request, obj, form, change)

    def _store(self, request, obj, upload):
        """Bytes to R2, a `media_assets` row, and the public URL back.

        The asset row exists so the file is accounted for — the same table
        the seeker path writes on confirm. An orphan object in a bucket is
        invisible until the storage bill arrives.
        """
        mime = upload.content_type or "application/octet-stream"
        family = mime.split("/")[0]
        admin = admin_row(request)
        owner = str(admin.profile_id) if admin else "console"
        key = media.make_bucket_key(owner, MIME_FAMILY_TO_UPLOAD_KIND[family], upload.name)

        url = media.get_provider().put_bytes(key, upload.read(), mime)
        MediaAsset.objects.create(
            owner=owner, kind=MIME_FAMILY_TO_MEDIA_KIND[family], bucket_key=key,
            mime=mime, size_bytes=upload.size, status=MediaStatus.READY,
        )
        record(request, "content.upload", "content", target_id=obj.pk,
               bucket_key=key, size_bytes=upload.size, mime=mime)
        return url

    def _set_status(self, request, queryset, status, verb):
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        for row in queryset:
            was = row.status
            fields = {"status": status}
            if status == ContentStatus.LIVE and not row.published_at:
                fields["published_at"] = timezone.now()
            Content.objects.filter(pk=row.pk).update(**fields)
            record(request, f"content.{verb}", "content", target_id=row.pk,
                   was=was, now=status, kind=row.kind)
        self.message_user(request, f"{queryset.count()} {verb}.")

    @dj.action(description="Publish — put it in the feed")
    def publish(self, request, queryset):
        self._set_status(request, queryset, ContentStatus.LIVE, "publish")

    @dj.action(description="Unpublish — back to draft")
    def unpublish(self, request, queryset):
        self._set_status(request, queryset, ContentStatus.DRAFT, "unpublish")

    @dj.action(description="Remove — off the feed, kept as evidence")
    def remove(self, request, queryset):
        self._set_status(request, queryset, ContentStatus.REMOVED, "remove")


# ── the moderation queue ────────────────────────────────────────────────────


@dj.register(Report, site=site)
class ReportAdmin(dj.ModelAdmin):
    """What people have complained about, oldest first.

    **Oldest first, not newest.** Every other list in this console is
    newest-first, and this one is the exception on purpose: the oldest
    unanswered complaint is the one somebody has been waiting on, and a
    newest-first queue buries it a little further every day.

    **Nothing here is automatic.** A count is not a verdict. Each action
    is an admin's own and writes its own audit line — see
    `apps/content/services` for why auto-hiding at N reports was not built.
    """

    audit_target = "report"
    list_display = ("what", "subject", "history", "reason", "reporter", "status", "created_at")
    list_filter = ("status", "reason", "created_at")
    search_fields = ("note",)
    date_hierarchy = "created_at"
    readonly_fields = ("content", "subject_id", "reporter_id", "reason", "note",
                       "reviewed_by", "reviewed_at", "outcome", "created_at")
    actions = ("dismiss", "remove_the_post", "block_the_person")
    list_per_page = 40
    ordering = ("created_at",)

    # A report is filed by a seeker, never typed here. The console reads
    # and decides; it does not author complaints.
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        """Never. Deleting a complaint is deleting the evidence that the
        complaint was answered the way it was."""
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        """Support can read the queue; acting on it is Fulfilment's.
        Reading a complaint and deciding somebody's account are different
        jobs, and the tier list is where that is said."""
        return at_least(request, Tier.FULFILMENT)

    @dj.display(description="What")
    def what(self, obj):
        if obj.content_id is None:
            return "The person"
        c = obj.content
        return format_html(
            '<a href="../../content/{}/change/">{} · {}</a>',
            c.pk, c.get_kind_display(),
            (c.title or c.caption or c.body or "—")[:48],
        )

    @dj.display(description="Who")
    def subject(self, obj):
        return _profile_label(obj.subject_id)

    @dj.display(description="Reported")
    def history(self, obj):
        """How many DIFFERENT people have complained about this account.

        The seeker's own reason for asking: *"koi user say report ho gya
        kal ko multiple times, toh ham block bhi kar skte hai"*. One
        complaint is a disagreement; eight is a pattern, and the number is
        the only way to tell them apart at a glance.
        """
        counts = services.reports_against(obj.subject_id)
        if counts["total"] <= 1:
            return "first time"
        return format_html(
            '<b style="color:#b00">{} times</b><br><small>{} still open</small>',
            counts["total"], counts["open"],
        )

    @dj.display(description="By")
    def reporter(self, obj):
        return _profile_label(obj.reporter_id)

    def _act(self, request, queryset, upheld, outcome, each=None):
        """One path for all three actions, so they cannot drift apart on
        who may act, what gets audited, or what the admin is told."""
        admin = admin_row(request)
        done = 0
        for report in queryset.filter(status=Report.Status.OPEN):
            if each:
                each(report)
            services.resolve_report(
                report.pk,
                admin_profile_id=admin.profile_id if admin else None,
                upheld=upheld, outcome=outcome,
            )
            record(request, f"report.{outcome}", "report", target_id=report.pk,
                   subject=str(report.subject_id), reason=report.reason)
            done += 1
        skipped = queryset.count() - done
        self.message_user(
            request,
            f"{done} report(s) {outcome}." + (f" {skipped} were already decided." if skipped else ""),
            messages.SUCCESS if done else messages.WARNING,
        )

    @dj.action(description="Dismiss — nothing wrong with it")
    def dismiss(self, request, queryset):
        self._act(request, queryset, upheld=False, outcome="dismissed")

    @dj.action(description="Remove the post — it leaves the feed, the account stays")
    def remove_the_post(self, request, queryset):
        """The lighter of the two. One bad post is not a bad person, and
        an account blocked over a single photo is how a moderation queue
        turns into a complaint queue of its own."""
        def take_it_down(report):
            if report.content_id:
                services.admin_remove_content(report.content_id)
                record(request, "content.remove", "content",
                       target_id=report.content_id, via="report")
        self._act(request, queryset, upheld=True, outcome="post removed",
                  each=take_it_down)

    @dj.action(description="Block the person — every post hidden, cannot post again")
    def block_the_person(self, request, queryset):
        """The heavy one. Their posts stop being served and new ones are
        refused. **Nothing is deleted** — unblocking puts it all back, and
        a removed account in a dispute is evidence."""
        def block(report):
            profile_services.set_blocked(
                report.subject_id, True,
                reason=f"Reported for {report.get_reason_display().lower()}",
            )
            record(request, "profile.block", "profile",
                   target_id=report.subject_id, via="report", reason=report.reason)
        self._act(request, queryset, upheld=True, outcome="person blocked",
                  each=block)


def _profile_label(profile_id):
    from apps.profiles.models import Profile

    p = Profile.objects.filter(pk=profile_id).only("name", "phone").first()
    if not p:
        return str(profile_id)[:8]
    return f"{p.name or '—'} · {p.phone}"
