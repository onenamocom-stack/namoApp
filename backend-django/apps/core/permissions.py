from rest_framework.permissions import SAFE_METHODS, BasePermission

# Server-side expression of the RLS policy table in docs/05-BACKEND-SCHEMA.md
# §7. The schema's own rule is explicit: there is no `role` column —
# consultant-ness is the existence of a `consultants` row, and the policies
# scope by `auth.uid()` (the JWT sub). The JWT `role` claim carries
# "authenticated" for signed-in users, with "admin" only on tokens issued to
# admin application users.
#
# M1 is claims-based only, matching the spec's cutover order. The DB-backed
# hook below is where a module adds a consultants-table check when it lands.


def _role(user):
    return getattr(user, "role", "") or ""


class IsSeeker(BasePermission):
    """Any verified, signed-in user acts as a seeker (docs/02 §5: a
    consultant is also a seeker — they have a wallet and can buy reports)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.pk)


class IsConsultant(BasePermission):
    """Claims-based consultant check: a `consultant` role claim on the JWT.

    Later modules (consultants, phase 6) layer the DB check on top via
    ConsultantExists — claims say what the token asserts, the consultants
    table says what is true (`status = 'approved'` gates the public surface
    in docs/05 §4.2).
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and _role(user) == "consultant")


class IsAdmin(BasePermission):
    """The admin claim. Mirrors docs/02 §7: the admin console is a separate
    application and its tokens carry `admin` in role/app_metadata."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and _role(user) == "admin")


class ConsultantExists(BasePermission):
    """DB-backed hook for later modules, deliberately NOT enforced in M1.

    Compose with IsConsultant when the consultants module lands:

        permission_classes = [IsConsultant, ConsultantExists]

    The check runs one indexed existence query against the consultants table
    (added by that module's baseline migration) so an unapplied or blocked
    consultant gets 403 even with a well-formed claim. Not wired anywhere in
    Phase 1 — there is no consultants table in this skeleton to check.
    """

    def has_permission(self, request, view):
        from django.db import connection

        user = request.user
        if not (user and user.is_authenticated):
            return False
        with connection.cursor() as cursor:
            cursor.execute(
                "select 1 from consultants where profile_id = %s",
                [str(user.pk)],
            )
            return cursor.fetchone() is not None


class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS
