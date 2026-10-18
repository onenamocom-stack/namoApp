"""The console itself — a Django AdminSite with two things added: who may
open it, and a record of what they did.

ISOLATION (docs/02-TRD.md §7, revised 22 Sep 2026). The TRD asked for a
separate application holding the service-role key, because under Supabase
the only way to read across every user was to bypass RLS, and a leaked
admin JWT would have read every wallet in the system. That threat does not
survive the Django cutover: there is no RLS in this path and no admin JWT
to leak. The goal it was protecting — **a compromised seeker session must
not reach the console** — is met differently and better here: the console
authenticates against `auth_user` with a session cookie, an entirely
different credential from the Supabase JWT the phone app carries. One is
not convertible into the other.

What is still honoured is the separation of the RUNTIME. `ADMIN_ENABLED`
and `PUBLIC_API_ENABLED` split one image into two Cloud Run services: the
public API serves no console URL at all, and the console serves no `/v1`.
A hole in one is not a door into the other, and the console can be put
behind an IP allowlist without touching the app.
"""

import logging

from django.contrib.admin import AdminSite
from django.utils.safestring import mark_safe

from .models import AdminUser, Tier

logger = logging.getLogger("apps.console")


class NamoAdminSite(AdminSite):
    # The owner's NAMO logo (5 Oct 2026), served from the app's public folder.
    site_header = mark_safe(
        '<img src="https://1namo.com/namo-logo-light.png" alt="NAMO" '
        'style="height:28px;vertical-align:middle;margin-right:10px">console'
    )
    site_title = "NAMO console"
    index_title = "What needs doing"
    # Never "/admin/": a default path is a default attack surface, and this
    # one is worth not advertising.
    site_url = None
    # No index_template here any more: apps.console is registered before
    # django.contrib.admin now (config/settings/base.py), so the plain
    # `admin/index.html` override wins on its own — and the same ordering
    # is what lets `admin/base_site.html` put the nav on EVERY page rather
    # than only the two we wrote.

    def has_permission(self, request):
        """Django's `is_staff` is not the gate — an ACTIVE row in
        `admin_users` is.

        Two checks rather than one, because they answer different
        questions: `is_active` is "can this login work at all", and the
        admin row is "is this person an admin right now". Revoking access
        should be one flag flipped in one table, not a password change.
        """
        user = request.user
        if not user.is_active or not user.is_authenticated:
            return False
        admin = getattr(user, "admin_profile", None)
        return bool(admin and admin.active)

    def index(self, request, extra_context=None):
        """The front page's numbers (16 Oct 2026, Rahul: the console by
        module): what is waiting for somebody, and what is owed. A count
        that fails reads as a dash; the page always opens."""
        extra_context = extra_context or {}
        extra_context["queues"] = waiting_counts()
        return super().index(request, extra_context)


def tier_of(request):
    """The acting admin's tier, or None. Everything the console refuses is
    refused on this."""
    admin = getattr(request.user, "admin_profile", None)
    return admin.tier if admin and admin.active else None


def admin_row(request):
    return getattr(request.user, "admin_profile", None)


def at_least(request, *tiers):
    """Tier membership, not a hierarchy. Fulfilment is not "more" than
    Finance — they do different jobs — so every rule names the tiers it
    allows instead of comparing ranks. Superadmin is in every set."""
    tier = tier_of(request)
    return tier is not None and (tier == Tier.SUPERADMIN or tier in tiers)


site = NamoAdminSite(name="namo")


def waiting_counts():
    def count(fn):
        try:
            return fn()
        except Exception:  # noqa: BLE001 — a number, never a broken front page
            logger.exception("console front page count failed")
            return "—"

    def owed():
        from django.db.models import Sum

        from apps.consultants.models import PayoutStatement

        due = PayoutStatement.objects.filter(status="due").aggregate(t=Sum("total_paise"), d=Sum("tds_paise"))
        return f"₹{((due['t'] or 0) - (due['d'] or 0)) / 100:,.0f}"

    from apps.clips.models import Video
    from apps.consultants.models import Consultant, PayoutDetails, ProfileReview
    from apps.content.models import ModerationFlag, Report, Review
    from apps.market.models import Listing
    from apps.profiles.models import ModuleRequest
    from apps.shop.models import Shipment

    return {
        "pros": count(lambda: Consultant.objects.filter(status="pending").count()),
        "modules": count(lambda: ModuleRequest.objects.filter(status="pending").count()),
        "reviews": count(lambda: ProfileReview.objects.filter(status="pending").count()),
        "payout_details": count(lambda: PayoutDetails.objects.filter(status="submitted").count()),
        "listings": count(lambda: Listing.objects.filter(status="pending").count()),
        "reports": count(lambda: Report.objects.filter(status="open").count()),
        "pro_reviews": count(lambda: Review.objects.filter(status="pending").count()),
        "flags": count(lambda: ModerationFlag.objects.filter(status="open").count()),
        "videos": count(lambda: Video.objects.filter(status="in_review").count()),
        "parcels": count(lambda: Shipment.objects.filter(status="ready").count()),
        "owed": count(owed),
    }

