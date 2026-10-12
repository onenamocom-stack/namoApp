"""The bhakti endpoints — src/lib/bhakti.js's read path as REST.

One endpoint, because the lib has one: fetchAssets. The response is a bare
JSON array (like the reactions list) of the fields toAsset consumes —
snake_case, exactly as PostgREST returned them. The client keeps the
BASE_URL prefixing for site-relative media paths and the paise-to-rupees
boundary, so nothing of the deploy shape leaks into the API.

Access parity with the `bhakti_assets_public_read` policy (024): anonymous
GET is correct — a session requirement would only stop the marketing
screenshot. There are deliberately no write endpoints: 024 grants no
insert/update/delete policy, and the absence of the policy IS the rule.
"""

from rest_framework.decorators import api_view, permission_classes
from django.conf import settings
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.views import refusal_body

from .models import BhaktiAsset, DarshanDeity
from . import services
from .services import list_assets


def _row(asset):
    return {
        "id": str(asset.id),
        "kind": asset.kind,
        "title": asset.title,
        "deity": asset.deity,
        # A PRICED row's file is a key in the private bucket, not a URL, and
        # it never leaves the server: the buyer gets a ten-minute link from
        # `asset_file` below (30 Sep 2026, the first paid e-book).
        "media_url": None if asset.price_paise else asset.media_url,
        "preview_url": asset.preview_url,
        "price_paise": asset.price_paise,
        "artist": asset.artist,
        "licence": asset.licence,
        "source": asset.source,
        # 12 Oct 2026: the Status shelf's heart and comment counts.
        "likes": getattr(asset, "like_count", 0),
        "comments": getattr(asset, "comment_count", 0),
        "reposts": getattr(asset, "repost_count", 0),
    }


@api_view(["GET"])
@permission_classes([AllowAny])  # the public_read policy: anon may read active rows
def assets(request):
    """Everything active, newest curation order first — fetchAssets."""
    return Response([_row(a) for a in list_assets()])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def asset_file(request, asset_id):
    """The file for one catalogue row. Free rows answer their public URL;
    a priced row answers a ten-minute link into the private bucket to
    somebody who bought it, and 402 with the price to anybody else."""
    from apps.media.providers import get_provider
    from apps.wallet import services as wallet

    asset = BhaktiAsset.objects.filter(pk=asset_id, active=True).first()
    if asset is None:
        return Response(refusal_body("not_found", "That is not in the library."), status=404)
    if not asset.price_paise:
        return Response({"ok": True, "url": asset.media_url})
    if not wallet.owns(request.user.pk, asset.kind, str(asset.id)):
        return Response(
            refusal_body("needs_purchase", "Buy this book to read it.", sku=asset.kind,
                         ref=str(asset.id), price_paise=asset.price_paise),
            status=402,
        )
    url = get_provider().presign_get(asset.media_url, settings.R2_PRIVATE_BUCKET, seconds=600)
    return Response({"ok": True, "url": url})


@api_view(["GET"])
@permission_classes([AllowAny])  # the darshan page shows to anybody
def darshan(request):
    """The darshan page's deities and their murtis, as the console has them
    (8 Oct 2026). Active deities with at least one active murti, in order."""
    out = []
    deities = DarshanDeity.objects.filter(active=True).prefetch_related("images").order_by("sort", "name")
    for d in deities:
        images = [
            {
                "id": str(i.id),
                "image_url": i.image_url,
                "temple": i.temple,
                "temple_hi": i.temple_hi,
                "location": i.location,
                "location_hi": i.location_hi,
                "title": i.title,
                "credit": i.credit,
            }
            for i in sorted(d.images.all(), key=lambda i: i.sort)
            if i.active
        ]
        if images:
            out.append({"id": str(d.id), "name": d.name, "name_hi": d.name_hi, "images": images})
    return Response(out)


def _comment_row(c):
    """The shape of a post's comment (apps/content/views.py), so one sheet
    in the app draws both."""
    return {
        "id": str(c.id),
        "author_id": str(c.author_id),
        "author_name": c.author_name,
        "body": c.body,
        "created_at": c.created_at,
    }


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def comments(request, asset_id):
    """GET: a picture's live comments, oldest first, anonymous. POST: comment
    as the caller; signed in, not blocked (12 Oct 2026)."""
    if request.method == "GET":
        return Response([_comment_row(c) for c in services.list_comments(asset_id)])
    if not request.user or not request.user.is_authenticated:
        return Response(refusal_body("unauthenticated", "Sign in to comment."), status=401)
    body = request.data.get("body") if hasattr(request.data, "get") else None
    row = services.add_comment(asset_id, request.user.pk, body if isinstance(body, str) else "")
    return Response(_comment_row(row), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_comment(request, comment_id):
    services.remove_comment(comment_id, request.user.pk, getattr(request.user, "role", ""))
    return Response({"removed": True})


@api_view(["GET"])
@permission_classes([AllowAny])
def reposts(request):
    """Reshared pictures, newest first; `by` narrows to one person. Public,
    like a post's reshares (12 Oct 2026)."""
    import uuid

    by = request.query_params.get("by") or None
    try:
        by = uuid.UUID(by) if by else None
        limit = max(1, min(int(request.query_params.get("limit", 50)), 100))
    except ValueError:
        return Response(refusal_body("invalid", "Bad query."), status=400)
    return Response([
        {
            "reposted_by": str(event.actor_id),
            "reposted_by_name": event.actor_name,
            "reposted_at": event.created_at,
            "asset": _row(asset),
        }
        for event, asset in services.list_reposts(by=by, limit=limit)
    ])
