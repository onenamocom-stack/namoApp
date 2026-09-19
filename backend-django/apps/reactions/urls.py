from django.urls import path

from . import views

urlpatterns = [
    path("", views.reactions, name="reactions"),
    path("counts/", views.counts, name="reaction-counts"),
]
