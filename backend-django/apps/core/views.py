from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import (
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied,
    Throttled,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .authentication import UNAUTHENTICATED_REASON


def refusal_body(reason, message, **extra):
    """The repo's refusal envelope (docs/02-TRD.md §6): second person,
    present tense, machine-readable reason, human-readable message."""
    body = {"ok": False, "reason": reason, "message": message}
    body.update(extra)
    return body


def exception_handler(exc, context):
    """Map auth/permission failures onto the refusal envelope.

    401 -> reason "unauthenticated" (UNAUTHENTICATED_REASON), 403 -> reason
    "forbidden", 400 validation -> reason "invalid" with the field errors.
    Everything else defers to DRF's handler (which itself produces
    {"detail": ...} 500s; modules refine from here).
    """
    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        reason = getattr(exc, "code", None) or UNAUTHENTICATED_REASON
        message = exc.detail if isinstance(exc.detail, str) else "Sign in to continue."
        if isinstance(exc, AuthenticationFailed) and isinstance(exc.detail, str):
            message = exc.detail
        return Response(refusal_body(reason, message), status=401)
    if isinstance(exc, PermissionDenied):
        message = exc.detail if isinstance(exc.detail, str) else "You do not have access to this."
        return Response(refusal_body("forbidden", message), status=403)
    if isinstance(exc, Throttled):
        return Response(
            refusal_body("throttled", "Too many requests. Wait a moment and try again."),
            status=429,
        )
    if isinstance(exc, ValidationError):
        return Response(
            refusal_body("invalid", "Check the highlighted fields.", errors=exc.detail),
            status=400,
        )
    return drf_exception_handler(exc, context)


@api_view(["GET"])
@permission_classes([])  # AllowAny: unauthenticated liveness probe
def health(request):
    return Response({"status": "ok", "version": settings.API_VERSION})


@api_view(["GET"])
def me(request):
    """Echo the verified claims — proves the JWT path end to end."""
    user = request.user
    return Response(
        {
            "id": str(user.pk),
            "phone": user.phone,
            "role": user.role,
            "claims": user.claims,
        }
    )
