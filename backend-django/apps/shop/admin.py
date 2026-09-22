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
from django.contrib import admin as dj, messages
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import at_least, site

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


class ProductForm(forms.ModelForm):
    price = RupeeField(label="Price")
    mrp = RupeeField(label="MRP (struck through)", required=False)

    class Meta:
        model = Product
        fields = (
            "name", "subtitle", "category", "subcategory", "image_url",
            "stock", "weight_grams", "tax_rate_bps", "featured", "active",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields["price"].initial = self.instance.price_paise
            self.fields["mrp"].initial = self.instance.mrp_paise

    def clean(self):
        data = super().clean()
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
        if commit:
            product.save()
        return product


@dj.register(Product, site=site)
class ProductAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "product"
    form = ProductForm
    list_display = ("thumb", "name", "category", "price", "mrp", "stock_state", "featured", "active")
    list_filter = ("active", "featured", "category", "subcategory")
    search_fields = ("name", "subtitle")
    list_editable = ("featured", "active")
    actions = ("mark_out_of_stock", "restock_one", "make_live", "take_down")
    list_per_page = 50

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
    """The parcel. This is the one shop table an operator legitimately
    changes by hand — a courier name, an AWB, a status — because until
    Shiprocket is wired those facts arrive by email."""

    audit_target = "shipment"
    list_display = ("order", "to", "pincode", "status", "courier", "awb", "updated_at")
    list_filter = ("status", "courier")
    search_fields = ("awb", "pincode", "provider_order_id")
    readonly_fields = ("order", "address", "weight_grams", "shipping_paise", "updated_at")

    @dj.display(description="To")
    def to(self, obj):
        a = obj.address or {}
        return f"{a.get('name', '—')}, {a.get('city', '')}"

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
