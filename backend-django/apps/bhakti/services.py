"""Bhakti services — the rules of backend/schema/024_bhakti_assets.sql (as
amended by 026) re-expressed in code.

Policy parity (024's RLS block):
  select: public — anyone may read what is active, signed in or not. There is
    nothing personal in a row, so the endpoint is AllowAny and the query
    itself carries the `active` filter (the policy's `using (active)`).
  insert / update / delete: NO POLICY, deliberately — "the absence of a
    policy IS the rule: only the service role writes here." The Django
    equivalent is that no endpoint accepts a write at all, and the only
    code path that writes is `seed_asset` below, the service-role seed
    script's (backend/seed/bhakti.mjs) replacement. If a client write
    endpoint ever appears here, the thing actually needed is the phase 13
    admin console (02-TRD.md §7 is why it cannot be a flag on a user).

Kind semantics (026): 'ringtone' merged into 'tune' — they were one file
doing one job under two names — and 'status' (WhatsApp status artwork) was
promoted from a composer card into a first-class leading kind. The check
constraint carries the vocabulary; nothing here invents one.
"""

from django.db import IntegrityError, transaction

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from .models import BhaktiAsset, BhaktiComment


def list_assets():
    """Everything active, ordered exactly the way fetchAssets orders the
    Supabase query: kind ascending, then the curated `sort` (024's partial
    index serves precisely this read)."""
    return with_counts(BhaktiAsset.objects.filter(active=True)).order_by("kind", "sort")


def seed_asset(*, legacy_id, kind, title, deity=None, media_url, preview_url=None,
               price_paise=None, artist, licence, source, active=True, sort=0):
    """Insert or update one catalogue row keyed on legacy_id — the write path
    backend/seed/bhakti.mjs uses with the service role (`upsert(rows,
    { onConflict: 'legacy_id' })`). Running the manifest twice updates rather
    than duplicates, which is what makes it safe to re-run after editing a
    title or a licence.

    legacy_id is the idempotency key (024) and the unique constraint is the
    backstop: a racing double-seed loses the constraint race and reads the
    winner instead, then applies its own fields — one row, last write wins,
    no read-before-write.
    Returns (asset, created).
    """
    fields = dict(
        kind=kind, title=title, deity=deity, media_url=media_url,
        preview_url=preview_url, price_paise=price_paise, artist=artist,
        licence=licence, source=source, active=active, sort=sort,
    )
    with transaction.atomic():
        try:
            with transaction.atomic():  # savepoint: the losing race only rolls back the insert
                return BhaktiAsset.objects.create(legacy_id=legacy_id, **fields), True
        except IntegrityError as exc:
            # Only the legacy_id unique key losing a race is recoverable —
            # read the winner and apply our fields over it. Any other
            # constraint refusing the row (bad kind, blank title, a
            # non-positive price) is a bad manifest entry and must fail
            # loudly, exactly as bhakti.mjs's die() does.
            try:
                asset = BhaktiAsset.objects.get(legacy_id=legacy_id)
            except BhaktiAsset.DoesNotExist:
                raise exc
    for name, value in fields.items():
        setattr(asset, name, value)
    asset.save(update_fields=[*fields])
    return asset, False


# ── likes and comments on a picture (12 Oct 2026) ───────────────────────────


def with_counts(qs):
    """Each row's likes and live comments, two subqueries for the page."""
    from django.db.models import Count, IntegerField, OuterRef, Subquery
    from django.db.models.functions import Coalesce

    from apps.reactions.models import Reaction

    def counted(kind):
        return (
            Reaction.objects.filter(kind=kind, target_type=Reaction.TargetType.BHAKTI,
                                    target_id=OuterRef("id"))
            .values("target_id").annotate(n=Count("id")).values("n")
        )

    comments = (
        BhaktiComment.objects.filter(asset_id=OuterRef("id"), status=BhaktiComment.Status.LIVE)
        .values("asset_id").annotate(n=Count("id")).values("n")
    )
    return qs.annotate(
        like_count=Coalesce(Subquery(counted(Reaction.Kind.LIKE), output_field=IntegerField()), 0),
        repost_count=Coalesce(Subquery(counted(Reaction.Kind.REPOST), output_field=IntegerField()), 0),
        comment_count=Coalesce(Subquery(comments, output_field=IntegerField()), 0),
    )


def _named(qs):
    from apps.profiles import services as profile_services

    return qs.annotate(author_name=profile_services.name_subquery("author_id"))


def list_comments(asset_id, *, limit=100):
    """A picture's live comments, oldest first. A blocked person's comments
    leave with them, as on a post."""
    from apps.profiles.models import Profile

    if not BhaktiAsset.objects.filter(pk=asset_id, active=True).exists():
        raise NotFound("That is not in the library.")
    blocked = list(Profile.objects.exclude(blocked_at=None).values_list("id", flat=True))
    rows = BhaktiComment.objects.filter(asset_id=asset_id, status=BhaktiComment.Status.LIVE)
    if blocked:
        rows = rows.exclude(author_id__in=blocked)
    return list(_named(rows).order_by("created_at", "id")[:limit])


def add_comment(asset_id, author_id, body):
    from apps.content.models import MAX_COMMENT_CHARS
    from apps.content.services import (
        BLOCKED_REFUSAL, COMMENT_EMPTY_REFUSAL, COMMENT_LONG_REFUSAL,
    )
    from apps.profiles import services as profile_services

    if profile_services.is_blocked(author_id):
        raise PermissionDenied(BLOCKED_REFUSAL)
    text = (body or "").strip()
    if not text:
        raise ValidationError({"body": COMMENT_EMPTY_REFUSAL})
    if len(text) > MAX_COMMENT_CHARS:
        raise ValidationError({"body": COMMENT_LONG_REFUSAL})
    if not BhaktiAsset.objects.filter(pk=asset_id, active=True).exists():
        raise NotFound("That is not in the library.")
    row = BhaktiComment.objects.create(asset_id=asset_id, author_id=author_id, body=text)
    return _named(BhaktiComment.objects.filter(pk=row.pk)).get()


def remove_comment(comment_id, actor_id, role):
    """Soft delete: the commenter or an admin."""
    row = BhaktiComment.objects.filter(pk=comment_id).first()
    if row is None or row.status == BhaktiComment.Status.REMOVED:
        raise NotFound("That comment is not available.")
    mine = str(row.author_id).replace("-", "") == str(actor_id).replace("-", "")
    if not (mine or role == "admin"):
        raise PermissionDenied("You do not have access to this.")
    row.status = BhaktiComment.Status.REMOVED
    row.save(update_fields=["status"])
    return row


# Bhajans and mantras joined the same day (Rahul); a priced one never reshares.
REPOSTABLE_KINDS = ("status", "wallpaper", "bhajan", "mantra")


def assert_repostable(asset_id, actor_id):
    """A picture on the shelves, active and free; the resharer not blocked."""
    from apps.content.services import BLOCKED_REFUSAL
    from apps.profiles import services as profile_services

    if profile_services.is_blocked(actor_id):
        raise PermissionDenied(BLOCKED_REFUSAL)
    ok = BhaktiAsset.objects.filter(
        pk=asset_id, active=True, kind__in=REPOSTABLE_KINDS, price_paise__isnull=True
    ).exists()
    if not ok:
        raise NotFound("That is not in the library.")


def list_reposts(*, by=None, limit=50):
    """Reshared pictures, newest first, with who reshared them — the feed's
    "X reshared" items and a profile's Reshared list. A withdrawn picture
    and a blocked resharer drop out."""
    from apps.profiles import services as profile_services
    from apps.profiles.models import Profile
    from apps.reactions.models import Reaction

    qs = Reaction.objects.filter(kind=Reaction.Kind.REPOST, target_type=Reaction.TargetType.BHAKTI)
    if by is not None:
        qs = qs.filter(actor_id=by)
    blocked = list(Profile.objects.exclude(blocked_at=None).values_list("id", flat=True))
    if blocked:
        qs = qs.exclude(actor_id__in=blocked)
    events = list(
        qs.annotate(actor_name=profile_services.name_subquery("actor_id")).order_by("-created_at")[: limit * 2]
    )
    assets = {
        str(a.id).replace("-", ""): a
        for a in with_counts(BhaktiAsset.objects.filter(
            pk__in=[e.target_id for e in events], active=True, kind__in=REPOSTABLE_KINDS))
    }
    out = []
    for e in events:
        asset = assets.get(str(e.target_id).replace("-", ""))
        if asset is not None:
            out.append((e, asset))
        if len(out) == limit:
            break
    return out
