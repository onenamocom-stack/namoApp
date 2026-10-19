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

from apps.consultants.models import Consultant, PayoutDetails, PayoutDetailsStatus, ProfileReview
from apps.media.models import MediaAsset
from apps.media.providers import bucket_for, get_provider
from apps.profiles.models import Profile

from .audit import AuditedAdmin, DecideButtons, record
from .models import AdminAction, AdminUser, Tier
from .site import admin_row, at_least, site


@dj.register(Consultant, site=site)
class ConsultantAdmin(DecideButtons, AuditedAdmin, dj.ModelAdmin):
    """The queue. Pending first, because that is the job."""

    audit_target = "consultant"
    list_display = ("who", "category", "specialization", "rates", "status", "verified", "badge", "free_first", "created_at")
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
    # Approve on the applicant's own page (18 Oct 2026, Rahul could not find it).
    decide_buttons = (("Approve", "approve", "go"),)

    def decide_shown(self, obj):
        return obj.status == Consultant.Status.PENDING
    list_per_page = 50

    @dj.display(description="Applicant")
    def who(self, obj):
        p = Profile.objects.filter(pk=obj.profile_id).only("name", "phone").first()
        if p is None:
            return str(obj.profile_id)
        return format_html("<strong>{}</strong><br><small>{}</small>", p.name or "—", p.phone or "")

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
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    # Without these two the queue does not appear in the menu AT ALL.
    # Django falls back to its own model permissions, which a console
    # operator has none of — they are staff by way of `admin_users`, not
    # by way of auth_permission. The approval queue was invisible on the
    # first deploy for exactly this reason.
    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

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
            # The person hears it (docs/06 Phase 18, 16 Oct 2026): nothing
            # told them before.
            if verb == "approve" and was == Consultant.Status.PENDING:
                from apps.notifications import services as notify

                notify.push(consultant.profile_id, kind="module.pro.approved", title="You are a Pro now",
                            body="People can book you. Set your price and hours in Studio, then go online.",
                            ref_type="module", ref_id=str(consultant.profile_id))
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
        "who", "status", "pan_full", "pan_name", "account_holder", "account_full", "account_type",
        "ifsc", "upi_id", "pan_document", "bank_document", "firm_name", "gst_number", "gst_document",
        "review_note", "submitted_at", "reviewed_at", "reviewed_by",
    )
    readonly_fields = (
        "who", "status", "pan_full", "pan_name", "account_holder", "account_full", "account_type",
        "ifsc", "upi_id", "pan_document", "bank_document", "firm_name", "gst_number", "gst_document",
        "submitted_at", "reviewed_at", "reviewed_by",
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

    @dj.display(description="GST certificate")
    def gst_document(self, obj):
        if not obj.gst_doc_asset_id:
            return "—"
        return _signed_document(obj.gst_doc_asset_id, "GST certificate")

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



@dj.register(ProfileReview, site=site)
class ProfileReviewAdmin(AuditedAdmin, dj.ModelAdmin):
    """Profile changes waiting for a check (13 Oct 2026, Rahul).

    A consultant edits their specialization, bio, experience and languages
    themselves; a change to the practice (category), the credentials or the
    degree and its scan waits here, because those were checked when they
    were approved. Compare "now" with "asked for", open the new certificate
    if there is one, then Approve — it goes on the profile at once — or
    write the reason in the review note, save, and Reject.
    """

    audit_target = "profile_review"
    list_display = ("who", "status", "changes", "submitted_at")
    list_filter = ("status",)
    ordering = ("status", "-submitted_at")
    fields = (
        "who", "status", "now_category", "category", "now_credentials", "credentials",
        "now_degree", "degree", "certificate", "review_note",
        "submitted_at", "reviewed_at", "reviewed_by",
    )
    readonly_fields = (
        "who", "status", "now_category", "category", "now_credentials", "credentials",
        "now_degree", "degree", "certificate", "submitted_at", "reviewed_at", "reviewed_by",
    )
    actions = ("approve", "reject")
    list_per_page = 50

    def _current(self, obj):
        return Consultant.objects.filter(profile_id=obj.consultant_id).first()

    @dj.display(description="Consultant")
    def who(self, obj):
        p = Profile.objects.filter(pk=obj.consultant_id).only("name", "phone").first()
        if p is None:
            return str(obj.consultant_id)
        return format_html("<strong>{}</strong><br><small>{}</small>", p.name or "—", p.phone or "")

    @dj.display(description="What changes")
    def changes(self, obj):
        c = self._current(obj)
        if c is None:
            return "—"
        moved = []
        if obj.category != (c.category or ""):
            moved.append("practice")
        if list(obj.credentials or []) != list(c.credentials or []):
            moved.append("credentials")
        if obj.degree != (c.degree or ""):
            moved.append("degree")
        if obj.degree_asset_id:
            moved.append("certificate")
        return ", ".join(moved) or "nothing"

    @dj.display(description="Practice now")
    def now_category(self, obj):
        c = self._current(obj)
        return c.category if c else "—"

    @dj.display(description="Credentials now")
    def now_credentials(self, obj):
        c = self._current(obj)
        return ", ".join(c.credentials or []) or "—" if c else "—"

    @dj.display(description="Degree now")
    def now_degree(self, obj):
        c = self._current(obj)
        return (c.degree or "—") if c else "—"

    @dj.display(description="New certificate")
    def certificate(self, obj):
        if not obj.degree_asset_id:
            return "No new file — the one on file stays"
        return _signed_document(obj.degree_asset_id, "new certificate")

    def _decide(self, request, queryset, approve):
        from apps.consultants import profile_edit

        if not at_least(request, Tier.SUPPORT, Tier.FULFILMENT):
            return self.message_user(request, "Not your tier.", messages.ERROR)
        who = getattr(admin_row(request), "profile_id", "") or request.user.get_username()
        moved = 0
        for review in queryset:
            if not approve and not review.review_note.strip():
                self.message_user(
                    request,
                    "Write the reason in the review note and save before rejecting.",
                    messages.ERROR,
                )
                continue
            if profile_edit.decide(review, approve, who, review.review_note):
                verb = "approved" if approve else "rejected"
                record(request, f"profile_review.{verb}", "profile_review",
                       target_id=review.consultant_id, category=review.category,
                       credentials=list(review.credentials or []), degree=review.degree)
                moved += 1
        self.message_user(
            request, f"{moved} {'approved' if approve else 'rejected'}.",
            messages.SUCCESS if moved else messages.WARNING,
        )

    @dj.action(description="Approve — put the change on the profile")
    def approve(self, request, queryset):
        self._decide(request, queryset, True)

    @dj.action(description="Reject — send back with the review note")
    def reject(self, request, queryset):
        self._decide(request, queryset, False)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

    def has_change_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FULFILMENT)

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


# ── one payment on the 7th (16 Oct 2026, owner's yes) ───────────────────────


def _register_statements():
    from django.db.models import Count, Sum

    from apps.consultants import payouts
    from apps.consultants.models import PayoutStatement

    def rupees(paise):
        return f"₹{(paise or 0) / 100:,.2f}"

    class StatementForm(forms.ModelForm):
        tds = forms.DecimalField(label="TDS (₹)", min_value=0, max_digits=12, decimal_places=2, required=False,
                                 help_text="What you deduct at payout. The CA sets the rate; nothing here works it out.")
        mark_paid = forms.BooleanField(label="Mark paid", required=False,
                                       help_text="Tick after the transfer, with the bank's reference above. The person is told.")

        class Meta:
            model = PayoutStatement
            fields = ("reference",)

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.fields["tds"].initial = (self.instance.tds_paise or 0) / 100

        def clean(self):
            data = super().clean()
            tds = int(round((data.get("tds") or 0) * 100))
            if tds > self.instance.total_paise:
                raise forms.ValidationError("TDS cannot be more than the total.")
            if data.get("mark_paid") and not (data.get("reference") or "").strip():
                raise forms.ValidationError("Type the bank's reference (UTR) before marking it paid.")
            data["tds_paise"] = tds
            return data

    @dj.register(PayoutStatement, site=site)
    class PayoutStatementAdmin(AuditedAdmin, dj.ModelAdmin):
        """What each person is paid for a month, every book together —
        consulting, Market, content and commission — paid in one transfer
        on the 7th. Last month's statements are made the first time Finance
        opens this page on or after the 7th. Enter TDS, pay from the bank,
        then type the reference and tick *Mark paid*."""

        form = StatementForm
        change_list_template = "admin/summary_change_list.html"
        audit_target = "payout_statement"
        list_display = ("who", "month_label", "consulting", "market", "content", "commission", "total", "tds",
                        "to_pay", "status", "pay_to")
        list_filter = ("status", "month")
        ordering = ("status", "-month")
        readonly_fields = ("who", "month_label", "consulting", "market", "content", "commission", "total",
                           "to_pay", "pay_to", "status", "paid_at", "paid_by")
        fields = ("who", "month_label", "consulting", "market", "content", "commission", "total", "tds", "to_pay",
                  "pay_to", "reference", "mark_paid", "status", "paid_at", "paid_by")
        list_per_page = 100

        @dj.display(description="Person")
        def who(self, obj):
            p = Profile.objects.filter(pk=obj.profile_id).values("name", "phone").first() or {}
            return format_html("<strong>{}</strong><br><small>{}</small>", p.get("name") or "—", p.get("phone") or "")

        @dj.display(description="For", ordering="month")
        def month_label(self, obj):
            return obj.month.strftime("%B %Y")

        @dj.display(description="Consulting")
        def consulting(self, obj):
            return rupees(obj.consulting_paise)

        @dj.display(description="Market")
        def market(self, obj):
            return rupees(obj.market_paise)

        @dj.display(description="Content")
        def content(self, obj):
            return rupees(obj.content_paise)

        @dj.display(description="Commission")
        def commission(self, obj):
            return rupees(obj.commission_paise)

        @dj.display(description="Total", ordering="total_paise")
        def total(self, obj):
            return rupees(obj.total_paise)

        @dj.display(description="TDS")
        def tds(self, obj):
            return rupees(obj.tds_paise)

        @dj.display(description="To pay")
        def to_pay(self, obj):
            return format_html("<strong>{}</strong>", rupees(obj.to_pay_paise))

        @dj.display(description="Pay to")
        def pay_to(self, obj):
            from apps.market.models import SellerBank

            pro = PayoutDetails.objects.filter(consultant_id=obj.profile_id).first()
            if pro is not None:
                account = payout_crypto.decrypt(pro.account_cipher) or f"…{pro.account_last4}"
                tone = "" if pro.status == PayoutDetailsStatus.VERIFIED else "color:#b91c1c"
                return format_html("{}<br><small>A/c {} · {} · {} · UPI {}</small><br><small style='{}'>{}</small>",
                                   pro.account_holder, account, pro.ifsc, pro.account_type or "type not given",
                                   pro.upi_id or "—", tone, pro.get_status_display())
            bank = SellerBank.objects.filter(pk=obj.profile_id).first()
            if bank is not None:
                account = payout_crypto.decrypt(bank.account_cipher) if bank.account_cipher else ""
                return format_html("{}<br><small>A/c {} · {} · UPI {}</small><br><small>not checked by anyone</small>",
                                   bank.account_holder, account or f"…{bank.account_last4}", bank.ifsc or "—",
                                   bank.upi_id or "—")
            return format_html("<strong style='color:#b91c1c'>No payout details yet</strong>")

        def has_module_permission(self, request):
            return at_least(request, Tier.FINANCE)

        def has_view_permission(self, request, obj=None):
            return at_least(request, Tier.FINANCE)

        def has_change_permission(self, request, obj=None):
            return at_least(request, Tier.FINANCE) and (obj is None or obj.status == PayoutStatement.Status.DUE)

        def has_add_permission(self, request):
            return False

        def has_delete_permission(self, request, obj=None):
            return False

        def save_model(self, request, obj, form, change):
            who = getattr(request.user, "email", "") or str(request.user)
            was = PayoutStatement.objects.values_list("tds_paise", flat=True).get(pk=obj.pk)
            PayoutStatement.objects.filter(pk=obj.pk).update(tds_paise=form.cleaned_data["tds_paise"],
                                                             reference=form.cleaned_data.get("reference") or "")
            obj.refresh_from_db()
            if was != obj.tds_paise:
                record(request, "payout_statement.tds", "payout_statement", target_id=obj.pk, was=was,
                       now=obj.tds_paise)
            if form.cleaned_data.get("mark_paid"):
                payouts.mark_paid(obj, obj.reference, who)
                record(request, "payout_statement.paid", "payout_statement", target_id=obj.pk,
                       amount_paise=obj.to_pay_paise, reference=obj.reference)

        def changelist_view(self, request, extra_context=None):
            made = payouts.build()
            if made:
                record(request, "payout_statement.run", "payout_statement", count=len(made))
                self.message_user(request, f"{len(made)} statements made for last month.", messages.INFO)
            due = PayoutStatement.objects.filter(status=PayoutStatement.Status.DUE)
            totals = due.aggregate(n=Count("id"), t=Sum("total_paise"), d=Sum("tds_paise"))
            since = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            paid = PayoutStatement.objects.filter(status=PayoutStatement.Status.PAID, paid_at__gte=since)
            extra_context = extra_context or {}
            extra_context["summary_cards"] = [
                ("Due now", rupees((totals["t"] or 0) - (totals["d"] or 0)), f"{totals['n']} people, after TDS"),
                ("Paid this month", rupees(paid.aggregate(t=Sum("total_paise"))["t"]), f"{paid.count()} people"),
                ("Next statements", "on the 7th of each month", "made when this page is opened, for the month before"),
            ]
            return super().changelist_view(request, extra_context)


_register_statements()


from apps.consultants.models import ProDayReport  # noqa: E402


@dj.register(ProDayReport, site=site)
class ProDayReportAdmin(dj.ModelAdmin):
    """Every Pro's day, scored (19 Oct 2026, Rahul): Online time, calls
    received and answered (video weighs 2, audio 1.5, chat 1), customers
    who recharged after reaching them, and the badge. Written at 23:00 IST,
    when each Pro is sent theirs, and again the next morning with the last
    hour (`final`). Read only; `apps/consultants/report.py` has the rules."""

    list_display = ("who", "day", "badge", "online", "received", "answered", "video", "recharged", "score_bar", "final")
    list_filter = ("day", "badge", "final")
    ordering = ("-day", "-score")
    date_hierarchy = "day"
    list_per_page = 100

    @dj.display(description="Pro")
    def who(self, obj):
        p = Profile.objects.filter(pk=obj.consultant_id).values("name", "phone").first() or {}
        return format_html("<strong>{}</strong><br><small>{}</small>", p.get("name") or "—", p.get("phone") or "")

    @dj.display(description="Online", ordering="live_seconds")
    def online(self, obj):
        h, m = divmod(obj.live_seconds // 60, 60)
        return f"{h}h {m:02d}m"

    @dj.display(description="Calls received")
    def received(self, obj):
        return f"{obj.received_chat + obj.received_audio + obj.received_video}  (chat {obj.received_chat} · audio {obj.received_audio} · video {obj.received_video})"

    @dj.display(description="Answered")
    def answered(self, obj):
        return obj.attended_chat + obj.attended_audio + obj.attended_video

    @dj.display(description="Video answered")
    def video(self, obj):
        return f"{obj.attended_video} of {obj.received_video}"

    @dj.display(description="Score", ordering="score")
    def score_bar(self, obj):
        tone = "#30a46c" if obj.score >= 70 else "#f5782c" if obj.score >= 40 else "#e5484d"
        return format_html('<strong style="color:{}">{}</strong>/100', tone, obj.score)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FINANCE)

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FINANCE)
