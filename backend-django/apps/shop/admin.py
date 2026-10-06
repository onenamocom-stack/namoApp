"""The shop, in the console.

Stage 2 of the admin build. What an operator must be able to do without
touching SQL: add a product with a picture, change a price, take something
out of stock, write a coupon, look at an order, and move a parcel along.

MONEY IS SHOWN IN RUPEES AND STORED IN PAISE. Every amount in this product
is an integer number of paise (backend/INSTRUCTIONS.md rule 1) and every
operator thinks in rupees. The forms take rupees and convert; the list
columns render rupees from paise. Nothing here stores a float.
"""

from decimal import Decimal

from django import forms
from django.utils.text import slugify
from django.contrib import admin as dj, messages
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import admin_row, at_least, site
from apps.media import providers as media
from apps.media.models import MediaAsset, MediaKind, MediaStatus
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone

from . import delivery, sheet, shiprocket

from .models import (
    Coupon, Order, OrderItem, Product, Shipment, ShippingAddress,
    ShopCategory, ShopSubcategory,
)


def rupees(paise):
    """Paise to a rupee string. The one place the console divides."""
    if paise is None:
        return "—"
    return f"₹{paise / 100:,.2f}".replace(".00", "")


class RupeeField(forms.DecimalField):
    """A price typed in rupees, stored in paise.

    Not a plain IntegerField on the paise column: asking an operator to
    type 1850000 for ₹18,500 is asking for a factor-of-ten mistake on a
    gemstone, and that mistake is a real order at a real wrong price.
    """

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("max_digits", 12)
        kwargs.setdefault("decimal_places", 2)
        kwargs.setdefault("help_text", "In rupees. ₹1,850 not 185000.")
        super().__init__(*args, **kwargs)

    def prepare_value(self, value):
        if isinstance(value, int):
            return Decimal(value) / 100
        return value

    def clean(self, value):
        amount = super().clean(value)
        return None if amount is None else int(round(amount * 100))


# A product video comes through the console's own request, and Cloud Run
# refuses a request body over 32 MB; a longer one goes in as a link.
PRODUCT_VIDEO_MAX = 30 * 1024 * 1024


class MultipleImages(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleImageField(forms.FileField):
    """Several photos or videos in one pick. Django's FileField takes one;
    this takes a list and validates each."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("widget", MultipleImages(attrs={"accept": "image/*,video/*"}))
        super().__init__(*args, **kwargs)

    def clean(self, data, initial=None):
        single = super().clean
        if isinstance(data, (list, tuple)):
            return [single(d, initial) for d in data if d]
        return [single(data, initial)] if data else []


def faq_to_text(items):
    return "\n\n".join(f"{i.get('q', '')}\n{i.get('a', '')}" for i in items or [] if isinstance(i, dict))


def text_to_faq(text):
    """Blocks separated by a blank line; each block's first line is the
    question and the rest is the answer."""
    out = []
    for block in (text or "").replace("\r\n", "\n").split("\n\n"):
        lines = [ln.strip() for ln in block.strip().split("\n") if ln.strip()]
        if not lines:
            continue
        if len(lines) < 2:
            raise forms.ValidationError(f"“{lines[0][:60]}” has no answer. Put the answer on the line under the question.")
        out.append({"q": lines[0], "a": " ".join(lines[1:])})
    return out


class ProductForm(forms.ModelForm):
    price = RupeeField(label="Price")
    mrp = RupeeField(label="MRP (struck through)", required=False)
    # FileField, not ImageField: ImageField decodes the file to prove it is
    # an image, which needs Pillow — a real dependency in the deployed image
    # for a check that buys little here. The mime and the size are validated
    # below. The gap it leaves is a file that CLAIMS image/png and is not:
    # it renders as a broken picture in the shop, which the operator who
    # uploaded it can see and fix. Nothing decodes it, so it is not a way in.
    upload = forms.FileField(
        required=False,
        label="Cover photo",
        help_text="The first photo, on the card and the page. Goes to R2; the database keeps the URL.",
    )
    gallery_upload = MultipleImageField(
        required=False,
        label="Add photos or videos",
        help_text="Pick several at once. Photos up to 10 MB, videos up to 30 MB (MP4 or WebM). They join the end of the gallery below.",
    )
    gallery_text = forms.CharField(
        required=False,
        label="Gallery",
        widget=forms.Textarea(attrs={"rows": 5, "cols": 90}),
        help_text="One URL per line, photos and videos, in the order they show after the cover. Delete a line to remove it; move a line to reorder.",
    )
    faq_text = forms.CharField(
        required=False,
        label="FAQ",
        widget=forms.Textarea(attrs={"rows": 8, "cols": 90}),
        help_text="Question on one line, answer on the next. A blank line between questions.",
    )

    class Meta:
        model = Product
        fields = (
            "sku", "name", "brand", "subtitle", "category", "subcategory", "image_url",
            "description", "slug", "seo_title", "seo_description",
            "stock", "weight_grams", "tax_rate_bps", "featured", "active",
        )
        widgets = {
            "sku": forms.TextInput(attrs={"size": 20}),
            "image_url": forms.TextInput(attrs={"size": 80}),
            "brand": forms.TextInput(attrs={"size": 40}),
            "subtitle": forms.TextInput(attrs={"size": 80}),
            "description": forms.Textarea(attrs={"rows": 8, "cols": 90}),
            "seo_title": forms.TextInput(attrs={"size": 80, "maxlength": 70}),
            "seo_description": forms.Textarea(attrs={"rows": 2, "cols": 90, "maxlength": 170}),
        }
        help_texts = {
            "sku": "The product ID — one product, one SKU; the database refuses a second. Blank makes the next NAMO-####. The spreadsheet upload matches on this.",
            "description": "What it is, what it is for, how to use or wear it. Plain text; a blank line starts a new paragraph.",
            "slug": "The page address: 1namo.com/shop/p/<this>. Left blank, it is made from the name.",
            "seo_title": "What a search result and a shared link show as the title. Blank uses the name. Under 60 characters reads best.",
            "seo_description": "The line under it. Blank uses the description's first line. Under 160 characters.",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["sku"].required = False
        if self.instance and self.instance.pk:
            self.fields["price"].initial = self.instance.price_paise
            self.fields["mrp"].initial = self.instance.mrp_paise
            self.fields["gallery_text"].initial = "\n".join(self.instance.gallery or [])
            self.fields["faq_text"].initial = faq_to_text(self.instance.faq)

    def clean_sku(self):
        from .services import next_sku

        sku = (self.cleaned_data.get("sku") or "").strip().upper()
        if not sku:
            return self.instance.sku if self.instance.pk and self.instance.sku else next_sku()
        if Product.objects.filter(sku=sku).exclude(pk=self.instance.pk).exists():
            raise forms.ValidationError(f"{sku} is already another product. One product, one SKU.")
        return sku

    def clean_gallery_upload(self):
        files = self.cleaned_data.get("gallery_upload") or []
        for f in files:
            mime = getattr(f, "content_type", "") or ""
            if mime.startswith("video/"):
                if not mime.startswith(("video/mp4", "video/webm", "video/quicktime")):
                    raise forms.ValidationError(f"{f.name}: use MP4 or WebM ({mime}).")
                if f.size > PRODUCT_VIDEO_MAX:
                    raise forms.ValidationError(f"{f.name} is over 30 MB. Upload it elsewhere and paste the link in the gallery.")
                continue
            if not mime.startswith("image/"):
                raise forms.ValidationError(f"{f.name} is not a photo or a video ({mime}).")
            try:
                media.validate_upload("image", f.name, f.size, mime)
            except media.ValidationError as exc:
                raise forms.ValidationError(f"{f.name}: {exc}") from None
        return files

    def clean_gallery_text(self):
        urls = [ln.strip() for ln in (self.cleaned_data.get("gallery_text") or "").splitlines() if ln.strip()]
        for url in urls:
            if not url.startswith(("https://", "http://")):
                raise forms.ValidationError(f"“{url[:60]}” is not a web address.")
        return urls

    def clean_faq_text(self):
        return text_to_faq(self.cleaned_data.get("faq_text"))

    def clean_slug(self):
        """Typed: must be free. Blank: the model makes one from the name."""
        slug = slugify(self.cleaned_data.get("slug") or "")[:110]
        if not slug:
            return self.instance.slug if self.instance.pk else None
        if Product.objects.filter(slug=slug).exclude(pk=self.instance.pk).exists():
            raise forms.ValidationError("Another product already uses this address.")
        return slug

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
        price, mrp = data.get("price"), data.get("mrp")
        # The screens compute the discount badge from the pair. An MRP at
        # or below the price renders a zero or negative saving, which looks
        # like a bug to a seeker and is one.
        if price is not None and mrp is not None and mrp <= price:
            raise forms.ValidationError(
                {"mrp": "The MRP must be above the price, or left blank."}
            )
        if data.get("stock") is not None and data["stock"] < 0:
            raise forms.ValidationError({"stock": "Stock cannot be negative."})
        return data

    def save(self, commit=True):
        product = super().save(commit=False)
        product.price_paise = self.cleaned_data["price"]
        product.mrp_paise = self.cleaned_data.get("mrp")
        product.gallery = self.cleaned_data.get("gallery_text") or []
        product.faq = self.cleaned_data.get("faq_text") or []
        if commit:
            product.save()
        return product


@dj.register(Product, site=site)
class ProductAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "product"
    form = ProductForm
    list_display = ("thumb", "sku", "name", "brand", "category", "price", "mrp", "stock_state", "featured", "active")
    list_filter = ("active", "featured", "category", "subcategory")
    search_fields = ("sku", "name", "subtitle", "brand")
    list_editable = ("featured", "active")
    actions = ("mark_out_of_stock", "restock_one", "make_live", "take_down")
    list_per_page = 50
    fieldsets = (
        (None, {"fields": ("sku", "name", "brand", "subtitle", "category", "subcategory")}),
        ("Price and stock", {"fields": ("price", "mrp", "stock", "weight_grams", "tax_rate_bps", "featured", "active")}),
        ("Photos", {"fields": ("upload", "image_url", "gallery_upload", "gallery_text")}),
        ("Product page", {"fields": ("description", "faq_text")}),
        ("Search and sharing", {"fields": ("slug", "seo_title", "seo_description")}),
    )

    change_list_template = "admin/shop/product/change_list.html"

    def get_urls(self):
        """The spreadsheet's two pages hang off the product list, so they
        carry its permission checks."""
        return [
            path("sheet/download/", site.admin_view(self.sheet_download), name="shop_product_export"),
            path("sheet/upload/", site.admin_view(self.sheet_upload), name="shop_product_import"),
        ] + super().get_urls()

    def sheet_download(self, request):
        """Every product, live and taken down — the whole catalogue, for the
        audit trail and as the upload's template."""
        if not self.has_view_permission(request):
            return HttpResponse("Not your tier.", status=403)
        products = Product.objects.select_related("category", "subcategory").order_by("sku")
        data = sheet.export_workbook(products)
        record(request, "product.sheet_download", "product", rows=products.count())
        stamp = timezone.localtime().strftime("%Y-%m-%d-%H%M")
        response = HttpResponse(
            data, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="namo-products-{stamp}.xlsx"'
        return response

    def sheet_upload(self, request):
        """Check every row, then write all of them or none."""
        if not at_least(request, Tier.FULFILMENT):
            return HttpResponse("Not your tier.", status=403)
        context = {**site.each_context(request), "title": "Upload products sheet", "opts": self.model._meta}
        if request.method == "POST":
            upload = request.FILES.get("sheet")
            if upload is None:
                context["errors"] = [(0, "Choose the .xlsx file first.")]
            elif upload.size > 10 * 1024 * 1024:
                context["errors"] = [(0, "That file is over 10 MB. A sheet of products is far smaller; check it is the right file.")]
            else:
                plans, errors = sheet.read_workbook(upload.read())
                if errors:
                    context["errors"] = errors
                    record(request, "product.sheet_refused", "product", file=upload.name,
                           problems=len(errors))
                else:
                    added, updated, changes = sheet.apply(plans)
                    context["done"] = {"added": added, "updated": updated,
                                       "same": len(plans) - added - updated}
                    record(request, "product.sheet_upload", "product", file=upload.name,
                           added=added, updated=updated, changes=changes)
        return TemplateResponse(request, "console/shop_import.html", context)

    @dj.display(description="")
    def thumb(self, obj):
        if not obj.image_url:
            return "—"
        return format_html(
            '<img src="{}" style="height:38px;width:38px;object-fit:cover;border-radius:4px">',
            obj.image_url,
        )

    @dj.display(description="Price", ordering="price_paise")
    def price(self, obj):
        return rupees(obj.price_paise)

    @dj.display(description="MRP")
    def mrp(self, obj):
        return rupees(obj.mrp_paise)

    @dj.display(description="Stock", ordering="stock")
    def stock_state(self, obj):
        if obj.stock <= 0:
            # mark_safe, not format_html: there is nothing to interpolate,
            # and format_html without args is removed in Django 6.
            return mark_safe('<b style="color:#cf3a25">Out of stock</b>')  # noqa: S308
        if obj.stock <= 2:
            return format_html('<b style="color:#a85400">{} left</b>', obj.stock)
        return obj.stock

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_add_permission(self, request):
        return at_least(request, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    def has_delete_permission(self, request, obj=None):
        """Never. An order item points at this row by id, and a deleted
        product turns somebody's past order into a dangling reference.
        `active = False` takes it off the shop and keeps the history."""
        return False

    def save_model(self, request, obj, form, change):
        """The photo goes to R2 and the row keeps a URL.

        The same rule the reels upload follows and the migration was run
        to establish: object storage holds the bytes, Postgres holds a
        pointer. A product photo written into a column would be the same
        mistake at a smaller size, and 11 products becomes 400.
        """
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
            record(request, "product.photo", "product", target_id=obj.pk,
                   bucket_key=key, size_bytes=upload.size)
        for extra in form.cleaned_data.get("gallery_upload") or []:
            admin = admin_row(request)
            owner = str(admin.profile_id) if admin else "console"
            mime = extra.content_type or "image/jpeg"
            video = mime.startswith("video/")
            key = media.make_bucket_key(owner, "reel" if video else "image", extra.name)
            url = media.get_provider().put_bytes(key, extra.read(), mime)
            MediaAsset.objects.create(
                owner=owner, kind=MediaKind.REEL if video else MediaKind.IMAGE,
                bucket_key=key, mime=mime, size_bytes=extra.size, status=MediaStatus.READY,
            )
            obj.gallery = [*(obj.gallery or []), url]
            record(request, "product.gallery_photo", "product", target_id=obj.pk,
                   bucket_key=key, size_bytes=extra.size)
        super().save_model(request, obj, form, change)

    def _bulk(self, request, queryset, verb, **fields):
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        for product in queryset:
            before = {k: getattr(product, k) for k in fields}
            Product.objects.filter(pk=product.pk).update(**fields)
            record(request, f"product.{verb}", "product", target_id=product.pk,
                   was=before, now=fields, name=product.name)
        self.message_user(request, f"{queryset.count()} {verb}.")

    @dj.action(description="Out of stock")
    def mark_out_of_stock(self, request, queryset):
        self._bulk(request, queryset, "out_of_stock", stock=0)

    @dj.action(description="Restock — one unit")
    def restock_one(self, request, queryset):
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        from django.db.models import F

        for product in queryset:
            Product.objects.filter(pk=product.pk).update(stock=F("stock") + 1)
            record(request, "product.restock", "product", target_id=product.pk,
                   name=product.name, by=1)
        self.message_user(request, f"{queryset.count()} restocked by one.")

    @dj.action(description="Put live")
    def make_live(self, request, queryset):
        self._bulk(request, queryset, "live", active=True)

    @dj.action(description="Take down (keeps history)")
    def take_down(self, request, queryset):
        self._bulk(request, queryset, "down", active=False)


class CouponForm(forms.ModelForm):
    flat_off = RupeeField(label="Flat amount off", required=False)
    max_discount = RupeeField(label="Cap on a percentage discount", required=False)
    min_order = RupeeField(label="Minimum order", required=False)

    class Meta:
        model = Coupon
        fields = ("code", "kind", "percent_off", "max_redemptions",
                  "starts_at", "ends_at", "active", "note")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields["flat_off"].initial = self.instance.flat_off_paise
            self.fields["max_discount"].initial = self.instance.max_discount_paise
            self.fields["min_order"].initial = self.instance.min_order_paise

    def clean(self):
        data = super().clean()
        kind = data.get("kind")
        # The CHECK constraint refuses this at the database too. Catching
        # it here is what lets somebody be TOLD why instead of seeing a
        # 500 with a constraint name in it.
        if kind == Coupon.Kind.PERCENT:
            if not data.get("percent_off"):
                raise forms.ValidationError({"percent_off": "Give a percentage."})
            if data.get("flat_off"):
                raise forms.ValidationError(
                    {"flat_off": "A percentage coupon cannot also take a flat amount."}
                )
        elif kind == Coupon.Kind.FLAT:
            if not data.get("flat_off"):
                raise forms.ValidationError({"flat_off": "Give an amount."})
            if data.get("percent_off"):
                raise forms.ValidationError(
                    {"percent_off": "A flat coupon cannot also take a percentage."}
                )
        start, end = data.get("starts_at"), data.get("ends_at")
        if start and end and end <= start:
            raise forms.ValidationError({"ends_at": "The end must be after the start."})
        return data

    def save(self, commit=True):
        coupon = super().save(commit=False)
        coupon.flat_off_paise = self.cleaned_data.get("flat_off")
        coupon.max_discount_paise = self.cleaned_data.get("max_discount")
        coupon.min_order_paise = self.cleaned_data.get("min_order") or 0
        if coupon.kind == Coupon.Kind.PERCENT:
            coupon.flat_off_paise = None
        else:
            coupon.percent_off = None
        if commit:
            coupon.save()
        return coupon


@dj.register(Coupon, site=site)
class CouponAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "coupon"
    form = CouponForm
    list_display = ("code", "offer", "min_order", "used_count", "left", "window", "active")
    list_filter = ("active", "kind")
    search_fields = ("code", "note")
    readonly_fields = ("used_count", "created_at")

    @dj.display(description="Offer")
    def offer(self, obj):
        if obj.kind == Coupon.Kind.PERCENT:
            cap = f" (max {rupees(obj.max_discount_paise)})" if obj.max_discount_paise else ""
            return f"{obj.percent_off}% off{cap}"
        return f"{rupees(obj.flat_off_paise)} off"

    @dj.display(description="Min order")
    def min_order(self, obj):
        return rupees(obj.min_order_paise) if obj.min_order_paise else "—"

    @dj.display(description="Left")
    def left(self, obj):
        n = obj.redemptions_left
        return "unlimited" if n is None else n

    @dj.display(description="Window")
    def window(self, obj):
        if not obj.starts_at and not obj.ends_at:
            return "always"
        start = obj.starts_at.date() if obj.starts_at else "—"
        end = obj.ends_at.date() if obj.ends_at else "—"
        return f"{start} → {end}"

    def has_module_permission(self, request):
        return at_least(request, Tier.FULFILMENT, Tier.FINANCE)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT, Tier.FINANCE, Tier.SUPPORT)

    def has_add_permission(self, request):
        return at_least(request, Tier.FULFILMENT, Tier.FINANCE)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT, Tier.FINANCE)

    def has_delete_permission(self, request, obj=None):
        """A coupon somebody redeemed is part of why an order cost what it
        cost. Deactivate it."""
        return False


class OrderItemInline(dj.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    fields = ("item_type", "title", "qty", "unit", "line")
    readonly_fields = fields

    @dj.display(description="Unit")
    def unit(self, obj):
        return rupees(obj.unit_price_paise)

    @dj.display(description="Line")
    def line(self, obj):
        return rupees(obj.unit_price_paise * obj.qty)

    def has_add_permission(self, request, obj=None):
        return False


@dj.register(Order, site=site)
class OrderAdmin(dj.ModelAdmin):
    """Read-only, at every tier.

    An order is the record of something that happened. Its total is what
    the wallet was debited and what the ledger says; editing the number
    here would make two sources of truth disagree and fix nothing. Refunds
    go through the wallet, which writes a reversing entry — that is the
    only honest way to move money after the fact.
    """

    list_display = ("id", "created_at", "who", "kinds", "total", "status")
    list_filter = ("status", "created_at")
    search_fields = ("id", "profile_id")
    date_hierarchy = "created_at"
    inlines = (OrderItemInline,)
    list_per_page = 50

    @dj.display(description="Buyer")
    def who(self, obj):
        from apps.profiles.models import Profile

        p = Profile.objects.filter(pk=obj.profile_id).only("name", "phone").first()
        return f"{p.name or '—'} · {p.phone}" if p else str(obj.profile_id)

    @dj.display(description="Contains")
    def kinds(self, obj):
        return ", ".join(sorted({i.item_type for i in obj.items.all()})) or "—"

    @dj.display(description="Total", ordering="total_paise")
    def total(self, obj):
        return rupees(obj.total_paise)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE)

    has_module_permission = has_view_permission


@dj.register(Shipment, site=site)
class ShipmentAdmin(AuditedAdmin, dj.ModelAdmin):
    """The parcel. A paid order dispatches itself (apps/shop/delivery.py,
    5 Oct 2026); this is where one that stopped half-way is finished, a
    label is printed, and — rarely — a status is set by hand."""

    audit_target = "shipment"
    list_display = ("order", "to", "pincode", "status", "tracking_status", "courier", "awb",
                    "label", "updated_at")
    list_filter = ("status", "courier")
    search_fields = ("awb", "pincode", "provider_order_id")
    readonly_fields = ("order", "address", "weight_grams", "shipping_paise",
                       "tracking_status", "label_url", "updated_at")

    @dj.display(description="To")
    def to(self, obj):
        a = obj.address or {}
        return f"{a.get('name', '—')}, {a.get('city', '')}"

    @dj.display(description="Label")
    def label(self, obj):
        if not obj.label_url:
            return "—"
        return format_html('<a href="{}" target="_blank" rel="noopener">PDF</a>', obj.label_url)

    def has_add_permission(self, request):
        """A shipment is created by an order being paid for, not by an
        operator typing one in."""
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FULFILMENT)

    actions = ("dispatch_now", "refresh_tracking", "check_shiprocket")

    @dj.action(description="Check Shiprocket — sign in and quote, places nothing")
    def check_shiprocket(self, request, queryset):
        """Select any row; the rows are ignored. The one way to see from the
        console that the credentials, pickup and couriers work."""
        if not shiprocket.is_configured():
            return self.message_user(request, "Shiprocket credentials are not set.", messages.ERROR)
        try:
            for line in shiprocket.check():
                self.message_user(request, line)
        except shiprocket.ShiprocketError as exc:
            self.message_user(request, f"Shiprocket: {exc}", messages.ERROR)

    @dj.action(description="Dispatch — push, courier, pickup, label")
    def dispatch_now(self, request, queryset):
        """The same path a paid order takes on its own. Each step skips
        itself when done, so this finishes a half-dispatched parcel rather
        than sending it twice."""
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        if not shiprocket.is_configured():
            return self.message_user(
                request, "Shiprocket credentials are not set.", messages.ERROR
            )
        for shipment in queryset:
            result = delivery.dispatch(shipment.order_id, force=True)
            fresh = Shipment.objects.get(pk=shipment.pk)
            record(request, "shipment.dispatch", "shipment", target_id=shipment.order_id,
                   result=result, awb=fresh.awb or "")
            level = messages.ERROR if result == "failed" else messages.INFO
            self.message_user(
                request, f"{shipment.order_id}: {result}"
                + (f" · {fresh.courier} {fresh.awb}" if fresh.awb else ""), level,
            )

    @dj.action(description="Refresh tracking")
    def refresh_tracking(self, request, queryset):
        """Read-only against Shiprocket, forward-only here. Delivery starts
        the referral cashback's clock exactly as the webhook does — until
        5 Oct this used a bare update and skipped it."""
        for shipment in queryset.exclude(awb=None).exclude(awb=""):
            try:
                moved = delivery.refresh(shipment)
            except shiprocket.ShiprocketError as exc:
                self.message_user(request, f"{shipment.order_id}: {exc}", messages.ERROR)
                continue
            fresh = Shipment.objects.get(pk=shipment.pk)
            if moved:
                record(request, "shipment.tracked", "shipment", target_id=shipment.order_id,
                       status=fresh.status, courier_says=fresh.tracking_status or "")
            self.message_user(
                request, f"{shipment.order_id}: {fresh.status} · {fresh.tracking_status or 'no update'}"
            )

    def save_model(self, request, obj, form, change):
        from django.utils import timezone

        # Stamp the moment the status says it happened. An operator setting
        # "shipped" should not also have to remember to set shipped_at, and
        # a missing timestamp is what makes a delivery dispute unanswerable.
        if "status" in form.changed_data:
            if obj.status == Shipment.Status.SHIPPED and not obj.shipped_at:
                obj.shipped_at = timezone.now()
            if obj.status == Shipment.Status.DELIVERED and not obj.delivered_at:
                obj.delivered_at = timezone.now()
        obj.updated_at = timezone.now()
        super().save_model(request, obj, form, change)

        # Delivery starts the referral cashback's clock; a return kills it.
        # After super(), so the status that is acted on is the one that
        # actually saved — and outside any transaction of ours, because a
        # cashback bookkeeping failure must not refuse a legitimate
        # shipment update an admin is making.
        if "status" in form.changed_data:
            from apps.referrals import services as referral_services

            referral_services.on_shipment_status(obj.order_id, obj.status)


@dj.register(ShopCategory, site=site)
class ShopCategoryAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "shop_category"
    list_display = ("name", "sort")
    list_editable = ("sort",)

    def has_module_permission(self, request):
        return at_least(request, Tier.FULFILMENT)


@dj.register(ShopSubcategory, site=site)
class ShopSubcategoryAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "shop_subcategory"
    list_display = ("name", "category", "sort")
    list_filter = ("category",)
    list_editable = ("sort",)

    def has_module_permission(self, request):
        return at_least(request, Tier.FULFILMENT)


@dj.register(ShippingAddress, site=site)
class ShippingAddressAdmin(dj.ModelAdmin):
    """Read-only and Support-or-Fulfilment only. PRD §6 capability 8 calls
    looking up a user the most privacy-sensitive thing the console does;
    an address is the sharpest part of that."""

    list_display = ("name", "city", "state", "pincode", "created_at")
    search_fields = ("pincode", "city", "name")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    has_module_permission = has_view_permission
