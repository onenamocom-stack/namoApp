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
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .services import list_assets


def _row(asset):
    return {
        "id": str(asset.id),
        "kind": asset.kind,
        "title": asset.title,
        "deity": asset.deity,
        "media_url": asset.media_url,
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
