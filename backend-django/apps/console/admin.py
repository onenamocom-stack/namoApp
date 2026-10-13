"""Stage 1 — the approval queue, and the console's own two tables.

Consultant approval is first for a reason that is not sentiment: **it is
the only thing here that is currently impossible.** A consultant who
applies today lands at `pending` and stays there forever, invisible and
unbookable, because nothing anywhere can move them. Shop, reels and
analytics all have workarounds; this one does not.
"""

from django.contrib import admin as dj, messages
from django.utils import timezone
from django.utils.html import format_html

from apps.consultants import payout_details as payout_crypto
from apps.consultants import services as consultant_services
from django import forms

from apps.consultants.models import FEE_BPS, Consultant, PayoutDetails, PayoutDetailsStatus
from apps.media.models import MediaAsset
from apps.media.providers import bucket_for, get_provider
from apps.profiles.models import Profile

from .audit import AuditedAdmin, record
from .models import AdminAction, AdminUser, Tier
from .site import admin_row, at_least, site


class ConsultantForm(dj.ModelAdmin.form):
    """Namo's share typed as a percent (13 Oct 2026); stored as basis points."""

    namo_share = forms.DecimalField(
        label="Namo's share %", required=False, min_value=0, max_value=100, decimal_places=2,
        help_text="Of this astrologer's session earnings. Blank uses the default "
                  "(%(d)s%%). 50 is a 50:50 split. Applies to sessions from now on." % {"d": FEE_BPS // 100},
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.fee_bps is not None:
            self.fields["namo_share"].initial = self.instance.fee_bps / 100

    def save(self, commit=True):
        obj = super().save(commit=False)
        if "namo_share" in self.cleaned_data:
            share = self.cleaned_data.get("namo_share")
            obj.fee_bps = None if share is None else round(share * 100)
        if commit:
            obj.save()
        return obj


@dj.register(Consultant, site=site)
class ConsultantAdmin(AuditedAdmin, dj.ModelAdmin):
    """The queue. Pending first, because that is the job."""

    audit_target = "consultant"
    form = ConsultantForm
    list_display = ("who", "category", "specialization", "rates", "namo_cut", "status", "verified", "badge", "free_first", "created_at")
    list_filter = ("status", "verified", "badge", "free_first", "category")
    # Ticked here, straight from the list: the in-house consultants a new
    # seeker sees free for their first session (7 Oct 2026), and the badge
    # seekers see — Pro, Expert or Master (13 Oct 2026).
    list_editable = ("badge", "free_first")
    # Tags are what a seeker searches by, so they are what an
    # operator should be able to search by too.
    search_fields = ("specialization", "bio", "category", "tags", "degree")
    ordering = ("status", "-created_at")
    readonly_fields = (
        "profile_id", "created_at", "rating_avg_cache", "rating_count_cache",
        "rank_score_cache", "legacy_id", "who", "certificate", "rates",
    )
    actions = ("approve", "block", "unblock")
    list_per_page = 50

    @dj.display(description="Applicant")
    def who(self, obj):
        p = Profile.objects.filter(pk=obj.profile_id).only("name", "phone").first()
        if p is None:
            return str(obj.profile_id)
        return format_html("<strong>{}</strong><br><small>{}</small>", p.name or "—", p.phone or "")

    @dj.display(description="Namo : astrologer")
    def namo_cut(self, obj):
        bps = FEE_BPS if obj.fee_bps is None else obj.fee_bps
        split = f"{bps / 100:g} : {100 - bps / 100:g}"
        return split if obj.fee_bps is not None else format_html("{}<br><small>default</small>", split)

    def get_fields(self, request, obj=None):
        """The share is set through `namo_share`, never as raw basis points."""
        fields = [f for f in super().get_fields(request, obj) if f not in ("fee_bps", "namo_share")]
        return fields + ["namo_share"] if at_least(request, Tier.FINANCE) else fields + ["namo_cut"]

    def get_readonly_fields(self, request, obj=None):
        """Finance changes Namo's share and nothing else here; Support and
        Fulfilment run the queue and see the share. Superadmin does both."""
        from apps.console.site import tier_of

        ro = list(super().get_readonly_fields(request, obj))
        if tier_of(request) == Tier.FINANCE:
            return [f.name for f in Consultant._meta.fields] + ro
        return ro if at_least(request, Tier.FINANCE) else ro + ["namo_cut"]

    def get_actions(self, request):
        """Approve, block and unblock are the queue's — not Finance's."""
        from apps.console.site import tier_of

        actions = super().get_actions(request)
        return {} if tier_of(request) == Tier.FINANCE else actions

    @dj.display(description="Rates (₹/min)")
    def rates(self, obj):
        """The four rates the consultant typed (10 Oct 2026). Read only: the
        consultant sets them, and a price change from here would be a money
        edit with no trail on their side."""
        r = consultant_services.rates_of(obj.profile_id)
        if not any(r.values()):
            return "—"
        show = lambda v: "—" if v is None else f"₹{v}"  # noqa: E731
        booking = r["booking"]
        slot = "" if booking is None else f" (₹{booking * consultant_services.SLOT_MINUTES} a slot)"
        return format_html(
            "Chat {} · Video {} · Audio {}<br><small>Booking {}{}</small>",
            show(r["chat"]), show(r["video"]), show(r["audio"]), show(booking), slot,
        )

    @dj.display(description="Degree certificate")
    def certificate(self, obj):
        """A link that works for ten minutes, and only here.

        The scan sits in the private bucket: it has no public URL and the
        only reader it is meant to have is whoever is deciding this
        application. Signing on view rather than storing a URL means a link
        copied out of this page is worthless by the time it is pasted
        anywhere.
        """
        if not obj.degree_asset_id:
            return "—"
        asset = MediaAsset.objects.filter(pk=obj.degree_asset_id).first()
        if asset is None:
            return "the file is gone"
        try:
            url = get_provider().presign_get(asset.bucket_key, bucket_for(asset.kind))
        except Exception as exc:  # noqa: BLE001 — a broken link is not a broken page
            return f"cannot sign a link right now ({type(exc).__name__})"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">Open the certificate</a>'
            '<br><small>expires in ten minutes · {}</small>',
            url, asset.mime,
        )

    def has_delete_permission(self, request, obj=None):
        """Never. PRD §6 capability 6: soft delete only — a removed record
        in a dispute is evidence. Blocking is the verb; deletion is not."""
        return False

    def has_add_permission(self, request):
        """A consultant is created by applying, not by an admin typing one
        in. An admin-made row would have no account behind it."""
        return False

    def has_change_permission(self, request, obj=None):
        # Finance too, for Namo's share only (get_readonly_fields).
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE)

    # Without these two the queue does not appear in the menu AT ALL.
    # Django falls back to its own model permissions, which a console
    # operator has none of — they are staff by way of `admin_users`, not
    # by way of auth_permission. The approval queue was invisible on the
    # first deploy for exactly this reason.
    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE)

    def _set_status(self, request, queryset, status, verb):
        """One place, so approve/block/unblock cannot drift apart. The audit
        row names the consultant and what it was before — an appeal needs
        the previous state, not just the new one."""
        moved = 0
        for consultant in queryset:
            was = consultant.status
            if was == status:
                continue
            Consultant.objects.filter(pk=consultant.pk).update(status=status)
            record(request, f"consultant.{verb}", "consultant",
                   target_id=consultant.profile_id, was=was, now=status)
            moved += 1
        self.message_user(
            request, f"{moved} {verb}.", messages.SUCCESS if moved else messages.WARNING
        )

    @dj.action(description="Approve — make visible and bookable")
    def approve(self, request, queryset):
        if not at_least(request, Tier.SUPPORT, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        self._set_status(request, queryset, Consultant.Status.APPROVED, "approve")

    @dj.action(description="Block — invisible, unbookable, cannot earn")
    def block(self, request, queryset):
        """PRD §6 flags this as unresolved policy: a blocked consultant with
        confirmed bookings and a pending balance leaves seekers who have
        paid. Blocking is allowed here because the alternative is no way to
        stop a bad actor at all; what it does NOT do is touch money or
        cancel bookings. That call is still open and must not be made by a
        side effect."""
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        self._set_status(request, queryset, Consultant.Status.BLOCKED, "block")

    @dj.action(description="Unblock — back to approved")
    def unblock(self, request, queryset):
        if not at_least(request, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        self._set_status(request, queryset, Consultant.Status.APPROVED, "unblock")


def _signed_document(asset_id, label):
    """A ten-minute link to a private-bucket document, or why there is none
    — the certificate's rule, for any document."""
    if not asset_id:
        return "—"
    asset = MediaAsset.objects.filter(pk=asset_id).first()
    if asset is None:
        return "the file is gone"
    try:
        url = get_provider().presign_get(asset.bucket_key, bucket_for(asset.kind))
    except Exception as exc:  # noqa: BLE001 — a broken link is not a broken page
        return f"cannot sign a link right now ({type(exc).__name__})"
    return format_html(
        '<a href="{}" target="_blank" rel="noopener">Open the {}</a>'
        "<br><small>expires in ten minutes · {}</small>",
        url, label, asset.mime,
    )


@dj.register(PayoutDetails, site=site)
class PayoutDetailsAdmin(AuditedAdmin, dj.ModelAdmin):
    """Payout details waiting for a check (payouts P2, 3 Oct 2026).

    Finance only: this page shows the PAN and account number in full,
    decrypted on view, because checking them against the photos is the job.
    Nothing else in the console or the app ever shows them. To verify,
    compare the typed details with both photos and use the action; to send
    them back, write the reason in the review note, save, then use Reject.
    """

    audit_target = "payout_details"
    list_display = ("who", "status", "pan_name", "account_holder", "bank", "submitted_at")
    list_filter = ("status",)
    ordering = ("-submitted_at",)
    fields = (
        "who", "status", "pan_full", "pan_name", "account_holder", "account_full", "ifsc",
        "upi_id", "pan_document", "bank_document", "review_note",
        "submitted_at", "reviewed_at", "reviewed_by",
    )
    readonly_fields = (
        "who", "status", "pan_full", "pan_name", "account_holder", "account_full", "ifsc",
        "upi_id", "pan_document", "bank_document", "submitted_at", "reviewed_at", "reviewed_by",
    )
    actions = ("verify", "reject")
    list_per_page = 50

    @dj.display(description="Consultant")
    def who(self, obj):
        p = Profile.objects.filter(pk=obj.consultant_id).only("name", "phone").first()
        if p is None:
            return str(obj.consultant_id)
        return format_html("<strong>{}</strong><br><small>{}</small>", p.name or "—", p.phone or "")

    @dj.display(description="Bank")
    def bank(self, obj):
        return f"{obj.ifsc} ••{obj.account_last4}"

    @dj.display(description="PAN")
    def pan_full(self, obj):
        return payout_crypto.decrypt(obj.pan_cipher) or f"cannot decrypt (ends {obj.pan_last4})"

    @dj.display(description="Account number")
    def account_full(self, obj):
        return payout_crypto.decrypt(obj.account_cipher) or f"cannot decrypt (ends {obj.account_last4})"

    @dj.display(description="PAN card photo")
    def pan_document(self, obj):
        return _signed_document(obj.pan_doc_asset_id, "PAN card")

    @dj.display(description="Cheque or passbook photo")
    def bank_document(self, obj):
        return _signed_document(obj.bank_doc_asset_id, "cheque or passbook")

    def _review(self, request, queryset, status, verb):
        if not at_least(request, Tier.FINANCE):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        who = getattr(admin_row(request), "profile_id", "") or request.user.get_username()
        moved = 0
        for details in queryset:
            if status == PayoutDetailsStatus.REJECTED and not details.review_note.strip():
                self.message_user(
                    request,
                    "Write the reason in the review note and save before rejecting.",
                    messages.ERROR,
                )
                continue
            was = details.status
            PayoutDetails.objects.filter(pk=details.pk).update(
                status=status, reviewed_at=timezone.now(), reviewed_by=str(who)
            )
            record(request, f"payout_details.{verb}", "payout_details",
                   target_id=details.consultant_id, was=was, now=status)
            moved += 1
        if moved:
            self.message_user(request, f"{moved} {verb}.", messages.SUCCESS)

    @dj.action(description="Verify — details match both photos")
    def verify(self, request, queryset):
        self._review(request, queryset, PayoutDetailsStatus.VERIFIED, "verified")

    @dj.action(description="Reject — send back with the review note")
    def reject(self, request, queryset):
        self._review(request, queryset, PayoutDetailsStatus.REJECTED, "rejected")

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


@dj.register(AdminUser, site=site)
class AdminUserAdmin(AuditedAdmin, dj.ModelAdmin):
    """Who the admins are. Superadmin only — PRD §6: *Superadmin manages
    admins*."""

    audit_target = "admin"
    list_display = ("profile_id", "tier", "active", "operator", "created_at")
    list_filter = ("tier", "active")
    readonly_fields = ("created_at",)

    # Spelled out rather than aliased: Django's four permission hooks do
    # not share a signature (`view`, `change` and `delete` take an object;
    # `module` and `add` do not), and one alias with the wrong arity fails
    # at request time rather than at import.
    def has_module_permission(self, request):
        return at_least(request)  # superadmin only

    def has_view_permission(self, request, obj=None):
        return at_least(request)

    def has_add_permission(self, request):
        return at_least(request)

    def has_change_permission(self, request, obj=None):
        return at_least(request)

    def has_delete_permission(self, request, obj=None):
        """Deactivate, never delete. `admin_actions` points at this row, and
        an audit trail whose author can be erased is not a trail."""
        return False


@dj.register(AdminAction, site=site)
class AdminActionAdmin(dj.ModelAdmin):
    """The trail, readable and nothing else. No add, no change, no delete —
    at any tier, including superadmin. An append-only log with an edit
    button is a log nobody can rely on."""

    list_display = ("created_at", "admin", "action", "target_type", "target_id")
    list_filter = ("action", "target_type")
    search_fields = ("action", "target_type")
    date_hierarchy = "created_at"
    list_per_page = 100

    # Every tier can read the trail. An audit log only a superadmin can see
    # is one the people it protects cannot check.
    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
