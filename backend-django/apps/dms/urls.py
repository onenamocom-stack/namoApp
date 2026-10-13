from django.urls import path

from . import views

urlpatterns = [
    path("threads/", views.threads, name="dms-threads"),
    path("start/", views.start, name="dms-start"),
    path("block/", views.block, name="dms-block"),
    path("threads/<uuid:thread_id>/messages/", views.messages, name="dms-messages"),
    path("threads/<uuid:thread_id>/send/", views.send, name="dms-send"),
    path("threads/<uuid:thread_id>/read/", views.read, name="dms-read"),
    path("threads/<uuid:thread_id>/accept/", views.accept, name="dms-accept"),
    path("threads/<uuid:thread_id>/decline/", views.decline, name="dms-decline"),
]
