from django.urls import path

from . import views

urlpatterns = [
    path("", views.feed, name="notifications-feed"),
    path("read/", views.read, name="notifications-read"),
]
