from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.me, name="profiles-me"),
    path("me/avatar/", views.avatar, name="profiles-avatar"),
    path("<uuid:profile_id>/", views.public, name="profiles-public"),
]
