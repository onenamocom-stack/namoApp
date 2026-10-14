from django.urls import path

from . import views

urlpatterns = [
    path("", views.groups, name="groups"),
    path("<uuid:group_id>/", views.group, name="group"),
    path("<uuid:group_id>/join/", views.join, name="group-join"),
    path("<uuid:group_id>/leave/", views.leave, name="group-leave"),
    path("<uuid:group_id>/members/", views.members, name="group-members"),
    path("<uuid:group_id>/members/remove/", views.remove_member, name="group-member-remove"),
    path("<uuid:group_id>/members/admin/", views.make_admin, name="group-member-admin"),
    path("<uuid:group_id>/posts/", views.posts, name="group-posts"),
    path("<uuid:group_id>/posts/remove/", views.remove_post, name="group-post-remove"),
]
