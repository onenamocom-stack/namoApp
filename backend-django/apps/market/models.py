"""The Market's sellers (15 Oct 2026, docs/06 Phase 17; owner's yes, Rahul's
terms in docs/01 §4.7).

A Pro (approved consultant) or a Creator lists a Download, a Course, an
Event or a Product. Nothing shows until an admin approves it. A buyer pays
at Razorpay (a free listing is simply taken). The seller earns the price
less Namo's commission — 30% on downloads, courses and events, 20% plus
₹100 for delivery on a product, or the rate the admin typed on approval —
and is paid once a month, on the 7th, for the month before.

A product is sold through the shop: approving one makes a shop `products`
row (the seller sends the stock to Namo; Namo ships it), and its earnings
are written when the parcel is delivered, so a return costs the seller
nothing it was already paid.
"""

import uuid

from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class ListingKind(models.TextChoices):
    DOWNLOAD = "download", "Download"
    COURSE = "course", "Course"
    EVENT = "event", "Event"
    PRODUCT = "product", "Product"


class ListingStatus(models.TextChoices):
    PENDING = "pending", "Waiting for review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    WITHDRAWN = "withdrawn", "Withdrawn by the seller"


class Listing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seller_id = models.UUIDField(db_index=True)  # profiles id
    kind = models.CharField(max_length=16, choices=ListingKind.choices)
    title = models.TextField()
    description = models.TextField(default="", db_default="", blank=True)
    # 16:9, public (an `image` media asset's URL).
    cover_url = models.TextField(default="", db_default="", blank=True)
    # 0 is free; a free product is refused (a parcel is never free).
    price_paise = models.IntegerField(default=0, db_default=0)
    mrp_paise = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=ListingStatus.choices,
                              default=ListingStatus.PENDING, db_default=ListingStatus.PENDING)
    review_note = models.TextField(default="", db_default="", blank=True)
    # Namo's share typed by the admin on approval, basis points; NULL takes
    # the default for the kind (services.commission_bps).
    commission_bps = models.IntegerField(null=True, blank=True)

    # Download: one file, a `download` media asset in the private bucket.
    file_asset_id = models.UUIDField(null=True, blank=True)
    file_name = models.TextField(default="", db_default="", blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    # Course: [{title, minutes, asset_id, preview}] — each lesson a private
    # `download` asset (a video, usually); `preview` opens to anybody.
    lessons = models.JSONField(default=list, blank=True)
    language = models.TextField(default="", db_default="", blank=True)
    # Event (online only, Rahul 15 Oct): when, how long, how many, and the
    # joining link, shown to the seller and to people who booked.
    starts_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.IntegerField(null=True, blank=True)
    seats = models.IntegerField(null=True, blank=True)
    join_url = models.TextField(default="", db_default="", blank=True)
    # Product: what the seller will send, and the shop row approval made.
    category_name = models.TextField(default="", db_default="", blank=True)
    stock = models.IntegerField(null=True, blank=True)
    weight_grams = models.IntegerField(null=True, blank=True)
    product_id = models.UUIDField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.TextField(default="", db_default="", blank=True)

    Kind = ListingKind
    Status = ListingStatus

    class Meta:
        db_table = "market_listings"
        constraints = [
            models.CheckConstraint(condition=Q(kind__in=ListingKind.values), name="market_listings_kind_check"),
            models.CheckConstraint(condition=Q(status__in=ListingStatus.values), name="market_listings_status_check"),
            models.CheckConstraint(condition=Q(price_paise__gte=0), name="market_listings_price_check"),
            models.CheckConstraint(
                condition=Q(mrp_paise__isnull=True) | Q(mrp_paise__gt=F("price_paise")),
                name="market_listings_mrp_check",
            ),
            models.CheckConstraint(
                condition=Q(commission_bps__isnull=True) | Q(commission_bps__gte=0, commission_bps__lte=10000),
                name="market_listings_commission_check",
            ),
            models.CheckConstraint(condition=Q(title__regex=r"\S"), name="market_listings_title_check"),
        ]
        indexes = [
            models.Index(fields=["status", "kind", "-created_at"], name="market_listings_live_idx"),
        ]

    def __str__(self):
        return self.title


class Purchase(models.Model):
    """One person's access to one download, course or event — paid (with
    the `entitlements` row the gateway wrote) or free. Products are shop
    orders and never land here."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name="purchases")
    buyer_id = models.UUIDField(db_index=True)
    amount_paise = models.IntegerField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "market_purchases"
        constraints = [
            models.UniqueConstraint(fields=["listing", "buyer_id"], name="market_purchases_once"),
            models.CheckConstraint(condition=Q(amount_paise__gte=0), name="market_purchases_amount_check"),
        ]


class PayoutStatus(models.TextChoices):
    DUE = "due", "Due"
    PAID = "paid", "Paid"


class SellerPayout(models.Model):
    """One seller's money for one month, made on the 7th of the next
    (services.run_payouts) and marked paid by Finance with the bank's
    reference once the transfer is done."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seller_id = models.UUIDField(db_index=True)
    month = models.DateField()  # the 1st of the month it pays for
    amount_paise = models.IntegerField()
    status = models.CharField(max_length=8, choices=PayoutStatus.choices,
                              default=PayoutStatus.DUE, db_default=PayoutStatus.DUE)
    reference = models.TextField(default="", db_default="", blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.TextField(default="", db_default="", blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Status = PayoutStatus

    class Meta:
        db_table = "market_payouts"
        constraints = [
            models.UniqueConstraint(fields=["seller_id", "month"], name="market_payouts_once_a_month"),
            models.CheckConstraint(condition=Q(status__in=PayoutStatus.values), name="market_payouts_status_check"),
            models.CheckConstraint(condition=Q(amount_paise__gt=0), name="market_payouts_amount_check"),
        ]


class SellerEarning(models.Model):
    """One sale's money for the seller, append-only like `earnings_ledger`:
    gross less Namo's commission less delivery is net, always. `payout` is
    set once by the monthly run and never again."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seller_id = models.UUIDField(db_index=True)
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name="earnings")
    # What sold: a download/course/event purchase, or a shop order line.
    purchase = models.OneToOneField(Purchase, null=True, blank=True, on_delete=models.PROTECT,
                                    related_name="earning")
    order_item_id = models.UUIDField(null=True, blank=True, unique=True)
    gross_paise = models.IntegerField()
    commission_bps = models.IntegerField()
    commission_paise = models.IntegerField()
    delivery_paise = models.IntegerField(default=0, db_default=0)
    net_paise = models.IntegerField()
    payout = models.ForeignKey(SellerPayout, null=True, blank=True, on_delete=models.PROTECT,
                               related_name="earnings")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "market_earnings"
        constraints = [
            models.CheckConstraint(
                condition=Q(net_paise=F("gross_paise") - F("commission_paise") - F("delivery_paise")),
                name="market_earnings_net_check",
            ),
            models.CheckConstraint(condition=Q(gross_paise__gt=0), name="market_earnings_gross_check"),
        ]
        indexes = [models.Index(fields=["seller_id", "-created_at"], name="market_earnings_seller_idx")]


class SellerBank(models.Model):
    """Where a Creator's payout goes (a Pro's is their `payout_details`).
    The account number and PAN are encrypted like a Pro's
    (`consultants.payout_details`); Finance reads them in the console."""

    profile_id = models.UUIDField(primary_key=True)
    account_holder = models.TextField(default="", db_default="", blank=True)
    account_cipher = models.TextField(default="", db_default="", blank=True)
    account_last4 = models.CharField(max_length=4, default="", db_default="", blank=True)
    ifsc = models.CharField(max_length=11, default="", db_default="", blank=True)
    upi_id = models.TextField(default="", db_default="", blank=True)
    pan_cipher = models.TextField(default="", db_default="", blank=True)
    pan_last4 = models.CharField(max_length=4, default="", db_default="", blank=True)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "market_seller_banks"
