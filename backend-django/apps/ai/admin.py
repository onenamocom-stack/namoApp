"""The AI Pros in the console (21 Oct 2026, Rahul): the box over each
category on Consult. One row per category, made by itself; the console
changes the name, the picture, the AI line and, if it wants, how it talks."""

from django import forms
from django.contrib import admin as dj
from django.utils.html import format_html

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import admin_row, at_least, site
from apps.media import providers as media
from apps.media.models import MediaAsset, MediaKind, MediaStatus

from . import services
from .models import AiBot


class AiBotForm(forms.ModelForm):
    upload = forms.FileField(required=False, label="Picture",
                             help_text="A square photo or drawing. It replaces the current one.")

    class Meta:
        model = AiBot
        fields = ("name", "upload", "image_url", "label", "label_hi", "prompt", "active", "sort")
        widgets = {
            "image_url": forms.TextInput(attrs={"size": 80}),
            "label": forms.TextInput(attrs={"size": 60}),
            "label_hi": forms.TextInput(attrs={"size": 60}),
            "prompt": forms.Textarea(attrs={"rows": 12, "cols": 90}),
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
            except Exception as exc:  # noqa: BLE001 — the reason is the message
                raise forms.ValidationError({"upload": str(exc)}) from None
        return data


@dj.register(AiBot, site=site)
class AiBotAdmin(AuditedAdmin, dj.ModelAdmin):
    """Seen only by new seekers, while their 5 free questions last. A new
    category gets its row the first time Consult is opened."""

    audit_target = "ai_bot"
    form = AiBotForm
    list_display = ("picture", "name", "category", "label", "active", "sort")
    list_editable = ("active", "sort")
    list_display_links = ("name",)
    readonly_fields = ("category", "key")
    fieldsets = (
        (None, {"fields": ("category", "key", "name", "upload", "image_url", "active", "sort")}),
        ("The AI line", {"fields": ("label", "label_hi")}),
        ("How it talks", {"fields": ("prompt",)}),
    )

    @dj.display(description="Picture")
    def picture(self, obj):
        if not obj.image_url:
            return "AI"
        return format_html('<img src="{}" style="height:40px;width:40px;object-fit:cover;border-radius:8px" alt="">',
                           obj.image_url)

    def changelist_view(self, request, extra_context=None):
        services.ai_bots()  # a new category's row exists before the list is read
        return super().changelist_view(request, extra_context)

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
            record(request, "ai_bot.picture", "ai_bot", target_id=obj.pk, bucket_key=key)
        super().save_model(request, obj, form, change)

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
