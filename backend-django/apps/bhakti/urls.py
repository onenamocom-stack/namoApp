from django.urls import path

from . import views

urlpatterns = [
    path("assets/", views.assets, name="bhakti-assets"),
    path("assets/<uuid:asset_id>/file/", views.asset_file, name="bhakti-asset-file"),
    path("darshan/", views.darshan, name="bhakti-darshan"),
    path("assets/<uuid:asset_id>/comments/", views.comments, name="bhakti-comments"),
    path("comments/<uuid:comment_id>/remove/", views.remove_comment, name="bhakti-comment-remove"),
    path("reposts/", views.reposts, name="bhakti-reposts"),
    path("commented/", views.commented, name="bhakti-commented"),
]
