from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import services


class MarkReadInput(serializers.Serializer):
    """No ids means all of them — the tab being opened is the usual case,
    and making the client send fifty ids to say "I looked at the screen"
    is a request that gets longer the worse the backlog is."""

    ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=True
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def feed(request):
    """The Alerts tab, and the poller behind it.

    Always the caller's own. There is no profile_id parameter, because a
    route that takes one is a route that reads somebody else's alerts.
    """
    after = request.GET.get("after") or None
    rows = services.list_for(
        request.user.pk,
        after=after,
        limit=min(int(request.GET.get("limit", 50)), 100),
        unread_only=request.GET.get("unread") == "1",
    )
    return Response({
        "items": [services.row(n) for n in rows],
        "unread": services.unread_count(request.user.pk),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def read(request):
    serializer = MarkReadInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    moved = services.mark_read(request.user.pk, serializer.validated_data.get("ids"))
    return Response({"marked": moved, "unread": services.unread_count(request.user.pk)})
