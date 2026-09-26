from django.urls import path

from . import views

urlpatterns = [
    path("sessions/<uuid:session_id>/join/", views.join, name="video-join"),
]
