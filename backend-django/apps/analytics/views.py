"""The ingest endpoint.

`AllowAny`, deliberately: the onboarding screens and the feed are both
visible signed out and both worth counting, and requiring a session would
make "how many people bounced before signing up" unanswerable — which is
most of the question.

It answers 202 and an empty body whatever happens. Analytics must never be
able to break a screen: a client that gets a 400 and retries is worse than
a lost event, and nothing on the phone should branch on whether a metric
was recorded.
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import services


@api_view(["POST"])
@permission_classes([AllowAny])
def collect(request):
    profile_id = getattr(request.user, "id", None) if request.user.is_authenticated else None
    rows = request.data.get("events") if isinstance(request.data, dict) else request.data
    if not isinstance(rows, list):
        rows = []
    try:
        services.record_batch(rows, profile_id=profile_id)
    except Exception:  # noqa: BLE001 — see the module docstring
        pass
    return Response(status=202)
