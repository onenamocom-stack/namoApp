from django.urls import path

from . import views

urlpatterns = [
    path("sessions/request/", views.request, name="chat-request"),
    path("sessions/", views.my_sessions, name="chat-sessions"),
    path("sessions/<uuid:session_id>/accept/", views.accept, name="chat-accept"),
    path("sessions/<uuid:session_id>/end/", views.end, name="chat-end"),
    path("sessions/<uuid:session_id>/cancel/", views.cancel, name="chat-cancel"),
    path("sessions/<uuid:session_id>/heartbeat/", views.heartbeat, name="chat-heartbeat"),
    path("threads/", views.my_threads, name="chat-threads"),
    path("threads/<uuid:thread_id>/messages/", views.messages, name="chat-messages"),
    path("threads/<uuid:thread_id>/messages/send/", views.send, name="chat-send"),
    path("threads/<uuid:thread_id>/read/", views.read, name="chat-read"),
]
