"""Chat endpoints — the /v1/chat surface, call-for-call with src/lib/chat.js
(as rewritten by cutovers/chat.clientlib.js at cutover).

The RPC-shaped endpoints (request/accept/end/heartbeat) return the
service's {ok, ...} dict with HTTP 200 on business outcomes, byte-parity
with how PostgREST served the SQL functions' jsonb: the UI shows res.reason
in the server's own words, and a refusal already carries a structured
reason (INSTRUCTIONS §2 — a 200 with {ok:false, reason} is a refusal, not
a silent success). Auth failures are the DRF envelope's 401; the
table-read endpoints refuse non-participants with 403, the same answer RLS
gave, rather than a silent empty list that would read as "no messages yet"
to someone probing ids (module 6's documented strictness change).

Identity is the JWT's sub everywhere (rule 3/4): sendMessage takes
{threadId, body} — never a sender, never a price.
"""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_403_FORBIDDEN

from apps.core.views import refusal_body

from . import services


class RequestInput(serializers.Serializer):
    """What the client sends — {consultantId, serviceId} and NO RATE (rule
    3): the request freezes the band price on this side of the wire."""

    consultant_id = serializers.UUIDField()
    service_id = serializers.UUIDField()


class SendInput(serializers.Serializer):
    """{threadId, body}. The sender is the JWT's sub, never the body (rule
    3); the live-session gate, not the client, decides if the write is
    allowed."""

    body = serializers.CharField()


class MessagesQuery(serializers.Serializer):
    """Keyset paging (docs/07 §3.1): `after` is the id of the last message
    the caller saw; the page is every row strictly after its (created_at,
    id) pair. No `after` returns the transcript from the start, oldest
    first — exactly what listMessages() has always returned."""

    after = serializers.UUIDField(required=False, default=None)
    limit = serializers.IntegerField(required=False, default=500, min_value=1,
                                     max_value=1000)


# ── the session RPCs (014), one endpoint per function ────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def request(request):
    """Ask for a chat. Costs nothing — the meter starts when the consultant
    joins. Asking twice is the same ask (018 fix 2's index)."""
    serializer = RequestInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    return Response(
        services.request_chat(
            request.user.pk, data["consultant_id"], data["service_id"]
        )
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept(request, session_id):
    """The consultant's join: the hold and the clock, in one transaction."""
    return Response(services.accept_chat(request.user.pk, session_id))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end(request, session_id):
    """Either party may end it. Idempotent — both sides pressing End is
    normal and settles once."""
    return Response(services.end_session(request.user.pk, session_id))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def heartbeat(request, session_id):
    """Says "still here" and asks how long is left. A failed request is not
    an ended session: the {ok:false} answer distinguishes "the server says
    it is over" from "I could not ask" the same way the current lib's
    `unreachable` flag does — network failure never masquerades as a
    settled session."""
    return Response(services.heartbeat(request.user.pk, session_id))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_sessions(request):
    """My sessions, either side, newest first — the consultant's queue and
    the seeker's history in one read, scoped by the caller's own id."""
    return Response(services.list_sessions(request.user.pk))


# ── threads and messages (014's read side; 016's preview) ────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_threads(request):
    """The thread list through the threads_view shape — the other party's
    name, unread count, live session id."""
    return Response(services.list_threads(request.user.pk))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def messages(request, thread_id):
    """The transcript, participant-only, keyset-paged (see MessagesQuery)."""
    query = MessagesQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    rows = services.list_messages(
        request.user.pk,
        thread_id,
        after=query.validated_data["after"],
        limit=query.validated_data["limit"],
    )
    if rows is None:
        return Response(
            refusal_body("forbidden", services.REFUSAL_NOT_PARTICIPANT),
            status=HTTP_403_FORBIDDEN,
        )
    return Response(rows)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send(request, thread_id):
    """The one direct client write in v1, bounded by the live-session gate.
    Returns the inserted row so the sender renders it immediately; the
    refusal reason is the server's own sentence."""
    serializer = SendInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(
        services.send_message(request.user.pk, thread_id, serializer.validated_data["body"])
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def read(request, thread_id):
    """Mark the other party's messages read. Own side untouched (the unread
    badge clears for the opener only)."""
    result = services.mark_read(request.user.pk, thread_id)
    if result is None:
        return Response(
            refusal_body("forbidden", services.REFUSAL_NOT_PARTICIPANT),
            status=HTTP_403_FORBIDDEN,
        )
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel(request, session_id):
    """The seeker withdrawing a request nobody has answered."""
    return Response(services.cancel_request(request.user.pk, session_id))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decline(request, session_id):
    """The consultant turning down a call nobody has paid for yet."""
    return Response(services.decline_request(request.user.pk, session_id))
