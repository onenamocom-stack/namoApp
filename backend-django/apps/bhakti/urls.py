from django.urls import path

from . import views

urlpatterns = [
    path("assets/", views.assets, name="bhakti-assets"),
    path("assets/<uuid:asset_id>/file/", views.asset_file, name="bhakti-asset-file"),
    path("darshan/", views.darshan, name="bhakti-darshan"),
    path("darshan/<uuid:image_id>/live/", views.darshan_live, name="bhakti-darshan-live"),
    path("assets/<uuid:asset_id>/comments/", views.comments, name="bhakti-comments"),
    path("comments/<uuid:comment_id>/remove/", views.remove_comment, name="bhakti-comment-remove"),
    path("reposts/", views.reposts, name="bhakti-reposts"),
    path("commented/", views.commented, name="bhakti-commented"),
    # The japa and sadhana streak (14 Oct 2026, Phase 15c).
    path("streak/", views.my_streak, name="bhakti-streak"),
    path("streak/<uuid:profile_id>/", views.streak_of, name="bhakti-streak-of"),
]
