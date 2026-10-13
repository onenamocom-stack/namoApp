from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from . import services
from .services import Refused


def _refused(err):
    return Response(refusal_body("refused", err.message), status=err.status)


class StartInput(serializers.Serializer):
    to = serializers.UUIDField()


class SendInput(serializers.Serializer):
    body = serializers.CharField(allow_blank=True, trim_whitespace=False)


class PersonInput(serializers.Serializer):
    profile_id = serializers.UUIDField()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def threads(request):
    """Your conversations: `?box=inbox` (default) or `?box=requests`."""
    me = request.user.pk
    which = "requests" if request.query_params.get("box") == "requests" else "inbox"
    rows = [services.row(t, me) for t in services.box(me, which)]
    return Response({
        "items": rows,
        "requests": len(services.box(me, "requests")) if which == "inbox" else len(rows),
        "unread": services.unread_total(me),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start(request):
    data = StartInput(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        thread = services.start(request.user.pk, data.validated_data["to"])
    except Refused as err:
        return _refused(err)
    return Response(services.row(thread, request.user.pk))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def messages(request, thread_id):
    try:
        thread, rows = services.messages(request.user.pk, thread_id, after=request.query_params.get("after"))
    except Refused as err:
        return _refused(err)
    return Response({
        "thread": services.row(thread, request.user.pk),
        "items": [services.message_row(m) for m in rows],
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send(request, thread_id):
    data = SendInput(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        message = services.send(request.user.pk, thread_id, data.validated_data["body"])
    except Refused as err:
        return _refused(err)
    return Response(services.message_row(message), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def read(request, thread_id):
    try:
        services.mark_read(request.user.pk, thread_id)
    except Refused as err:
        return _refused(err)
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept(request, thread_id):
    try:
        thread = services.accept(request.user.pk, thread_id)
    except Refused as err:
        return _refused(err)
    return Response(services.row(thread, request.user.pk))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decline(request, thread_id):
    try:
        thread = services.decline(request.user.pk, thread_id)
    except Refused as err:
        return _refused(err)
    return Response(services.row(thread, request.user.pk))


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def block(request):
    data = PersonInput(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        if request.method == "DELETE":
            services.unblock(request.user.pk, data.validated_data["profile_id"])
        else:
            services.block(request.user.pk, data.validated_data["profile_id"])
    except Refused as err:
        return _refused(err)
    return Response({"ok": True, "blocked": request.method == "POST"})
