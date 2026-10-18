"""Two surfaces, and a deployment that never serves both.

`PUBLIC_API_ENABLED` and `ADMIN_ENABLED` come from the environment, so one
image runs as the public API (no console URL exists at all) or as the
console (no /v1 exists at all). Both default on for local work, where one
process is the whole point.

This is what remains of docs/02-TRD.md §7's "separate application" after
the Django cutover removed the threat it was written against. The
separation that still earns its keep is the RUNTIME one: two Cloud Run
services, two URLs, and the console free to sit behind an IP allowlist
without the phone app noticing.
"""

from django.conf import settings
from django.urls import include, path, re_path

from apps.content import share

urlpatterns = []

if settings.PUBLIC_API_ENABLED:
    urlpatterns += [
        path("v1/", include("apps.core.urls")),
        path("v1/media/", include("apps.media.urls")),
        path("v1/reactions/", include("apps.reactions.urls")),
        path("v1/astro/", include("apps.astro.urls")),
        path("v1/bhakti/", include("apps.bhakti.urls")),
        path("v1/content/", include("apps.content.urls")),
        path("v1/consultants/", include("apps.consultants.urls")),
        path("v1/chat/", include("apps.chat.urls")),
        path("v1/wallet/", include("apps.wallet.urls")),
        path("v1/profiles/", include("apps.profiles.urls")),
        path("v1/ai/", include("apps.ai.urls")),
        path("v1/notifications/", include("apps.notifications.urls")),
        path("v1/dms/", include("apps.dms.urls")),
        path("v1/groups/", include("apps.groups.urls")),
        path("v1/referrals/", include("apps.referrals.urls")),
        path("v1/video/", include("apps.video.urls")),
        path("v1/events/", include("apps.analytics.urls")),
        path("v1/shop/", include("apps.shop.urls")),
        path("v1/appearance/", include("apps.appearance.urls")),
        path("v1/market/", include("apps.market.urls")),
        path("v1/videos/", include("apps.clips.urls")),
        # Link previews (apps/content/share.py): Firebase Hosting sends these
        # addresses of 1namo.com here. No trailing slash — they are the app's
        # own addresses, and a redirect would break the shared link.
        re_path(r"^read/(?P<content_id>[0-9a-fA-F-]{36})/?$", share.blog_page, name="share-blog"),
        re_path(r"^reels/(?P<content_id>[0-9a-fA-F-]{36})/?$", share.reel_page, name="share-reel"),
        re_path(r"^shop/p/(?P<key>[^/]+)/?$", share.product_page, name="share-product"),
        re_path(r"^bhakti/s/(?P<asset_id>[0-9a-fA-F-]{36})/?$", share.bhakti_page, name="share-bhakti"),
        re_path(r"^shop/l/(?P<listing_id>[0-9a-fA-F-]{36})/?$", share.listing_page, name="share-listing"),
        re_path(r"^shop/d/(?P<asset_id>[0-9a-fA-F-]{36})/?$", share.download_page, name="share-download"),
        re_path(r"^(?:u|consult)/(?P<profile_id>[0-9a-fA-F-]{36})/?$", share.person_page, name="share-person"),
        re_path(r"^og/(?P<kind>blog|reel|post|listing|product|bhakti|profile|site)/(?P<item_id>[0-9a-fA-F-]{36})\.jpg$", share.og_image, name="share-og"),
        # 1namo.com itself, for the console's Link card (12 Oct 2026).
        path("", share.home_page, name="share-home"),
        # 1namo.com/<username> (12 Oct 2026). Last, so it can shadow nothing.
        re_path(r"^(?P<username>[A-Za-z0-9.-]{8,30})/?$", share.profile_page, name="share-profile"),
    ]

if settings.ADMIN_ENABLED:
    from apps.console.site import site as console

    urlpatterns += [path(settings.ADMIN_PATH, console.urls)]
