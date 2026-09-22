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

from .models import AdminUser, Tier

logger = logging.getLogger("apps.console")


class NamoAdminSite(AdminSite):
    site_header = "Namo console"
    site_title = "Namo console"
    index_title = "What needs doing"
    # Never "/admin/": a default path is a default attack surface, and this
    # one is worth not advertising.
    site_url = None

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
