from django.urls import path

from . import views

urlpatterns = [
    path("assets/", views.assets, name="bhakti-assets"),
    path("assets/<uuid:asset_id>/file/", views.asset_file, name="bhakti-asset-file"),
]
