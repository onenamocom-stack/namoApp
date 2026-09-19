from django.urls import include, path

urlpatterns = [
    path("v1/", include("apps.core.urls")),
    path("v1/media/", include("apps.media.urls")),
]
