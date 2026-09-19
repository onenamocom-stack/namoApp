"""Reaction services — the rules of backend/schema/020_content_reviews.sql's
`reactions_own` RLS policy and the 020/025 count views, re-expressed in code.

Policy parity (docs/05-BACKEND-SCHEMA.md §5.1 and §7):
  insert/delete: authenticated, actor_id = caller — the server sets the
    actor; the client never sends an identity (rule 3).
  select rows: own rows only — who follows whom is nobody's business.
  select counts: public — the count views are granted to anon, and they
    expose aggregates, never actor ids.

Counts are queries, not columns (docs/05 §1.3): there is no denormalized
counter to drift, so a COUNT(*) group-by is exact by construction — the
same invariant the 020 check's "Counts are queries" section protects.
"""

from django.db import IntegrityError, transaction
from django.db.models import Count
from rest_framework.exceptions import PermissionDenied

from .models import Reaction


def add_reaction(actor_id, target_type, target_id, kind):
    """Insert one reaction, or confirm the identical one already exists.

    The unique (actor_id, target_type, target_id, kind) constraint is the
    idempotency backstop: a racing double-react loses the constraint race
    and reads the winner instead — one row, one truth, no read-before-write.
    Returns (reaction, created).
    """
    with transaction.atomic():
        try:
            with transaction.atomic():  # savepoint: the losing race only rolls back the insert
                reaction = Reaction.objects.create(
                    actor_id=actor_id,
                    target_type=target_type,
                    target_id=target_id,
                    kind=kind,
                )
        except IntegrityError:
            reaction = Reaction.objects.get(
                actor_id=actor_id, target_type=target_type, target_id=target_id, kind=kind
            )
            return reaction, False
    return reaction, True


def remove_reaction(actor_id, target_type, target_id, kind):
    """Delete the caller's own reaction.

    Own-row scoping is the policy: a delete that matches nothing is the
    desired state already being true (toggling off twice must not error —
    that is how the client's optimistic Set rolls back). But a row that
    exists for THIS target under somebody else's actor is a real refusal:
    deleting it would be muting someone else's voice, so 403.
    Returns True when a row was deleted.
    """
    with transaction.atomic():
        deleted, _ = Reaction.objects.filter(
            actor_id=actor_id, target_type=target_type, target_id=target_id, kind=kind
        ).delete()
        if deleted:
            return True
        if Reaction.objects.filter(
            target_type=target_type, target_id=target_id, kind=kind
        ).exists():
            raise PermissionDenied("That reaction belongs to somebody else.")
        return False


def counts_for(target_type, target_id):
    """Per-kind counts for one target — the query behind 020's content_public
    like/save counts and the follower-count views, raw. Module 5 layers the
    approval gates on top; here there is nothing to gate (rule: no enum soup,
    and the rows are already exact)."""
    rows = (
        Reaction.objects.filter(target_type=target_type, target_id=target_id)
        .values("kind")
        .annotate(n=Count("id"))
    )
    return {row["kind"]: row["n"] for row in rows}
