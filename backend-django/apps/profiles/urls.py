from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.me, name="profiles-me"),
    path("me/avatar/", views.avatar, name="profiles-avatar"),
    path("me/delete/", views.delete_me, name="profiles-delete-me"),
    path("me/username/", views.my_username, name="profiles-my-username"),
    path("me/modules/", views.my_modules, name="profiles-my-modules"),
    path("me/modules/<str:module>/", views.ask_module, name="profiles-ask-module"),
    path("username/check/", views.username_check, name="profiles-username-check"),
    path("search/", views.search, name="profiles-search"),
    path("by-username/<str:username>/", views.by_username, name="profiles-by-username"),
    path("<uuid:profile_id>/", views.public, name="profiles-public"),
]
