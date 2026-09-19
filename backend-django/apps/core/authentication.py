import jwt
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .jwks import JWKSFetchError, decode_supabase_token

# Error body contract (see HANDOFF §10 and docs/02-TRD.md §6): the client
# already reads `{ ok, reason, message }` refusals off the wallet/booking
# paths, so 401s and 403s use the same envelope instead of inventing a new
# vocabulary. 401 -> reason "unauthenticated", 403 -> reason "forbidden".
UNAUTHENTICATED_REASON = "unauthenticated"


class SupabaseUser:
    """Lightweight request.user for a verified Supabase JWT.

    Not a Django model: identity stays in Supabase Auth (docs/07 §1). Later
    modules hang `request.profile` off the profiles table in middleware or
    a view mixin when their app lands.
    """

    is_authenticated = True
    is_anonymous = False
    is_active = True
    is_staff = False
    is_superuser = False

    def __init__(self, claims):
        self.claims = claims
        self.pk = claims["sub"]
        self.id = claims["sub"]

    @property
    def phone(self):
        return self.claims.get("phone", "")

    @property
    def role(self):
        """Role claims the RLS policies key on (docs/05 §7). Supabase puts
        `role` at top level; some projects mirror it into app_metadata."""
        app_metadata = self.claims.get("app_metadata") or {}
        return app_metadata.get("role") or self.claims.get("role", "")

    def __str__(self):
        return f"SupabaseUser({self.pk})"


class SupabaseJWTAuthentication(BaseAuthentication):
    """DRF authentication: `Authorization: Bearer <supabase jwt>`.

    No token -> AnonymousUser (permission classes decide 401/403). An
    attempt with a token that fails verification -> 401 with the standard
    refusal envelope.
    """

    www_authenticate_realm = "api"

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return None
        token = parts[1]
        try:
            claims = decode_supabase_token(token)
        except JWKSFetchError as exc:
            raise AuthenticationFailed(str(exc), code=UNAUTHENTICATED_REASON)
        except jwt.PyJWTError:
            raise AuthenticationFailed("Token could not be verified.", code=UNAUTHENTICATED_REASON)
        return (SupabaseUser(claims), token)
