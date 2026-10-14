"""Groups over HTTP, `/v1/groups/` (Phase 15c). All signed in."""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from . import services
from .models import GroupKind
from .services import Refused


def _refused(err):
    return Response(refusal_body("refused", err.message), status=err.status)


class GroupInput(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    kind = serializers.ChoiceField(choices=GroupKind.choices, required=False, default="other")
    city = serializers.CharField(required=False, allow_blank=True, default="")
    about = serializers.CharField(required=False, allow_blank=True, default="")
    avatar_url = serializers.CharField(required=False, allow_blank=True, default="")


class EditInput(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=False)
    kind = serializers.ChoiceField(choices=GroupKind.choices, required=False)
    city = serializers.CharField(required=False, allow_blank=True)
    about = serializers.CharField(required=False, allow_blank=True)
    avatar_url = serializers.CharField(required=False, allow_blank=True)


class PersonInput(serializers.Serializer):
    profile_id = serializers.UUIDField()


class PostInput(serializers.Serializer):
    content_id = serializers.UUIDField()


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def groups(request):
    """GET: yours (`?mine=1`) or found (`?q=`). POST: make one; you are its
    admin."""
    me = request.user.pk
    if request.method == "POST":
        data = GroupInput(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            group = services.create(me, **data.validated_data)
        except Refused as err:
            return _refused(err)
        return Response(services.row(services.detail(group.id), me), status=201)
    if request.query_params.get("mine"):
        rows = services.mine(me)
    else:
        rows = services.search(request.query_params.get("q", ""))
    return Response({"items": [services.row(g, me) for g in rows]})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def group(request, group_id):
    me = request.user.pk
    try:
        if request.method == "PATCH":
            data = EditInput(data=request.data, partial=True)
            data.is_valid(raise_exception=True)
            services.update(group_id, me, **data.validated_data)
        return Response(services.row(services.detail(group_id), me))
    except Refused as err:
        return _refused(err)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def join(request, group_id):
    try:
        services.join(group_id, request.user.pk)
        return Response(services.row(services.detail(group_id), request.user.pk))
    except Refused as err:
        return _refused(err)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def leave(request, group_id):
    try:
        services.leave(group_id, request.user.pk)
        return Response(services.row(services.detail(group_id), request.user.pk))
    except Refused as err:
        return _refused(err)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def members(request, group_id):
    try:
        services.detail(group_id)
    except Refused as err:
        return _refused(err)
    return Response({"items": services.members(group_id)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_member(request, group_id):
    data = PersonInput(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        services.remove_member(group_id, request.user.pk, data.validated_data["profile_id"])
    except Refused as err:
        return _refused(err)
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def make_admin(request, group_id):
    data = PersonInput(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        services.make_admin(group_id, request.user.pk, data.validated_data["profile_id"])
    except Refused as err:
        return _refused(err)
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def posts(request, group_id):
    """The group's page: its posts, newest first, keyset-paginated."""
    from apps.content import services as content_services
    from apps.content.views import _public_row

    try:
        services.detail(group_id)
    except Refused as err:
        return _refused(err)
    qs = content_services.public_content().filter(group_id=group_id)
    rows, next_after = content_services._public_page(
        qs, after_id=request.query_params.get("after") or None, limit=40,
    )
    rows = content_services.attach_products(rows)
    return Response({"results": [_public_row(r) for r in rows], "next_after": next_after})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_post(request, group_id):
    data = PostInput(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        services.remove_post(group_id, request.user.pk, data.validated_data["content_id"])
    except Refused as err:
        return _refused(err)
    return Response({"ok": True})
