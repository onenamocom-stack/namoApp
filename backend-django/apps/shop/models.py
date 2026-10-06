"""The marketplace, as the database already has it.

Nine tables came across in the migration — `products`, `orders`,
`order_items`, `shipments`, `shipping_addresses`, `shipping_quotes`,
`shop_categories`, `shop_subcategories` — with 11 products, 27 orders and
6 shipments in them. None had a Django model. This gives them one; the
schema is not invented and not changed.

Two exceptions, both marked:

  * `Coupon` is NEW. There is no discount table anywhere in the old schema
    — the strike-through price on a product card is `mrp_paise`, which is
    a comparison price and not a coupon.
  * `orders` and `order_items` are ALSO written by raw SQL, from
    `apps/consultants/gateway.py`, for bookings and metered sessions. These
    models read and present them; they do not take ownership. A shop order
    and a chat hold are the same table by design (docs/05, 012's order
    layer), which is why `item_type` exists.
"""

import uuid

from django.db import models
from django.utils import timezone


class ShopCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    sort = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "shop_categories"
        ordering = ("sort", "name")
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class ShopSubcategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        ShopCategory, on_delete=models.DO_NOTHING, db_column="category_id",
        related_name="subcategories",
    )
    name = models.TextField()
    sort = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "shop_subcategories"
        ordering = ("sort", "name")
        verbose_name_plural = "subcategories"

    def __str__(self):
        return f"{self.category.name} · {self.name}"


class Product(models.Model):
    """`price_paise` is what is charged; `mrp_paise` is the struck-through
    number beside it and is a claim about the market, not a discount we
    grant. The screens compute the badge from the pair, so a `mrp` below
    `price` would render a negative saving — the CHECK for that lives in
    the console's form, where somebody can be told why."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # THE PRODUCT ID people use (6 Oct 2026, owner's rule: never two products
    # under one id). Unique in the database, not just in the form, so no
    # path — the form, the spreadsheet upload, a script — can make a second
    # row for the same thing. The spreadsheet upload matches on it: a known
    # SKU updates that product, a new one adds a product.
    sku = models.CharField(max_length=64, unique=True)
    legacy_id = models.TextField(null=True, blank=True)
    category = models.ForeignKey(
        ShopCategory, on_delete=models.DO_NOTHING, db_column="category_id",
        related_name="products",
    )
    subcategory = models.ForeignKey(
        ShopSubcategory, null=True, blank=True, on_delete=models.DO_NOTHING,
        db_column="subcategory_id", related_name="products",
    )
    name = models.TextField()
    subtitle = models.TextField(null=True, blank=True)
    image_url = models.TextField(null=True, blank=True)
    price_paise = models.IntegerField()
    mrp_paise = models.IntegerField(null=True, blank=True)
    tax_rate_bps = models.SmallIntegerField(default=0)
    stock = models.IntegerField(default=0)
    # Shiprocket prices on weight, so this is not decoration: a product
    # with the wrong weight quotes the wrong shipping and the difference
    # comes out of the margin.
    weight_grams = models.IntegerField()
    featured = models.BooleanField(default=False)
    # The product page (6 Oct 2026, owner's list): who made it, what it is,
    # more than one photo or video, the questions people ask, and what a
    # search engine or a shared link shows. `image_url` stays the cover;
    # `gallery` is the URLs after it, in order — photos and videos, told
    # apart by the file extension (services.media_kind). `faq` is
    # [{"q": ..., "a": ...}].
    # `slug` is the readable address (/shop/p/<slug>); the id still works.
    brand = models.TextField(null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    gallery = models.JSONField(default=list, blank=True)
    faq = models.JSONField(default=list, blank=True)
    slug = models.SlugField(max_length=120, null=True, blank=True, unique=True)
    seo_title = models.TextField(null=True, blank=True)
    seo_description = models.TextField(null=True, blank=True)
    # Soft delete. PRD §6 capability 6 again: a product in a dispute is
    # evidence, and an order item points at this row by id.
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "products"
        ordering = ("-featured", "name")

    def __str__(self):
        return self.name

    @property
    def in_stock(self):
        return self.stock > 0

    def save(self, *args, **kwargs):
        # Every product has its id, whichever path made it — the form, the
        # spreadsheet, a script. Two saves racing for the same next number
        # meet the unique constraint, and the second is refused, not doubled.
        if not self.sku:
            from .services import next_sku

            self.sku = next_sku()
        self.sku = self.sku.strip().upper()
        # And its page address, made from the name once and then kept, so a
        # shared link does not break when the name is edited.
        if not self.slug:
            from .services import unique_slug

            self.slug = unique_slug(self.name, exclude_pk=self.pk)
        super().save(*args, **kwargs)


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        PAID = "paid"
        REFUNDED = "refunded"
        CANCELLED = "cancelled"

    class PaymentMethod(models.TextChoices):
        # The wallet, which Razorpay tops up — paid before the parcel moves.
        WALLET = "wallet"
        # Cash on delivery (6 Oct 2026): the courier collects `total_paise`,
        # which includes `cod_fee_paise`. PENDING until delivered, then PAID;
        # a return or a courier cancel before that makes it CANCELLED and
        # puts the stock back. Shiprocket remits the cash to the business.
        COD = "cod"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PAID)
    total_paise = models.IntegerField()
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    # Database defaults, not only Django ones: bookings and the chat meter
    # insert orders by raw SQL (apps/consultants/gateway.py) and must keep
    # working without naming these columns.
    payment_method = models.CharField(
        max_length=8, choices=PaymentMethod.choices,
        default=PaymentMethod.WALLET, db_default=PaymentMethod.WALLET,
    )
    cod_fee_paise = models.IntegerField(default=0, db_default=0)

    class Meta:
        db_table = "orders"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.id} · {self.status}"


class OrderItem(models.Model):
    """`item_type` is what makes one table serve the shop, the academy and
    the chat meter. The CHECK allows session, product, course, event,
    report, question_pack and shipping."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(
        Order, on_delete=models.DO_NOTHING, db_column="order_id", related_name="items"
    )
    item_type = models.TextField()
    item_id = models.UUIDField()
    title = models.TextField()
    qty = models.SmallIntegerField(default=1)
    unit_price_paise = models.IntegerField()
    tax_rate_bps = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "order_items"

    def __str__(self):
        return f"{self.qty} × {self.title}"


class Shipment(models.Model):
    """One per order, keyed BY the order — there is no separate id column.
    `address` is a jsonb snapshot rather than a link, deliberately: a
    seeker editing their saved address must not rewrite where a parcel was
    already sent."""

    class Status(models.TextChoices):
        AWAITING_PAYMENT = "awaiting_payment"
        READY = "ready"
        SHIPPED = "shipped"
        DELIVERED = "delivered"
        RETURNED = "returned"
        CANCELLED = "cancelled"

    order = models.OneToOneField(
        Order, primary_key=True, on_delete=models.DO_NOTHING,
        db_column="order_id", related_name="shipment",
    )
    address = models.JSONField()
    pincode = models.TextField()
    weight_grams = models.IntegerField()
    shipping_paise = models.IntegerField()
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.AWAITING_PAYMENT
    )
    courier = models.TextField(null=True, blank=True)
    awb = models.TextField(null=True, blank=True)
    provider_order_id = models.TextField(null=True, blank=True)
    # The courier's own last words ("IN TRANSIT", "OUT FOR DELIVERY"), shown
    # to the seeker under the four steps; `status` is ours and coarser.
    tracking_status = models.TextField(null=True, blank=True)
    label_url = models.TextField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "shipments"
        ordering = ("-updated_at",)

    def __str__(self):
        return f"{self.order_id} · {self.status}"


class ShippingAddress(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    name = models.TextField()
    phone = models.TextField()
    line1 = models.TextField()
    line2 = models.TextField(null=True, blank=True)
    city = models.TextField()
    state = models.TextField()
    pincode = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "shipping_addresses"
        verbose_name_plural = "shipping addresses"


class ShippingQuote(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    pincode = models.TextField()
    weight_grams = models.IntegerField()
    amount_paise = models.IntegerField()
    courier = models.TextField(null=True, blank=True)
    etd_days = models.SmallIntegerField(null=True, blank=True)
    # Whether any courier will collect cash at this pincode (6 Oct 2026).
    cod_available = models.BooleanField(default=False, db_default=False)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "shipping_quotes"
        ordering = ("-created_at",)


class Coupon(models.Model):
    """NEW — nothing like it existed.

    A coupon is a discount WE grant, which is why it is not `mrp_paise`:
    that number is a claim about what the thing sells for elsewhere.

    Two shapes, one column pair, and only one may be set — a coupon that is
    both "10% off" and "₹200 off" has no defined meaning and the form
    refuses it. `max_discount_paise` caps a percentage so a 20% coupon on a
    ₹26,400 gemstone is not a ₹5,280 accident.

    Redemption is counted, not inferred. `used_count` moves under a row
    lock when an order is placed; nothing derives it from the orders table,
    because an order that is later refunded still consumed the coupon.
    """

    class Kind(models.TextChoices):
        PERCENT = "percent", "Percentage off"
        FLAT = "flat", "Flat amount off"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    percent_off = models.SmallIntegerField(null=True, blank=True)
    flat_off_paise = models.IntegerField(null=True, blank=True)
    max_discount_paise = models.IntegerField(null=True, blank=True)
    min_order_paise = models.IntegerField(default=0)
    # Null means unlimited. Zero would mean "nobody may use it", which is
    # what `active = False` says more clearly.
    max_redemptions = models.IntegerField(null=True, blank=True)
    used_count = models.IntegerField(default=0)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True)
    note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "coupons"
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(kind="percent", percent_off__isnull=False,
                                   flat_off_paise__isnull=True)
                | models.Q(kind="flat", flat_off_paise__isnull=False,
                           percent_off__isnull=True),
                name="coupon_one_shape_only",
            ),
            models.CheckConstraint(
                condition=models.Q(percent_off__isnull=True)
                | models.Q(percent_off__gt=0, percent_off__lte=100),
                name="coupon_percent_in_range",
            ),
        ]

    def __str__(self):
        return self.code

    @property
    def redemptions_left(self):
        if self.max_redemptions is None:
            return None
        return max(0, self.max_redemptions - self.used_count)

    def discount_on(self, subtotal_paise):
        """What this takes off a subtotal. Never more than the subtotal —
        a coupon may make an order free and may not make it negative."""
        if self.kind == self.Kind.PERCENT:
            off = subtotal_paise * (self.percent_off or 0) // 100
            if self.max_discount_paise is not None:
                off = min(off, self.max_discount_paise)
        else:
            off = self.flat_off_paise or 0
        return min(off, subtotal_paise)
