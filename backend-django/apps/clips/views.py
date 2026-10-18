"""`/v1/videos/` — the upload API of the video pipeline (17 Oct 2026), for
the web app and the Android app. Every call is the signed-in person's own;
refusals are {ok: false, reason, message}."""

import hmac
import json

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from apps.core.views import refusal_body

from . import services


class InitThrottle(UserRateThrottle):
    """The presign endpoint, rate-limited against abuse (spec guardrails):
    the daily limit counts videos; this counts attempts."""

    rate = "30/hour"
    scope = "videos_init"


class InitInput(serializers.Serializer):
    sha256 = serializers.CharField(max_length=64)
    size_bytes = serializers.IntegerField(min_value=1)
    duration_s = serializers.FloatField(min_value=0)
    mime = serializers.CharField(max_length=64, required=False, default="video/mp4")
    # True when the phone could not compress and sends the original.
    original = serializers.BooleanField(required=False, default=False)
    category = serializers.CharField(max_length=24, required=False, default="content")


class CompleteInput(serializers.Serializer):
    parts = serializers.ListField(child=serializers.DictField(), required=False, default=list)


def _refused(err):
    return Response(refusal_body(err.reason, err.message), status=err.status)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([InitThrottle])
def init(request):
    form = InitInput(data=request.data)
    form.is_valid(raise_exception=True)
    try:
        return Response({"ok": True, **services.init(request.user.pk, **form.validated_data)}, status=201)
    except services.Refused as err:
        return _refused(err)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def detail(request, video_id):
    try:
        return Response({"ok": True, **services.state(request.user.pk, video_id)})
    except services.Refused as err:
        return _refused(err)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def parts(request, video_id):
    try:
        return Response({"ok": True, **services.parts(request.user.pk, video_id)})
    except services.Refused as err:
        return _refused(err)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete(request, video_id):
    form = CompleteInput(data=request.data)
    form.is_valid(raise_exception=True)
    sent = {}
    for row in form.validated_data["parts"]:
        try:
            sent[int(row.get("part_number"))] = str(row.get("etag") or "")
        except (TypeError, ValueError):
            continue
    try:
        return Response({"ok": True, **services.complete(request.user.pk, video_id, sent)})
    except services.Refused as err:
        return _refused(err)


@csrf_exempt
@require_POST
def worker_done(request):
    """The worker's answer (namo-video). The shared token is the credential;
    without VIDEO_WORKER_TOKEN set nothing is accepted."""
    expected = settings.VIDEO_WORKER_TOKEN
    given = request.headers.get("x-worker-token", "")
    if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
        return JsonResponse({"ok": False}, status=401)
    try:
        body = json.loads(request.body or b"{}")
    except ValueError:
        return JsonResponse({"ok": False}, status=400)
    if not isinstance(body, dict):
        return JsonResponse({"ok": False}, status=400)
    return JsonResponse({"ok": True, "changed": services.worker_done(body)})
