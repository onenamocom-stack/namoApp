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
from apps.content.models import Content, ContentKind, ContentStatus
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
