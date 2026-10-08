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

from .models import BhaktiAsset, DarshanDeity, DarshanImage

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
            "source": "Optional. Where the file came from — a link, or e.g. “Own recording” — for attribution.",
            "media_url": "Leave empty when you upload a file: it fills itself. Or paste a link to a file instead of uploading.",
        }

    def __init__(self, *args, **kwargs):
        # Upload OR link (6 Oct 2026): the model's columns are NOT NULL, so
        # the form marked both required and an upload alone never saved.
        # The link is written by save_model from the upload; the source is
        # an attribution note, empty when there is nothing to credit.
        super().__init__(*args, **kwargs)
        self.fields["media_url"].required = False
        self.fields["source"].required = False

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
        data["source"] = data.get("source") or ""
        data["media_url"] = data.get("media_url") or ""
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


# ── Darshan (8 Oct 2026, Rahul) ─────────────────────────────────────────────
# The darshan page's deities (the pills) and their murtis — each a photo from
# a temple, with the temple's name and place shown on the plaque over it.
# Same upload path as the library above; nothing is deleted.


class _FulfilmentRuns(dj.ModelAdmin):
    def has_delete_permission(self, request, obj=None):
        return False  # untick Active instead

    def has_module_permission(self, request):
        return at_least(request, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_add_permission(self, request):
        return at_least(request, Tier.FULFILMENT)


@dj.register(DarshanDeity, site=site)
class DarshanDeityAdmin(AuditedAdmin, _FulfilmentRuns):
    audit_target = "darshan_deity"
    list_display = ("name", "name_hi", "murtis", "sort", "active")
    list_editable = ("sort", "active")
    ordering = ("sort", "name")
    fields = ("name", "name_hi", "sort", "active")

    @dj.display(description="Murtis")
    def murtis(self, obj):
        return obj.images.filter(active=True).count()


class DarshanImageForm(forms.ModelForm):
    upload = forms.ImageField(
        required=False,
        label="New photo",
        help_text="Portrait, about 1080 × 1440 (3:4). Keep the murti in the middle — the plaque covers the top "
        "tenth and the thali the bottom sixth. Replaces the current photo.",
    )

    class Meta:
        model = DarshanImage
        fields = (
            "deity", "temple", "temple_hi", "location", "location_hi",
            "image_url", "upload", "title", "credit", "sort", "active",
        )
        widgets = {
            "temple": forms.TextInput(attrs={"size": 50}),
            "temple_hi": forms.TextInput(attrs={"size": 50}),
            "location": forms.TextInput(attrs={"size": 50}),
            "location_hi": forms.TextInput(attrs={"size": 50}),
            "image_url": forms.TextInput(attrs={"size": 80}),
            "title": forms.TextInput(attrs={"size": 50}),
            "credit": forms.TextInput(attrs={"size": 80}),
        }
        labels = {
            "temple": "Temple name",
            "temple_hi": "Temple name (Hindi)",
            "location_hi": "Location (Hindi)",
            "image_url": "Photo URL",
        }
        help_texts = {
            "temple": "On the plaque, e.g. Shri Siddhivinayak Mandir. Empty: “Shri <deity> Mandir”.",
            "location": "Under the name, e.g. Prabhadevi, Mumbai. Empty: the plaque shows the title instead.",
            "temple_hi": "Shown when the app is in Hindi. Empty: the English name.",
            "location_hi": "Shown when the app is in Hindi. Empty: the English location.",
            "image_url": "Leave empty when you upload a photo: it fills itself. Or paste a link to a photo.",
            "title": "Optional. What the photo shows, e.g. Shringar darshan — in the murti picker.",
            "credit": "Optional. Who took or owns the photo — shown in the murti picker.",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["image_url"].required = False

    def clean(self):
        data = super().clean()
        upload = data.get("upload")
        if upload:
            mime = getattr(upload, "content_type", "") or ""
            try:
                media.validate_upload("image", upload.name, upload.size, mime)
            except media.ValidationError as exc:
                raise forms.ValidationError({"upload": str(exc)}) from None
        elif not data.get("image_url"):
            raise forms.ValidationError({"upload": "Add a photo, or paste its URL above."})
        data["image_url"] = data.get("image_url") or ""
        return data


@dj.register(DarshanImage, site=site)
class DarshanImageAdmin(AuditedAdmin, _FulfilmentRuns):
    audit_target = "darshan_image"
    form = DarshanImageForm
    list_display = ("thumb", "plaque", "deity", "sort", "active")
    list_display_links = ("thumb", "plaque")
    list_filter = ("deity", "active")
    list_editable = ("sort", "active")
    search_fields = ("temple", "location", "title", "deity__name")
    ordering = ("deity__sort", "sort")
    readonly_fields = ("preview",)
    fieldsets = (
        ("Plaque", {"fields": ("deity", "temple", "location", "temple_hi", "location_hi")}),
        ("Photo", {"fields": ("preview", "upload", "image_url")}),
        ("In the murti picker", {"fields": ("title", "credit")}),
        ("Showing", {"fields": ("sort", "active")}),
    )

    @dj.display(description="")
    def thumb(self, obj):
        return format_html(
            '<img src="{}" style="width:48px;height:64px;object-fit:cover;border-radius:8px">', _site_url(obj.image_url),
        )

    @dj.display(description="Plaque")
    def plaque(self, obj):
        return format_html(
            "{}<br><small>{}</small>", obj.temple or f"Shri {obj.deity.name} Mandir", obj.location or obj.title,
        )

    @dj.display(description="Current photo")
    def preview(self, obj):
        if not obj.image_url:
            return "—"
        return format_html('<img src="{}" style="max-width:240px;border-radius:12px">', _site_url(obj.image_url))

    def save_model(self, request, obj, form, change):
        upload = form.cleaned_data.get("upload")
        if upload:
            admin = admin_row(request)
            owner = str(admin.profile_id) if admin else "console"
            mime = upload.content_type or "image/jpeg"
            key = media.make_bucket_key(owner, "image", upload.name)
            obj.image_url = media.get_provider().put_bytes(key, upload.read(), mime)
            MediaAsset.objects.create(
                owner=owner, kind=MediaKind.IMAGE, bucket_key=key, mime=mime,
                size_bytes=upload.size, status=MediaStatus.READY,
            )
            record(request, "darshan_image.file", "darshan_image", target_id=obj.pk, bucket_key=key)
        super().save_model(request, obj, form, change)


def _site_url(url):
    """The seeded murtis are files in the app (`/deities/...`); the console
    is another host, so show those from the app's own domain."""
    return f"https://1namo.com{url}" if url.startswith("/") else url
