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

from .models import BhaktiAsset
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
