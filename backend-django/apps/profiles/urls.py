from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.me, name="profiles-me"),
    path("me/avatar/", views.avatar, name="profiles-avatar"),
    path("me/username/", views.my_username, name="profiles-my-username"),
    path("username/check/", views.username_check, name="profiles-username-check"),
    path("by-username/<str:username>/", views.by_username, name="profiles-by-username"),
    path("<uuid:profile_id>/", views.public, name="profiles-public"),
]
