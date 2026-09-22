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


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        PAID = "paid"
        REFUNDED = "refunded"
        CANCELLED = "cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PAID)
    total_paise = models.IntegerField()
    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)

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
