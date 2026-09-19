from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Reaction
from .services import add_reaction, counts_for, remove_reaction


class ReactionInput(serializers.Serializer):
    """What the client sends — exactly the three columns the 020 grant names
    (insert (actor_id, target_type, target_id, kind) minus actor_id, which
    the server fills from the verified JWT: rule 3, the client never sends
    an identity)."""

    target_type = serializers.ChoiceField(choices=Reaction.TargetType.choices)
    target_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=Reaction.Kind.choices)


class CountsQuery(serializers.Serializer):
    target_type = serializers.ChoiceField(choices=Reaction.TargetType.choices)
    target_id = serializers.UUIDField()


def _row(reaction):
    return {
        "kind": reaction.kind,
        "target_type": reaction.target_type,
        "target_id": str(reaction.target_id),
    }


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def reactions(request):
    """The `reactions_own` policy as an endpoint.

    GET: the caller's own rows — what fetchMine reads; scoped server-side
    to actor_id = caller, so who-follows-whom never leaves the table.
    POST: one reaction on. Doubling on is the same row (unique constraint),
    answered with created=false and 200 rather than an error — the desired
    state is already true.
    DELETE: one reaction off, owner-scoped. Off-when-already-off is a 200
    no-op (the optimistic client's rollback path); somebody else's row is
    a 403. Mutating calls ride the Idempotency-Key middleware when the
    client sends one.
    """
    if request.method == "GET":
        rows = Reaction.objects.filter(actor_id=request.user.pk).order_by("created_at", "id")
        return Response([_row(r) for r in rows])

    serializer = ReactionInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if request.method == "POST":
        reaction, created = add_reaction(
            request.user.pk, data["target_type"], data["target_id"], data["kind"]
        )
        return Response({"created": created, **_row(reaction)}, status=201 if created else 200)

    deleted = remove_reaction(
        request.user.pk, data["target_type"], data["target_id"], data["kind"]
    )
    return Response({"deleted": deleted})


@api_view(["GET"])
@permission_classes([AllowAny])
def counts(request):
    """Public aggregates for one target — the grant the 020/025 count views
    carry (anon + authenticated). The body exposes counts per kind and never
    an actor id: reading who reacted stays behind authentication."""
    serializer = CountsQuery(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    return Response(
        {
            "target_type": data["target_type"],
            "target_id": str(data["target_id"]),
            "counts": counts_for(data["target_type"], data["target_id"]),
        }
    )
