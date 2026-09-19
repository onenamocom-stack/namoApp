"""The astro endpoints — the `astro` Edge Function's four ops as REST.

Response shapes mirror the function's JSON bodies (ok/data/time_known/date/
city/rashi/cached), and refusals use the repo's standard envelope with the
function's reason strings as the machine key: 'bad_request' -> 400 'invalid',
'signed_out' -> the JWT layer's 401, 'no_birth' -> 409, 'unavailable' -> 500,
'upstream' -> 502. The staged client lib (cutovers/astro.clientlib.js) maps
these back onto the code values the screens branch on.

Access parity with verify_jwt + getUser(): geo and panchang answer anybody
(the anon key passes; panchang has not been a function of the reader since
4 Sep 2026), chart and horoscope require a signed-in user and read birth
details from the caller's own profiles row — the client sends nothing that
decides the answer (rule 3).
"""

import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from . import services
from .providers import UpstreamError

logger = logging.getLogger("apps.astro")


def _refusal(status, reason, message):
    return Response(refusal_body(reason, message), status=status)


def _upstream_failure(exc, op):
    """Provider errors become the function's 'upstream' refusal. The
    exception message stays in the log; the body is the fixed sentence —
    never the key, never the URL, never the vendor's response."""
    if isinstance(exc, services.ProviderNotConfigured):
        # The function's missing-key case: named in the log, generic to the
        # caller — our configuration is not the user's problem.
        logger.error("astro %s: provider not configured (FREE_ASTRO_API_KEY)", op)
        return _refusal(500, "upstream", "Charts are not available right now.")
    logger.error("astro %s upstream failure: %s", op, exc)
    return _refusal(502, "upstream", "Charts are unavailable right now. Try again shortly.")


def _geo_failure(exc):
    if isinstance(exc, services.ProviderNotConfigured):
        logger.error("astro geo: provider not configured (FREE_ASTRO_API_KEY)")
        return _refusal(500, "upstream", "Charts are not available right now.")
    logger.error("astro geo upstream failure: %s", exc)
    return _refusal(502, "upstream", "Could not reach place search. Try again.")


def _resolve_date(request):
    """The date clamp the function applied to chart/panchang/horoscope:
    absent means today; outside yesterday–tomorrow is a 400."""
    date_string = services.allowed_date(request.query_params.get("date"))
    if date_string is None:
        return None, _refusal(400, "invalid", "That date is outside what we compute.")
    return date_string, None


def _birth_or_refusal(request):
    """The caller's own birth row. A FAILED READ is not an ABSENT ROW: the
    first is 500 'unavailable', the second 409 'no_birth' — conflating them
    tells somebody with a perfectly good birth record that they never
    entered one."""
    try:
        birth = services.get_birth_details(request.user.pk)
    except Exception:
        logger.exception("astro: could not read profile for %s", request.user.pk)
        return None, _refusal(500, "unavailable", "Could not load your birth details. Try again.")
    if (
        birth is None
        or not birth["birth_date"]
        or birth["birth_lat"] is None
        or birth["birth_lon"] is None
    ):
        return None, _refusal(409, "no_birth", "Add your birth details to see your chart.")
    return birth, None


@api_view(["GET"])
@permission_classes([AllowAny])  # AskPlace runs during onboarding, before anyone has signed in
def geo(request):
    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return _refusal(400, "invalid", "Type at least two letters.")
    try:
        results = services.place_search(q)
    except (UpstreamError, services.ProviderNotConfigured) as exc:
        return _geo_failure(exc)
    return Response({"ok": True, "results": results})


@api_view(["GET"])
@permission_classes([AllowAny])  # one row a day for everybody, signed in or out
def panchang(request):
    date_string, refusal = _resolve_date(request)
    if refusal is not None:
        return refusal
    try:
        payload, cached = services.panchang(date_string)
    except (UpstreamError, services.ProviderNotConfigured) as exc:
        return _upstream_failure(exc, "panchang")
    return Response({
        "ok": True, "data": payload, "date": date_string,
        "city": services.PANCHANG_ANCHOR["city"], "cached": cached,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def chart(request):
    date_string, refusal = _resolve_date(request)
    if refusal is not None:
        return refusal
    birth, refusal = _birth_or_refusal(request)
    if refusal is not None:
        return refusal
    try:
        payload, cached = services.user_chart(request.user.pk, birth)
    except (UpstreamError, services.ProviderNotConfigured) as exc:
        return _upstream_failure(exc, "chart")
    return Response({
        "ok": True, "data": payload, "time_known": services.time_known(birth),
        "date": date_string, "cached": cached,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def horoscope(request):
    date_string, refusal = _resolve_date(request)
    if refusal is not None:
        return refusal
    birth, refusal = _birth_or_refusal(request)
    if refusal is not None:
        return refusal
    try:
        payload, rashi, cached = services.horoscope(request.user.pk, birth, date_string)
    except (UpstreamError, services.ProviderNotConfigured) as exc:
        return _upstream_failure(exc, "horoscope")
    return Response({
        "ok": True, "data": payload, "time_known": services.time_known(birth),
        "date": date_string, "rashi": rashi, "cached": cached,
    })
