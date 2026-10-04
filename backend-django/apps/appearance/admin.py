"""Banners and themes in the console (4 Oct 2026).

Fulfilment runs them (the tier that already runs the shop and its photos);
superadmin can too. Every save is audited. Colours are picked with the
browser's colour picker; a banner picture uploads to R2 exactly as a product
photo does, and the row keeps the URL.
"""

from django import forms
from django.contrib import admin as dj
from django.utils import timezone
from django.utils.html import format_html

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import admin_row, at_least, site
from apps.media import providers as media
from apps.media.models import MediaAsset, MediaKind, MediaStatus

from .models import Banner, Theme

COLOUR = forms.TextInput(attrs={"type": "color", "style": "width:72px;height:36px;padding:2px"})


def _swatch(a, b=None):
    background = f"linear-gradient(135deg,{a},{b})" if b else a
    return format_html(
        '<span style="display:inline-block;width:56px;height:20px;border-radius:6px;background:{}"></span>',
        background,
    )


def _live(obj):
    now = timezone.now()
    if not obj.active:
        return "Off"
    if obj.starts_at and obj.starts_at > now:
        return f"Starts {timezone.localtime(obj.starts_at):%d %b %H:%M}"
    if obj.ends_at and obj.ends_at <= now:
        return "Ended"
    return "Showing now"


class _Tiered:
    def has_module_permission(self, request):
        return at_least(request, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_add_permission(self, request):
        return at_least(request, Tier.FULFILMENT)

    def has_delete_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)


class BannerForm(forms.ModelForm):
    upload = forms.FileField(
        required=False, label="Picture", help_text="Optional. Goes to R2; shown behind the text."
    )

    class Meta:
        model = Banner
        fields = (
            "placement", "kicker", "title", "note", "cta",
            "kicker_hi", "title_hi", "note_hi", "cta_hi",
            "link", "colour_from", "colour_to", "image_url", "upload",
            "sort", "replace_defaults", "active", "starts_at", "ends_at",
        )
        widgets = {
            "colour_from": COLOUR,
            "colour_to": COLOUR,
            "image_url": forms.TextInput(attrs={"size": 80}),
            "link": forms.TextInput(attrs={"size": 60}),
        }

    def clean(self):
        data = super().clean()
        upload = data.get("upload")
        if upload:
            mime = getattr(upload, "content_type", "") or ""
            if not mime.startswith("image/"):
                raise forms.ValidationError({"upload": f"That is not an image ({mime})."})
            try:
                media.validate_upload("image", upload.name, upload.size, mime)
            except media.ValidationError as exc:
                raise forms.ValidationError({"upload": str(exc)}) from None
        link = (data.get("link") or "").strip()
        if link and not (link.startswith("/") or link.startswith("https://")):
            raise forms.ValidationError({"link": "Start with / for a page in the app, or https:// for a website."})
        starts, ends = data.get("starts_at"), data.get("ends_at")
        if starts and ends and ends <= starts:
            raise forms.ValidationError({"ends_at": "The end must be after the start."})
        return data


@dj.register(Banner, site=site)
class BannerAdmin(_Tiered, AuditedAdmin, dj.ModelAdmin):
    """The promo rail on Consult, Shop and Bhakti. Yours appear before the
    built-in ones; tick "Replace defaults" to hide the built-in ones on that
    screen while yours shows. Set a start and end to schedule it."""

    audit_target = "banner"
    form = BannerForm
    list_display = ("title", "placement", "colours", "status", "sort", "starts_at", "ends_at")
    list_filter = ("placement", "active")
    search_fields = ("title", "kicker", "note")
    ordering = ("placement", "sort", "-created_at")
    fieldsets = (
        ("Where", {"fields": ("placement", "sort", "replace_defaults")}),
        ("Text", {"fields": ("kicker", "title", "note", "cta")}),
        ("Hindi (optional; English is used where empty)", {"fields": ("kicker_hi", "title_hi", "note_hi", "cta_hi")}),
        ("Look and tap", {"fields": ("colour_from", "colour_to", "upload", "image_url", "link")}),
        ("When", {"fields": ("active", "starts_at", "ends_at")}),
    )

    @dj.display(description="Colours")
    def colours(self, obj):
        return _swatch(obj.colour_from, obj.colour_to)

    @dj.display(description="Status")
    def status(self, obj):
        return _live(obj)

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
            record(request, "banner.picture", "banner", target_id=obj.pk, bucket_key=key)
        super().save_model(request, obj, form, change)


class ThemeForm(forms.ModelForm):
    class Meta:
        model = Theme
        fields = ("name", "accent", "button", "greeting", "greeting_hi", "active", "starts_at", "ends_at")
        widgets = {"accent": COLOUR, "button": COLOUR}

    def clean(self):
        data = super().clean()
        starts, ends = data.get("starts_at"), data.get("ends_at")
        if starts and ends and ends <= starts:
            raise forms.ValidationError({"ends_at": "The end must be after the start."})
        return data


@dj.register(Theme, site=site)
class ThemeAdmin(_Tiered, AuditedAdmin, dj.ModelAdmin):
    """A festive look for a date window: the accent colour (the saffron),
    the button colour (the green), and an optional greeting strip. The
    newest theme showing now wins; with none, the app looks as usual."""

    audit_target = "theme"
    form = ThemeForm
    list_display = ("name", "colours", "greeting", "status", "starts_at", "ends_at")
    list_filter = ("active",)

    @dj.display(description="Accent · button")
    def colours(self, obj):
        return format_html("{} {}", _swatch(obj.accent), _swatch(obj.button))

    @dj.display(description="Status")
    def status(self, obj):
        return _live(obj)
