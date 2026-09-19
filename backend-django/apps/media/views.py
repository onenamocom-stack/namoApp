from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from .models import MediaAsset
from .providers import ValidationError, get_provider, make_bucket_key, validate_upload


class MediaAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaAsset
        fields = ["id", "kind", "mime", "size_bytes", "duration_ms", "width", "height", "status", "created_at"]
        read_only_fields = fields


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presign(request):
    """POST /v1/media/presign/ — mint a presigned PUT for a client upload.

    Authenticated, size- and mime-gated, and idempotent per client key (the
    IdempotencyMiddleware handles replays). Creates the row status=processing;
    the client confirms after uploading and the row flips to ready.
    """
    data = request.data or {}
    kind = data.get("kind", "")
    filename = data.get("filename", "")
    size_bytes = data.get("size_bytes")
    mime = data.get("mime", "")
    try:
        validate_upload(kind, filename, size_bytes, mime)
    except ValidationError as exc:
        return Response(refusal_body("invalid", str(exc)), status=400)

    asset = MediaAsset(
        owner=str(request.user.pk),
        kind=kind,
        bucket_key=make_bucket_key(str(request.user.pk), kind, filename),
        mime=mime,
        size_bytes=size_bytes,
        status=MediaAsset.Status.PROCESSING,
    )
    asset.save()
    signed = get_provider().presign_put(asset.bucket_key, mime, size_bytes)
    return Response(
        {
            "asset_id": str(asset.id),
            "upload_url": signed["upload_url"],
            "headers": signed["headers"],
        },
        status=201,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def asset_detail(request, asset_id):
    """GET /v1/media/<id>/ — status poll. Owner-scoped: another user's asset
    is a 404, not a 403, so ids do not leak existence."""
    asset = MediaAsset.objects.filter(pk=asset_id, owner=str(request.user.pk)).first()
    if asset is None:
        return Response(
            refusal_body("not_found", "That upload does not exist."),
            status=404,
        )
    return Response(MediaAssetSerializer(asset).data)
