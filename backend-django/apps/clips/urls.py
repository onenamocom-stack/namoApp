from django.urls import path

from . import views

urlpatterns = [
    path("init/", views.init, name="videos-init"),
    path("<uuid:video_id>/", views.detail, name="videos-detail"),
    path("<uuid:video_id>/parts/", views.parts, name="videos-parts"),
    path("<uuid:video_id>/complete/", views.complete, name="videos-complete"),
]
