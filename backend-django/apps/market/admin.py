"""The Market's sellers in the console (15 Oct 2026, Phase 17).

**Listings** — the approval queue, waiting first. Open one, look at the
picture, the file or lessons, the price; type Namo's commission if it is not
the default (blank: 30%, or 20% + ₹100 a unit for a product); pick Approve
or Reject (with the reason) and save. Support, Fulfilment and Superadmin.

**Seller payouts** — Finance. On and after the 7th, opening the list makes
last month's rows (one per seller, everything earned before the 1st). Pay
each by bank, then open it, type the bank's reference, tick Paid and save.

**Seller earnings** — every sale, read only. Finance.
"""

from decimal import Decimal

from django import forms
from django.contrib import admin as dj
from django.contrib import messages
from django.utils import timezone
from django.utils.html import format_html, format_html_join

from apps.console.admin import _signed_document
from apps.console.audit import AuditedAdmin, record
from apps.console.models import Tier
from apps.console.site import admin_row, at_least, site

from . import services
from .models import Listing, ListingKind, ListingStatus, SellerBank, SellerEarning, SellerPayout


def _who(request):
    return str(getattr(admin_row(request), "profile_id", "") or request.user.get_username())


def _rupees(paise):
    return "—" if paise is None else f"₹{paise / 100:,.2f}".replace(".00", "")


def _seller_cell(seller_id):
    s = services._sellers([seller_id])[str(seller_id)]
    tag = "Pro" if s["is_pro"] else ("Creator" if s["is_creator"] else "—")
    return format_html("<strong>{}</strong><br><small>{}</small>", s["name"], tag)


class ListingForm(forms.ModelForm):
    decision = forms.ChoiceField(
        label="Decision", required=False,
        choices=(("", "Leave as it is"), ("approve", "Approve — put it on the Market"),
                 ("reject", "Reject — send back with the note below")),
    )
    commission_percent = forms.DecimalField(
        label="Namo's commission %", required=False, min_value=0, max_value=100, decimal_places=2,
        help_text="Blank takes the default: 30% for a download, course or event; 20% for a product, "
                  "and ₹100 a unit for delivery on a product always comes from the seller's share.",
    )

    class Meta:
        model = Listing
        fields = ("review_note",)
        widgets = {"review_note": forms.Textarea(attrs={"rows": 3, "cols": 80})}
        labels = {"review_note": "Note to the seller"}
        help_texts = {"review_note": "Required to reject: the seller reads it."}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.commission_bps is not None:
            self.fields["commission_percent"].initial = Decimal(self.instance.commission_bps) / 100

    def clean(self):
        data = super().clean()
        if data.get("decision") == "reject" and not (data.get("review_note") or "").strip():
            raise forms.ValidationError({"review_note": "Write the reason before rejecting."})
        return data


@dj.register(Listing, site=site)
class ListingAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "market_listing"
    form = ListingForm
    list_display = ("thumb", "title", "kind", "seller", "price", "commission", "status", "created_at")
    list_display_links = ("thumb", "title")
    list_filter = ("status", "kind")
    search_fields = ("title",)
    ordering = ("status", "-created_at")
    list_per_page = 50
    actions = ("approve_default", "reject_with_note")
    readonly_fields = (
        "seller", "kind", "status", "cover", "title", "price", "mrp", "description_text",
        "what", "reviewed_at", "reviewed_by",
    )
    fieldsets = (
        ("The listing", {"fields": ("seller", "kind", "status", "cover", "title", "price", "mrp",
                                    "description_text", "what")}),
        ("Your decision", {"fields": ("commission_percent", "decision", "review_note",
                                      "reviewed_at", "reviewed_by")}),
    )

    def get_queryset(self, request):
        # Waiting first.
        from django.db.models import Case, IntegerField, Value, When

        return super().get_queryset(request).annotate(
            _wait=Case(When(status=ListingStatus.PENDING, then=Value(0)), default=Value(1),
                       output_field=IntegerField())
        ).order_by("_wait", "-created_at")

    @dj.display(description="")
    def thumb(self, obj):
        if not obj.cover_url:
            return "—"
        return format_html('<img src="{}" style="width:96px;height:54px;object-fit:cover;border-radius:6px">',
                           obj.cover_url)

    @dj.display(description="Picture")
    def cover(self, obj):
        if not obj.cover_url:
            return "—"
        return format_html('<img src="{}" style="width:320px;aspect-ratio:16/9;object-fit:contain;'
                           'background:#f3f3f3;border-radius:8px">', obj.cover_url)

    @dj.display(description="Seller")
    def seller(self, obj):
        return _seller_cell(obj.seller_id)

    @dj.display(description="Price")
    def price(self, obj):
        return "Free" if not obj.price_paise else _rupees(obj.price_paise)

    @dj.display(description="MRP")
    def mrp(self, obj):
        return _rupees(obj.mrp_paise)

    @dj.display(description="Namo's commission")
    def commission(self, obj):
        bps = services.commission_bps(obj)
        extra = " + ₹100/unit" if obj.kind == ListingKind.PRODUCT else ""
        tag = "" if obj.commission_bps is not None else " (default)"
        return f"{bps / 100:g}%{extra}{tag}"

    @dj.display(description="Description")
    def description_text(self, obj):
        return format_html('<div style="white-space:pre-wrap;max-width:640px">{}</div>', obj.description or "—")

    @dj.display(description="What the buyer gets")
    def what(self, obj):
        if obj.kind == ListingKind.DOWNLOAD:
            return format_html("{}<br><small>{} · {}</small>", _signed_document(obj.file_asset_id, "file"),
                               obj.file_name, f"{(obj.file_size or 0) / 1_048_576:.1f} MB")
        if obj.kind == ListingKind.COURSE:
            rows = format_html_join(
                "", "<li>{} · {} min{} — {}</li>",
                ((r.get("title"), r.get("minutes") or 0, " · free preview" if r.get("preview") else "",
                  _signed_document(r.get("asset_id"), "lesson")) for r in obj.lessons or []),
            )
            return format_html("Language: {}<ol>{}</ol>", obj.language or "—", rows)
        if obj.kind == ListingKind.EVENT:
            when = timezone.localtime(obj.starts_at).strftime("%a %d %b %Y, %I:%M %p") if obj.starts_at else "—"
            return format_html("{} · {} min · {} seats<br>Online: <a href='{}' target='_blank' rel='noopener'>{}</a>",
                               when, obj.duration_minutes, obj.seats, obj.join_url, obj.join_url)
        if obj.kind == ListingKind.PRODUCT:
            shop = format_html(" · on the shop as product {}", obj.product_id) if obj.product_id else ""
            return format_html("Category: {} · the seller sends {} · {} g each{}",
                               obj.category_name or "—", obj.stock, obj.weight_grams, shop)
        return "—"

    def save_model(self, request, obj, form, change):
        percent = form.cleaned_data.get("commission_percent")
        bps = None if percent is None else int(round(percent * 100))
        decision = form.cleaned_data.get("decision")
        try:
            if decision == "approve":
                services.approve(obj, _who(request), bps=bps)
                if percent is None:
                    Listing.objects.filter(pk=obj.pk).update(commission_bps=None)
                record(request, "market_listing.approve", "market_listing", target_id=obj.pk, commission_bps=bps)
                return
            if decision == "reject":
                services.reject(obj, _who(request), form.cleaned_data["review_note"].strip())
                record(request, "market_listing.reject", "market_listing", target_id=obj.pk)
                return
        except services.Refused as err:
            return self.message_user(request, err.message, messages.ERROR)
        obj.commission_bps = bps
        super().save_model(request, obj, form, change)

    @dj.action(description="Approve at the default commission")
    def approve_default(self, request, queryset):
        n = 0
        for listing in queryset.exclude(status=ListingStatus.APPROVED):
            try:
                services.approve(listing, _who(request))
            except services.Refused as err:
                self.message_user(request, f"{listing.title}: {err.message}", messages.ERROR)
                continue
            record(request, "market_listing.approve", "market_listing", target_id=listing.pk)
            n += 1
        self.message_user(request, f"{n} approved.", messages.SUCCESS if n else messages.WARNING)

    @dj.action(description="Reject — with the note already saved on each")
    def reject_with_note(self, request, queryset):
        n = 0
        for listing in queryset:
            if not listing.review_note.strip():
                self.message_user(request, f"{listing.title}: write the note and save first.", messages.ERROR)
                continue
            services.reject(listing, _who(request), listing.review_note.strip())
            record(request, "market_listing.reject", "market_listing", target_id=listing.pk)
            n += 1
        self.message_user(request, f"{n} rejected.", messages.SUCCESS if n else messages.WARNING)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)


class PayoutForm(forms.ModelForm):
    mark_paid = forms.BooleanField(label="Paid — the transfer is done", required=False)

    class Meta:
        model = SellerPayout
        fields = ("reference",)
        labels = {"reference": "Bank reference (UTR)"}

    def clean(self):
        data = super().clean()
        if data.get("mark_paid") and not (data.get("reference") or "").strip():
            raise forms.ValidationError({"reference": "Type the bank's reference before marking it paid."})
        return data


@dj.register(SellerPayout, site=site)
class SellerPayoutAdmin(AuditedAdmin, dj.ModelAdmin):
    audit_target = "market_payout"
    form = PayoutForm
    list_display = ("seller", "month_label", "amount", "status", "pay_to", "paid_at")
    list_filter = ("status", "month")
    ordering = ("status", "-month")
    readonly_fields = ("seller", "month_label", "amount", "status", "pay_to", "sales", "paid_at", "paid_by")
    fields = ("seller", "month_label", "amount", "pay_to", "sales", "status", "reference", "mark_paid",
              "paid_at", "paid_by")

    def changelist_view(self, request, extra_context=None):
        # The 7th: last month's rows appear the first time Finance looks.
        if timezone.localdate().day >= 7:
            made = services.run_payouts()
            if made:
                record(request, "market_payout.run", "market_payout", count=len(made))
                self.message_user(request, f"{len(made)} payouts made for last month.", messages.INFO)
        return super().changelist_view(request, extra_context)

    @dj.display(description="Seller")
    def seller(self, obj):
        return _seller_cell(obj.seller_id)

    @dj.display(description="For", ordering="month")
    def month_label(self, obj):
        return obj.month.strftime("%B %Y")

    @dj.display(description="Amount", ordering="amount_paise")
    def amount(self, obj):
        return _rupees(obj.amount_paise)

    @dj.display(description="Pay to")
    def pay_to(self, obj):
        from apps.consultants import payout_details as crypto
        from apps.consultants.models import PayoutDetails

        pro = PayoutDetails.objects.filter(consultant_id=obj.seller_id).first()
        if pro is not None:
            account = crypto.decrypt(pro.account_cipher) or f"…{pro.account_last4}"
            return format_html("{}<br><small>A/c {} · {} · UPI {} · {}</small>", pro.account_holder, account,
                               pro.ifsc, pro.upi_id or "—", pro.status)
        bank = SellerBank.objects.filter(pk=obj.seller_id).first()
        if bank is not None:
            account = crypto.decrypt(bank.account_cipher) if bank.account_cipher else "—"
            return format_html("{}<br><small>A/c {} · {} · UPI {}</small>", bank.account_holder,
                               account or f"…{bank.account_last4}", bank.ifsc or "—", bank.upi_id or "—")
        return format_html("<strong style='color:#b91c1c'>No payout details yet</strong>")

    @dj.display(description="Sales in it")
    def sales(self, obj):
        rows = format_html_join("", "<li>{} · {} gross · {} commission · {} delivery · {} net</li>", (
            (e.listing.title, _rupees(e.gross_paise), _rupees(e.commission_paise), _rupees(e.delivery_paise),
             _rupees(e.net_paise)) for e in obj.earnings.select_related("listing").order_by("created_at")))
        return format_html("<ul>{}</ul>", rows)

    def save_model(self, request, obj, form, change):
        if form.cleaned_data.get("mark_paid"):
            services.mark_paid(obj, form.cleaned_data["reference"].strip(), _who(request))
            record(request, "market_payout.paid", "market_payout", target_id=obj.pk,
                   amount_paise=obj.amount_paise, reference=obj.reference)
            return
        super().save_model(request, obj, form, change)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.FINANCE)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.FINANCE)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.FINANCE)


@dj.register(SellerEarning, site=site)
class SellerEarningAdmin(dj.ModelAdmin):
    list_display = ("created_at", "seller", "what", "gross", "commission", "delivery", "net", "in_payout")
    list_filter = ("listing__kind",)
    ordering = ("-created_at",)

    @dj.display(description="Seller")
    def seller(self, obj):
        return _seller_cell(obj.seller_id)

    @dj.display(description="Sold")
    def what(self, obj):
        return f"{obj.listing.title} ({obj.listing.kind})"

    @dj.display(description="Gross")
    def gross(self, obj):
        return _rupees(obj.gross_paise)

    @dj.display(description="Commission")
    def commission(self, obj):
        return f"{_rupees(obj.commission_paise)} ({obj.commission_bps / 100:g}%)"

    @dj.display(description="Delivery")
    def delivery(self, obj):
        return _rupees(obj.delivery_paise)

    @dj.display(description="Net to seller")
    def net(self, obj):
        return _rupees(obj.net_paise)

    @dj.display(description="Payout")
    def in_payout(self, obj):
        if not obj.payout_id:
            return "next run"
        return f"{obj.payout.month:%b %Y} · {obj.payout.status}"

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.FINANCE)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.FINANCE)
