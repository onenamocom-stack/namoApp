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


class PushInput(serializers.Serializer):
    endpoint = serializers.URLField(max_length=1000)
    keys = serializers.DictField(child=serializers.CharField(max_length=300))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def push_key(request):
    """The public VAPID key the phone subscribes with. Public by design;
    served rather than built in so no build secret is needed."""
    from django.conf import settings

    return Response({"key": settings.VAPID_PUBLIC_KEY or None})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_subscribe(request):
    """This phone may now be woken for the caller (their own, always)."""
    from . import push

    form = PushInput(data=request.data)
    form.is_valid(raise_exception=True)
    keys = form.validated_data["keys"]
    if not keys.get("p256dh") or not keys.get("auth"):
        return Response({"ok": False, "reason": "Missing keys."}, status=400)
    push.subscribe(request.user.pk, form.validated_data["endpoint"], keys["p256dh"], keys["auth"],
                   request.headers.get("user-agent", ""))
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_unsubscribe(request):
    from . import push

    endpoint = (request.data or {}).get("endpoint", "")
    return Response({"ok": True, "removed": push.unsubscribe(request.user.pk, endpoint)})
