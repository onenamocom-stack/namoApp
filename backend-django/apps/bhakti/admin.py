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
from django.contrib import messages
from django.utils.html import format_html

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import admin_row, at_least, site
from apps.media import providers as media
from apps.media.models import MediaAsset, MediaKind, MediaStatus
from apps.shop.admin import RupeeField

from .models import BhaktiAsset, DarshanDeity, DarshanImage

AUDIO_KINDS = {BhaktiAsset.Kind.TUNE, BhaktiAsset.Kind.BHAJAN, BhaktiAsset.Kind.MANTRA}
# A status may be a video too (19 Oct 2026, Rahul): shared to WhatsApp as
# the file itself. 30 MB keeps the upload inside Cloud Run's request size;
# WhatsApp's own status video is shorter than that.
VIDEO_STATUS_BYTES = 30 * 1024 * 1024
VIDEO_EXTS = (".mp4", ".webm", ".mov", ".m4v")


STATUS_VIDEO_SECONDS = 30


def mp4_seconds(data):
    """An MP4's length from its `mvhd` box, or None when it cannot be read
    (the console has no ffprobe). Version 0 keeps 32-bit times, 1 keeps 64."""
    import struct

    at = data.find(b"mvhd")
    if at < 0 or len(data) < at + 32:
        return None
    version = data[at + 4]
    try:
        if version == 1:
            scale, length = struct.unpack(">IQ", data[at + 24:at + 36])
        else:
            scale, length = struct.unpack(">II", data[at + 16:at + 24])
    except struct.error:
        return None
    return length / scale if scale else None


def is_video(url):
    return (url or "").split("?")[0].lower().endswith(VIDEO_EXTS)


def _want(kind, mime):
    """What an upload must be for this kind: audio, image, or (a status) video."""
    if kind in AUDIO_KINDS:
        return "audio"
    if kind == BhaktiAsset.Kind.STATUS and mime.startswith("video/"):
        return "video"
    return "image"


class BhaktiAssetForm(forms.ModelForm):
    # An e-book's MRP, struck through beside its price (15 Oct 2026, Rahul).
    mrp = RupeeField(label="MRP (struck through)", required=False,
                     help_text="In rupees. For a priced e-book; leave blank for none.")
    upload = forms.FileField(
        required=False,
        label="New file",
        help_text="A picture for status and wallpapers (a status can be a video: MP4, up to 30 seconds and 30 MB), audio for tunes, bhajans and mantras. Replaces the current one.",
    )
    cover = forms.ImageField(
        required=False,
        label="Cover picture (video status)",
        help_text="Optional. Shown before a video status plays and on its WhatsApp link preview.",
    )

    class Meta:
        model = BhaktiAsset
        fields = (
            "kind", "title", "deity", "artist", "licence", "source",
            "media_url", "preview_url", "upload", "description", "sort", "active",
            "show_from", "show_until",
        )
        widgets = {
            "title": forms.TextInput(attrs={"size": 60}),
            "deity": forms.TextInput(attrs={"size": 30}),
            "artist": forms.TextInput(attrs={"size": 40}),
            "licence": forms.TextInput(attrs={"size": 30}),
            "source": forms.TextInput(attrs={"size": 80}),
            "media_url": forms.TextInput(attrs={"size": 80}),
            "preview_url": forms.TextInput(attrs={"size": 80}),
            "description": forms.Textarea(attrs={"rows": 8, "cols": 80}),
        }
        help_texts = {
            "title": "The caption, e.g. Ganesh — good beginnings",
            "artist": "Shown under the caption, e.g. Raja Ravi Varma",
            "licence": "Shown after the artist, e.g. Public domain",
            "source": "Optional. Where the file came from — a link, or e.g. “Own recording” — for attribution.",
            "media_url": "Leave empty when you upload a file: it fills itself. Or paste a link to a file instead of uploading.",
            "description": "For a download's own page: what is in it. ## for a heading, **bold**, - for a list.",
        }

    def __init__(self, *args, **kwargs):
        # Upload OR link (6 Oct 2026): the model's columns are NOT NULL, so
        # the form marked both required and an upload alone never saved.
        # The link is written by save_model from the upload; the source is
        # an attribution note, empty when there is nothing to credit.
        super().__init__(*args, **kwargs)
        self.fields["media_url"].required = False
        self.fields["source"].required = False
        if self.instance and self.instance.pk:
            self.fields["mrp"].initial = self.instance.mrp_paise

    def clean(self):
        data = super().clean()
        price, mrp = self.instance.price_paise if self.instance else None, data.get("mrp")
        if mrp is not None and price is not None and mrp <= price:
            raise forms.ValidationError({"mrp": "The MRP must be above the price, or left blank."})
        upload = data.get("upload")
        if upload:
            mime = getattr(upload, "content_type", "") or ""
            want = _want(data.get("kind"), mime)
            if not mime.startswith(f"{want}/"):
                raise forms.ValidationError({"upload": f"This kind needs {want}, not {mime or 'that file'}."})
            if want == "video" and upload.size > VIDEO_STATUS_BYTES:
                raise forms.ValidationError({"upload": "A video status can be up to 30 MB."})
            if want == "video" and not upload.name.lower().endswith(VIDEO_EXTS):
                raise forms.ValidationError({"upload": "Upload the video as MP4."})
            if want == "video":
                # 30 seconds, WhatsApp's own status length, and quick for the
                # phone to put the card on (19 Oct 2026, Rahul).
                seconds = mp4_seconds(upload.read())
                upload.seek(0)
                if seconds and seconds > STATUS_VIDEO_SECONDS + 0.5:
                    raise forms.ValidationError(
                        {"upload": f"A video status can be up to {STATUS_VIDEO_SECONDS} seconds. This one is {round(seconds)}."})
            try:
                media.validate_upload("reel" if want == "video" else want, upload.name, upload.size, mime)
            except media.ValidationError as exc:
                raise forms.ValidationError({"upload": str(exc)}) from None
        elif not data.get("media_url"):
            raise forms.ValidationError({"upload": "Add a file, or paste its URL above."})
        data["source"] = data.get("source") or ""
        data["media_url"] = data.get("media_url") or ""
        return data

    def save(self, commit=True):
        self.instance.mrp_paise = self.cleaned_data.get("mrp")
        return super().save(commit)


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

    def get_queryset(self, request):
        # A Darshan murti's hidden row is the darshan page's, kept in step
        # with Darshan pictures (24 Oct 2026); it is not edited here.
        return super().get_queryset(request).exclude(kind=BhaktiAsset.Kind.DARSHAN)

    fieldsets = (
        ("What it is", {"fields": ("kind", "deity", "title")}),
        ("Credit line", {"fields": ("artist", "licence", "source")}),
        ("File", {"fields": ("preview", "upload", "cover", "media_url", "preview_url")}),
        ("Market (downloads)", {"fields": ("mrp", "description")}),
        ("Showing", {"fields": ("sort", "active", "show_from", "show_until"),
                     "description": "Show from / until: the days (IST) a dated card shows, both included. "
                                    "Empty: always. Category: one or more, comma-separated, in the deity box."}),
    )

    @dj.display(description="")
    def thumb(self, obj):
        if obj.kind in AUDIO_KINDS:
            return "♪"
        if is_video(obj.media_url) and not obj.preview_url:
            return "▶"
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
        if is_video(obj.media_url):
            return format_html('<video controls src="{}" poster="{}" style="max-width:240px;border-radius:12px"></video>',
                               obj.media_url, obj.preview_url or "")
        return format_html('<img src="{}" style="max-width:240px;border-radius:12px">', obj.media_url)

    def save_model(self, request, obj, form, change):
        upload = form.cleaned_data.get("upload")
        if upload:
            admin = admin_row(request)
            owner = str(admin.profile_id) if admin else "console"
            kind = _want(obj.kind, upload.content_type or "")
            mime = upload.content_type or ("audio/mpeg" if kind == "audio" else "image/jpeg")
            key = media.make_bucket_key(owner, "reel" if kind == "video" else kind, upload.name)
            obj.media_url = media.get_provider().put_bytes(key, upload.read(), mime)
            if kind == "image":
                obj.preview_url = obj.media_url
            elif kind == "video" and is_video(obj.preview_url or ""):
                obj.preview_url = None
            MediaAsset.objects.create(
                owner=owner,
                kind={"audio": MediaKind.AUDIO, "video": MediaKind.REEL}.get(kind, MediaKind.IMAGE),
                bucket_key=key, mime=mime, size_bytes=upload.size, status=MediaStatus.READY,
            )
            record(request, "bhakti_asset.file", "bhakti_asset", target_id=obj.pk, bucket_key=key)
        cover = form.cleaned_data.get("cover")
        if cover:
            admin = admin_row(request)
            owner = str(admin.profile_id) if admin else "console"
            key = media.make_bucket_key(owner, "image", cover.name)
            obj.preview_url = media.get_provider().put_bytes(key, cover.read(), cover.content_type or "image/jpeg")
            MediaAsset.objects.create(owner=owner, kind=MediaKind.IMAGE, bucket_key=key,
                                      mime=cover.content_type or "image/jpeg", size_bytes=cover.size,
                                      status=MediaStatus.READY)
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
    """One murti's frame: a photo, a video or a YouTube link (20 Oct 2026,
    Rahul: "either image or video or yt video link in darshan deity. Anyone
    ... will show in this frame"). A YouTube link is checked with YouTube on
    save and refused when it does not play inside other apps: the app never
    sends anybody to YouTube."""

    upload = forms.ImageField(
        required=False,
        label="New photo",
        help_text="Portrait, about 1080 × 1440 (3:4). Keep the murti in the middle — the plaque covers the top "
        "tenth and the thali the bottom sixth. Replaces the current photo. With a video or YouTube link it is "
        "only the cover and the picture in the murti picker.",
    )
    video_upload = forms.FileField(
        required=False,
        label="New video",
        help_text="MP4, up to 30 MB. Plays on a loop in the frame, without sound. Replaces the current video.",
    )

    class Meta:
        model = DarshanImage
        fields = (
            "deity", "temple", "temple_hi", "location", "location_hi",
            "image_url", "upload", "video_url", "video_upload", "youtube_url",
            "live_hours", "live_hours_hi", "title", "credit", "sort", "active",
        )
        widgets = {
            "temple": forms.TextInput(attrs={"size": 50}),
            "temple_hi": forms.TextInput(attrs={"size": 50}),
            "location": forms.TextInput(attrs={"size": 50}),
            "location_hi": forms.TextInput(attrs={"size": 50}),
            "image_url": forms.TextInput(attrs={"size": 80}),
            "video_url": forms.TextInput(attrs={"size": 80}),
            "youtube_url": forms.TextInput(attrs={"size": 80}),
            "live_hours": forms.TextInput(attrs={"size": 50}),
            "live_hours_hi": forms.TextInput(attrs={"size": 50}),
            "title": forms.TextInput(attrs={"size": 50}),
            "credit": forms.TextInput(attrs={"size": 80}),
        }
        labels = {
            "temple": "Temple name",
            "temple_hi": "Temple name (Hindi)",
            "location_hi": "Location (Hindi)",
            "image_url": "Photo URL",
            "video_url": "Video URL",
            "youtube_url": "YouTube link",
            "live_hours": "Live timings",
            "live_hours_hi": "Live timings (Hindi)",
        }
        help_texts = {
            "temple": "On the plaque, e.g. Shri Siddhivinayak Mandir. Empty: “Shri <deity> Mandir”.",
            "location": "Under the name, e.g. Prabhadevi, Mumbai. Empty: the plaque shows the title instead.",
            "temple_hi": "Shown when the app is in Hindi. Empty: the English name.",
            "location_hi": "Shown when the app is in Hindi. Empty: the English location.",
            "image_url": "Leave empty when you upload a photo: it fills itself. Or paste a link to a photo.",
            "video_url": "Leave empty when you upload a video. Clear it to stop showing the video.",
            "youtube_url": "A temple's live darshan: the live video's link, or its channel (youtube.com/@name) "
                           "when each day's stream is a new video. Shown before a video or photo. Checked on save: "
                           "a stream that does not allow playing in other apps is refused. Clear it to stop.",
            "live_hours": "For a channel link. Shown while the temple is not live, e.g. Daily 5–7 AM, 7–9 PM. "
                          "A stream the temple scheduled on YouTube shows its own time first.",
            "live_hours_hi": "Shown when the app is in Hindi, e.g. रोज़ सुबह 5–7, शाम 7–9. Empty: the English line.",
            "title": "Optional. What the photo shows, e.g. Shringar darshan — in the murti picker.",
            "credit": "Optional. Who took or owns the photo — shown in the murti picker.",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name in ("image_url", "video_url", "youtube_url"):
            self.fields[name].required = False

    def clean(self):
        from . import youtube

        data = super().clean()
        upload, video = data.get("upload"), data.get("video_upload")
        if upload:
            mime = getattr(upload, "content_type", "") or ""
            try:
                media.validate_upload("image", upload.name, upload.size, mime)
            except media.ValidationError as exc:
                raise forms.ValidationError({"upload": str(exc)}) from None
        if video:
            mime = getattr(video, "content_type", "") or ""
            if video.size > VIDEO_STATUS_BYTES:
                raise forms.ValidationError({"video_upload": "A video can be up to 30 MB."})
            if not video.name.lower().endswith(VIDEO_EXTS) or not mime.startswith("video/"):
                raise forms.ValidationError({"video_upload": "Upload the video as MP4."})
            try:
                media.validate_upload("reel", video.name, video.size, mime)
            except media.ValidationError as exc:
                raise forms.ValidationError({"video_upload": str(exc)}) from None
        link = (data.get("youtube_url") or "").strip()
        self.youtube_ids = ("", "")
        if link:
            same = self.instance.pk and link == self.instance.youtube_url and (
                self.instance.youtube_video_id or self.instance.youtube_channel_id)
            try:
                if same:
                    self.youtube_ids = (self.instance.youtube_video_id, self.instance.youtube_channel_id)
                else:
                    video_id, channel_id, self.youtube_note = youtube.check(link)
                    self.youtube_ids = (video_id, channel_id)
            except youtube.Refused as err:
                raise forms.ValidationError({"youtube_url": str(err)}) from None
        if not (upload or video or link or data.get("image_url") or data.get("video_url")):
            raise forms.ValidationError({"upload": "Add a photo, a video or a YouTube link."})
        for name in ("image_url", "video_url"):
            data[name] = data.get(name) or ""
        data["youtube_url"] = link
        return data


@dj.register(DarshanImage, site=site)
class DarshanImageAdmin(AuditedAdmin, _FulfilmentRuns):
    audit_target = "darshan_image"
    form = DarshanImageForm
    list_display = ("thumb", "plaque", "shows", "deity", "sort", "active")
    list_display_links = ("thumb", "plaque")
    list_filter = ("deity", "active")
    list_editable = ("sort", "active")
    search_fields = ("temple", "location", "title", "deity__name")
    ordering = ("deity__sort", "sort")
    readonly_fields = ("preview",)
    fieldsets = (
        ("Plaque", {"fields": ("deity", "temple", "location", "temple_hi", "location_hi")}),
        ("In the frame: a photo, a video or a YouTube link", {"fields": (
            "preview", "youtube_url", "live_hours", "live_hours_hi", "video_upload", "video_url", "upload", "image_url")}),
        ("In the murti picker", {"fields": ("title", "credit")}),
        ("Showing", {"fields": ("sort", "active")}),
    )

    @dj.display(description="")
    def thumb(self, obj):
        from . import youtube

        src = _site_url(obj.image_url) or youtube.thumbnail(obj)
        if not src:
            return "▶"
        return format_html('<img src="{}" style="width:48px;height:64px;object-fit:cover;border-radius:8px">', src)

    @dj.display(description="Shows")
    def shows(self, obj):
        return "YouTube" if obj.youtube_url else "Video" if obj.video_url else "Photo"

    @dj.display(description="Plaque")
    def plaque(self, obj):
        return format_html(
            "{}<br><small>{}</small>", obj.temple or f"Shri {obj.deity.name} Mandir", obj.location or obj.title,
        )

    @dj.display(description="In the frame now")
    def preview(self, obj):
        from . import youtube

        if obj.youtube_video_id or obj.youtube_channel_id:
            return format_html('<iframe src="{}" width="360" height="203" style="border:0;border-radius:8px" '
                               'allow="autoplay; encrypted-media" allowfullscreen></iframe>', youtube.embed_url(obj))
        if obj.video_url:
            return format_html('<video controls muted src="{}" poster="{}" style="max-width:240px;border-radius:12px">'
                               '</video>', obj.video_url, _site_url(obj.image_url))
        if not obj.image_url:
            return "—"
        return format_html('<img src="{}" style="max-width:240px;border-radius:12px">', _site_url(obj.image_url))

    def _put(self, request, obj, upload, kind, media_kind, mime):
        admin = admin_row(request)
        owner = str(admin.profile_id) if admin else "console"
        key = media.make_bucket_key(owner, kind, upload.name)
        url = media.get_provider().put_bytes(key, upload.read(), mime)
        MediaAsset.objects.create(owner=owner, kind=media_kind, bucket_key=key, mime=mime,
                                  size_bytes=upload.size, status=MediaStatus.READY)
        record(request, "darshan_image.file", "darshan_image", target_id=obj.pk, bucket_key=key)
        return url

    def save_model(self, request, obj, form, change):
        upload, video = form.cleaned_data.get("upload"), form.cleaned_data.get("video_upload")
        if upload:
            obj.image_url = self._put(request, obj, upload, "image", MediaKind.IMAGE, upload.content_type or "image/jpeg")
        if video:
            obj.video_url = self._put(request, obj, video, "reel", MediaKind.REEL, video.content_type or "video/mp4")
        obj.youtube_video_id, obj.youtube_channel_id = form.youtube_ids
        note = getattr(form, "youtube_note", "")
        if note:
            self.message_user(request, note, messages.WARNING)
        super().save_model(request, obj, form, change)


def _site_url(url):
    """The seeded murtis are files in the app (`/deities/...`); the console
    is another host, so show those from the app's own domain."""
    return f"https://1namo.com{url}" if (url or "").startswith("/") else url

