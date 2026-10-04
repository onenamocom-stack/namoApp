"""Bhakti in the console (4 Oct 2026, owner's request): every status,
wallpaper, tune, bhajan and mantra — the picture or the audio, the caption
("Ganesh — good beginnings"), the artist and licence line under it
("Raja Ravi Varma · Public domain"), the order, and whether it shows.

A new file uploads to R2 exactly as a product photo does; the row keeps the
URL. Nothing is deleted — untick Active to withdraw one (024's rule).
Fulfilment runs it, the tier that already runs the shop's pictures.
"""

from django import forms
from django.contrib import admin as dj
from django.utils.html import format_html

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import admin_row, at_least, site
from apps.media import providers as media
from apps.media.models import MediaAsset, MediaKind, MediaStatus

from .models import BhaktiAsset

AUDIO_KINDS = {BhaktiAsset.Kind.TUNE, BhaktiAsset.Kind.BHAJAN, BhaktiAsset.Kind.MANTRA}


class BhaktiAssetForm(forms.ModelForm):
    upload = forms.FileField(
        required=False,
        label="New file",
        help_text="A picture for status and wallpapers, audio for tunes, bhajans and mantras. Replaces the current one.",
    )

    class Meta:
        model = BhaktiAsset
        fields = (
            "kind", "title", "deity", "artist", "licence", "source",
            "media_url", "preview_url", "upload", "sort", "active",
        )
        widgets = {
            "title": forms.TextInput(attrs={"size": 60}),
            "deity": forms.TextInput(attrs={"size": 30}),
            "artist": forms.TextInput(attrs={"size": 40}),
            "licence": forms.TextInput(attrs={"size": 30}),
            "source": forms.TextInput(attrs={"size": 80}),
            "media_url": forms.TextInput(attrs={"size": 80}),
            "preview_url": forms.TextInput(attrs={"size": 80}),
        }
        help_texts = {
            "title": "The caption, e.g. Ganesh — good beginnings",
            "artist": "Shown under the caption, e.g. Raja Ravi Varma",
            "licence": "Shown after the artist, e.g. Public domain",
            "source": "Where the file came from (a URL), for attribution",
        }

    def clean(self):
        data = super().clean()
        upload = data.get("upload")
        if upload:
            mime = getattr(upload, "content_type", "") or ""
            want = "audio" if data.get("kind") in AUDIO_KINDS else "image"
            if not mime.startswith(f"{want}/"):
                raise forms.ValidationError({"upload": f"This kind needs {want}, not {mime or 'that file'}."})
            try:
                media.validate_upload(want, upload.name, upload.size, mime)
            except media.ValidationError as exc:
                raise forms.ValidationError({"upload": str(exc)}) from None
        elif not data.get("media_url"):
            raise forms.ValidationError({"upload": "Add a file, or paste its URL above."})
        return data


@dj.register(BhaktiAsset, site=site)
class BhaktiAssetAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "bhakti_asset"
    form = BhaktiAssetForm
    list_display = ("thumb", "title", "kind", "deity", "credit", "sort", "active")
    list_display_links = ("thumb", "title")
    list_filter = ("kind", "active", "deity")
    list_editable = ("sort", "active")
    search_fields = ("title", "deity", "artist")
    ordering = ("kind", "sort")
    readonly_fields = ("preview",)
    fieldsets = (
        ("What it is", {"fields": ("kind", "deity", "title")}),
        ("Credit line", {"fields": ("artist", "licence", "source")}),
        ("File", {"fields": ("preview", "upload", "media_url", "preview_url")}),
        ("Showing", {"fields": ("sort", "active")}),
    )

    @dj.display(description="")
    def thumb(self, obj):
        if obj.kind in AUDIO_KINDS:
            return "♪"
        return format_html(
            '<img src="{}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">',
            obj.preview_url or obj.media_url,
        )

    @dj.display(description="Credit")
    def credit(self, obj):
        return f"{obj.artist} · {obj.licence}"

    @dj.display(description="Current file")
    def preview(self, obj):
        if not obj.media_url:
            return "—"
        if obj.kind in AUDIO_KINDS:
            return format_html('<audio controls src="{}" style="width:320px"></audio>', obj.media_url)
        return format_html('<img src="{}" style="max-width:240px;border-radius:12px">', obj.media_url)

    def save_model(self, request, obj, form, change):
        upload = form.cleaned_data.get("upload")
        if upload:
            admin = admin_row(request)
            owner = str(admin.profile_id) if admin else "console"
            kind = "audio" if obj.kind in AUDIO_KINDS else "image"
            mime = upload.content_type or ("audio/mpeg" if kind == "audio" else "image/jpeg")
            key = media.make_bucket_key(owner, kind, upload.name)
            obj.media_url = media.get_provider().put_bytes(key, upload.read(), mime)
            if kind == "image":
                obj.preview_url = obj.media_url
            MediaAsset.objects.create(
                owner=owner, kind=MediaKind.AUDIO if kind == "audio" else MediaKind.IMAGE,
                bucket_key=key, mime=mime, size_bytes=upload.size, status=MediaStatus.READY,
            )
            record(request, "bhakti_asset.file", "bhakti_asset", target_id=obj.pk, bucket_key=key)
        super().save_model(request, obj, form, change)

    def has_delete_permission(self, request, obj=None):
        return False  # untick Active instead; nothing is hard-deleted (024)

    def has_module_permission(self, request):
        return at_least(request, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_add_permission(self, request):
        return at_least(request, Tier.FULFILMENT)
