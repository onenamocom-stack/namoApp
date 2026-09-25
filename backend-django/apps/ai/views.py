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

from apps.astro.serializers import SubjectInput, subject_birth

from . import services


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
        # A referral boost, open or coming. Both are needed: the number
        # explains why there are three today, and the date explains why
        # there are still only one — a reward that changes nothing
        # visible on the day it is earned reads as a reward that failed.
        "daily_allowance": quota.get("daily_allowance"),
        "boosted": quota.get("boosted", False),
        "boost_from": quota.get("boost_from"),
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
        subject = subject_birth(subject)
    result = services.ask(request.user.id, form.validated_data["question"], subject=subject)
    # 200 on a refusal, deliberately: a refusal is an answer the interface
    # shows, not a transport failure, and byte-parity with the rest of the
    # API means the client's one error path stays the network one.
    return Response(result)



class TarotInput(serializers.Serializer):
    """A deck and a question. **No card**: the server draws it
    (apps/ai/tarot_decks.py), because a client that picks its own card can
    pull until it likes the answer, and because the pull is charged.

    The question is required and capped. This deck answers a question, and
    200 characters is a question — past that it is a letter, and the model
    is being paid by the token to read it.
    """

    deck = serializers.CharField(max_length=32, trim_whitespace=True)
    question = serializers.CharField(
        max_length=200, allow_blank=False, trim_whitespace=True
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tarot_state(request):
    """Free pulls left this week and what a paid one costs — read by the
    screen before anything is drawn, so it can say which it is about to
    spend."""
    return Response({"ok": True, **services.tarot_state(request.user.id)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def tarot(request):
    form = TarotInput(data=request.data)
    form.is_valid(raise_exception=True)
    result = services.tarot_pull(
        request.user.id,
        form.validated_data["deck"],
        form.validated_data["question"],
    )
    # 200 on a refusal, as `ask` does and for the same reason.
    return Response(result)
