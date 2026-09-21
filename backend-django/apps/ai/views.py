"""Namo AI's endpoints.

  GET  /v1/ai/            -> the transcript, the quota and any live session
  POST /v1/ai/ask/        -> one question; the answer, or a refusal
  POST /v1/ai/session/    -> start the meter
  POST /v1/ai/session/<id>/heartbeat/  -> seconds_left, for the clock
  POST /v1/ai/session/<id>/end/        -> settle

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

from . import services


class AskInput(serializers.Serializer):
    """The question, and nothing else. No model name, no temperature, no
    system prompt — rule 3: the client never sends what it benefits from
    changing, and every one of those is a way to spend our quota or to
    talk the astrologer out of being an astrologer."""

    question = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)


def _state(profile_id):
    quota = services.quota_state(profile_id)
    session = services.live_session(profile_id)
    return {
        "free_left": quota["free_left"],
        "free_kind": quota["kind"],
        "rate_paise": services._rate_paise(),
        "session": (
            {
                "id": str(session.id),
                "started_at": session.started_at.isoformat(),
                "expires_at": session.expires_at.isoformat(),
                "rate_paise": session.rate_paise,
            }
            if session
            else None
        ),
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
    result = services.ask(request.user.id, form.validated_data["question"])
    # 200 on a refusal, deliberately: a refusal is an answer the interface
    # shows, not a transport failure, and byte-parity with the rest of the
    # API means the client's one error path stays the network one.
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start(request):
    return Response(services.start_session(request.user.id))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def heartbeat(request, session_id):
    return Response(services.heartbeat(request.user.id, session_id))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end(request, session_id):
    return Response(services.end_session(request.user.id, session_id))
