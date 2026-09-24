"""Who came from whose code, and did anybody claim twice.

THE SECOND QUESTION IS THE POINT. The owner asked for it in those words:
*"multiple toh coupons toh user ne use toh nahi krlie na"*. The answer is
structural rather than a report — `referrals` carries a unique index on
(referee_id, kind), so a seeker is referred once and buys their first
thing once, and the database refuses the second attempt before any screen
has to notice it. These pages are for reading what happened, not for
catching what the schema already prevents.

PHONE IS THE IDENTITY. `profiles.phone` is unique and verified by OTP, so
one human with one number has one account and one referral. The lists
below show the phone beside every name for exactly that reason: two rows
that look like different people are the same person only if the number
matches, and it cannot.
"""

from django.contrib import admin as dj, messages
from django.db.models import Count, Sum
from django.utils.html import format_html

from apps.console.models import Tier
from apps.console.site import at_least, site

from .models import Cashback, Referral, ReferralCode


def _person(profile_id):
    """Name and phone together. The phone is what makes two rows the same
    person or not, so it is never omitted to save width."""
    from apps.profiles.models import Profile

    p = Profile.objects.filter(pk=profile_id).only("name", "phone").first()
    if not p:
        return str(profile_id)[:8]
    return format_html("{}<br><small>{}</small>", p.name or "—", p.phone)


class ReadOnly:
    """Nothing in this module is typed by hand. A referral is a record of
    something that happened; editing one would be editing history, and
    the money that moved on the back of it does not move with the edit."""

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


@dj.register(ReferralCode, site=site)
class ReferralCodeAdmin(ReadOnly, dj.ModelAdmin):
    list_display = ("code", "kind", "owner", "brought", "active", "created_at")
    list_filter = ("kind", "active", "created_at")
    search_fields = ("code",)
    date_hierarchy = "created_at"
    list_per_page = 50

    @dj.display(description="Belongs to")
    def owner(self, obj):
        return _person(obj.profile_id)

    @dj.display(description="Brought")
    def brought(self, obj):
        """What this code has actually done. A code with a big number is
        the one to look at when a number looks wrong."""
        rows = Referral.objects.filter(code=obj.code)
        signups = rows.filter(kind=Referral.Kind.SIGNUP).count()
        orders = rows.filter(kind=Referral.Kind.PURCHASE).count()
        if not signups and not orders:
            return "—"
        return format_html("{} joined<br>{} first orders", signups, orders)


@dj.register(Referral, site=site)
class ReferralAdmin(ReadOnly, dj.ModelAdmin):
    list_display = ("created_at", "kind", "who_referred", "who_joined", "code", "worth")
    list_filter = ("kind", "created_at")
    search_fields = ("code",)
    date_hierarchy = "created_at"
    list_per_page = 50

    @dj.display(description="Referrer")
    def who_referred(self, obj):
        return _person(obj.referrer_id)

    @dj.display(description="Referee")
    def who_joined(self, obj):
        return _person(obj.referee_id)

    @dj.display(description="Cashback")
    def worth(self, obj):
        rows = list(obj.cashbacks.all())
        if not rows:
            return "—"   # a sign-up referral pays no money, by design
        total = sum(r.amount_paise for r in rows)
        states = {r.status for r in rows}
        state = "paid" if states == {"paid"} else (
            "cancelled" if states == {"cancelled"} else "pending"
        )
        return format_html("₹{}<br><small>{}</small>", f"{total / 100:,.2f}", state)


@dj.register(Cashback, site=site)
class CashbackAdmin(ReadOnly, dj.ModelAdmin):
    """What the programme has cost and what it still owes.

    Finance reads this; Support can see it too, because the first
    question a seeker asks support is where their cashback is.
    """

    list_display = ("created_at", "owed_to", "side", "amount", "status",
                    "matures_at", "paid_at")
    list_filter = ("status", "side", "created_at")
    date_hierarchy = "created_at"
    list_per_page = 50

    @dj.display(description="Owed to")
    def owed_to(self, obj):
        return _person(obj.profile_id)

    @dj.display(description="Amount", ordering="amount_paise")
    def amount(self, obj):
        # Formatted in Python. A template filter chain produced "₹True"
        # on the dashboard once already.
        return f"₹{obj.amount_paise / 100:,.2f}"

    def changelist_view(self, request, extra_context=None):
        """The three numbers somebody actually opens this page for, above
        the list: what is owed, what has been paid, what died with a
        return. A list of rows does not answer "what is this costing us"
        without scrolling it."""
        totals = (
            Cashback.objects.values("status")
            .annotate(n=Count("id"), paise=Sum("amount_paise"))
        )
        summary = {
            row["status"]: (row["n"], row["paise"] or 0) for row in totals
        }
        extra_context = extra_context or {}
        extra_context["cashback_summary"] = [
            (label, summary.get(key, (0, 0))[0], f"₹{summary.get(key, (0, 0))[1] / 100:,.2f}")
            for key, label in (
                ("pending", "Owed, waiting out the return window"),
                ("paid", "Paid"),
                ("cancelled", "Cancelled by a return"),
            )
        ]
        return super().changelist_view(request, extra_context)
