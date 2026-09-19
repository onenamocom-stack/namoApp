from django.urls import include, path

urlpatterns = [
    path("v1/", include("apps.core.urls")),
    path("v1/media/", include("apps.media.urls")),
    path("v1/reactions/", include("apps.reactions.urls")),
    path("v1/astro/", include("apps.astro.urls")),
    path("v1/bhakti/", include("apps.bhakti.urls")),
]
