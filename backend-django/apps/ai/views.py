"""Namo AI's endpoints.

  GET  /v1/ai/            -> the transcript, the quota and any live session
  POST /v1/ai/ask/        -> one question; the answer, or a refusal

Every one needs a session (the JWT), because every one of them either costs
money or reads somebody's transcript. There is no anonymous surface here —
unlike bhakti or the feed, a free question is still a question somebody's
account paid for out of its five.

The refusal bodies are {ok:false, reason} with the server's own sentence,
which the panel renders as-is (backend/INSTRUCTIONS.md §2). The client
invents no refusal text of its own.
"""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.fields import CoordinateField

from . import services


class SubjectInput(serializers.Serializer):
    """Somebody else's birth details, typed by the seeker.

    This is the ONE thing the client sends that changes the answer, and it
    is not an exception to rule 3: rule 3 keeps the client from sending
    what it BENEFITS from changing. Nobody gains by lying about their
    mother's birthday — the chart is simply wrong, which the seeker is the
    first to notice.

    Validated here and used once. **Nothing in this serializer is ever
    written to the database.** A third party did not agree to be in it.
    """

    name = serializers.CharField(max_length=80, allow_blank=False, trim_whitespace=True)
    birth_date = serializers.DateField()
    # Null when nobody remembers it — the same distinction profiles makes.
    # Noon is substituted downstream and the houses are unreliable, which
    # is a fact the answer should carry rather than hide.
    birth_time = serializers.TimeField(required=False, allow_null=True)
    birth_time_known = serializers.BooleanField(default=True)
    birth_place = serializers.CharField(max_length=160)
    birth_lat = CoordinateField(90)
    birth_lon = CoordinateField(180)
    birth_zone = serializers.CharField(max_length=64, required=False, allow_blank=True)

    def validate(self, data):
        if data.get("birth_time_known") and not data.get("birth_time"):
            raise serializers.ValidationError(
                {"birth_time": "Give the time, or say it is not known."}
            )
        return data


class AskInput(serializers.Serializer):
    """The question, and optionally whose chart it is about. No model name,
    no temperature, no system prompt — rule 3: the client never sends what
    it benefits from changing, and every one of those is a way to spend our
    quota or to talk the astrologer out of being an astrologer."""

    question = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)
    subject = SubjectInput(required=False, allow_null=True)


def _state(profile_id):
    quota = services.quota_state(profile_id)
    return {
        "free_left": quota["free_left"],
        "free_kind": quota["kind"],
        # What the NEXT question costs once the free ones are gone. The
        # panel shows this before anybody is charged, so nobody is
        # surprised by a debit.
        "price_paise": services._price_paise(),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def state(request):
    """Everything the panel needs to render itself on open: the transcript,
    what is still free, and whether a clock is already running (a tab
    reopened mid-session must find its meter, not start a second one)."""
    profile_id = request.user.id
    body = _state(profile_id)
    body["messages"] = services.transcript(profile_id)
    return Response(body)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ask(request):
    form = AskInput(data=request.data)
    form.is_valid(raise_exception=True)
    subject = form.validated_data.get("subject")
    if subject:
        # str() on the date/time/decimals: astro builds its cache key from a
        # text join, and a date object and its ISO string must not hash to
        # two different charts for one birth.
        subject = {
            "name": subject["name"],
            "birth_date": str(subject["birth_date"]),
            "birth_time": str(subject["birth_time"]) if subject.get("birth_time") else None,
            "birth_time_known": bool(subject.get("birth_time_known")),
            "birth_place": subject["birth_place"],
            "birth_lat": str(subject["birth_lat"]),
            "birth_lon": str(subject["birth_lon"]),
            "birth_zone": subject.get("birth_zone") or "Asia/Kolkata",
        }
    result = services.ask(request.user.id, form.validated_data["question"], subject=subject)
    # 200 on a refusal, deliberately: a refusal is an answer the interface
    # shows, not a transport failure, and byte-parity with the rest of the
    # API means the client's one error path stays the network one.
    return Response(result)


