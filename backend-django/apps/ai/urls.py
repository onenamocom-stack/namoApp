from django.urls import path

from . import views

urlpatterns = [
    path("", views.state, name="ai-state"),
    path("ask/", views.ask, name="ai-ask"),
    path("session/", views.start, name="ai-session-start"),
    path("session/<uuid:session_id>/heartbeat/", views.heartbeat, name="ai-heartbeat"),
    path("session/<uuid:session_id>/end/", views.end, name="ai-session-end"),
]
