from django.urls import path

from . import views

urlpatterns = [
    path("presign/", views.presign, name="media-presign"),
    path("<uuid:asset_id>/", views.asset_detail, name="media-detail"),
]
