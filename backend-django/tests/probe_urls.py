"""Probe views for the permission matrix — mounted only in tests via
override_settings(ROOT_URLCONF="tests.probe_urls"). Production urls never
carry these routes."""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core import permissions as perms


@api_view(["GET"])
@permission_classes([perms.IsSeeker])
def seeker_probe(request):
    return Response({"ok": True, "probe": "seeker"})


@api_view(["GET"])
@permission_classes([perms.IsConsultant])
def consultant_probe(request):
    return Response({"ok": True, "probe": "consulter"})


@api_view(["GET"])
@permission_classes([perms.IsAdmin])
def admin_probe(request):
    return Response({"ok": True, "probe": "admin"})


urlpatterns = [
    # paths resolved directly against ROOT_URLCONF; no prefix needed
]

from django.urls import path  # noqa: E402

urlpatterns = [
    path("probe/seeker/", seeker_probe, name="probe-seeker"),
    path("probe/consultant/", consultant_probe, name="probe-consultant"),
    path("probe/admin/", admin_probe, name="probe-admin"),
]
