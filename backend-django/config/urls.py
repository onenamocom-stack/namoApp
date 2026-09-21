from django.urls import include, path

from apps.shop.urls import academy_urls, admin_urls, shop_urls

urlpatterns = [
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
    path("v1/shop/", include(shop_urls)),
    path("v1/academy/", include(academy_urls)),
    path("v1/admin/", include(admin_urls)),
]
