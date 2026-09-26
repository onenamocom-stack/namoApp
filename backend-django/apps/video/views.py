from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from . import services


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def join(request, session_id):
    """A door into this session's call, for whoever is asking.

    POST rather than GET: it creates the room the first time and mints a
    token every time, and a GET that mints credentials is a GET that gets
    prefetched.
    """
    result = services.join(request.user.pk, session_id)
    if not result["ok"]:
        return Response(refusal_body("refused", result["reason"]), status=409)
    return Response(result)
