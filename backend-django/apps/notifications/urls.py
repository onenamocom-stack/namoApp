from django.urls import path

from . import views

urlpatterns = [
    path("", views.feed, name="notifications-feed"),
    path("read/", views.read, name="notifications-read"),
    path("push/key/", views.push_key, name="notifications-push-key"),
    path("push/subscribe/", views.push_subscribe, name="notifications-push-subscribe"),
    path("push/unsubscribe/", views.push_unsubscribe, name="notifications-push-unsubscribe"),
]
