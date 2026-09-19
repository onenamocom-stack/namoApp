"""Content services — the rules of 020_content_reviews.sql (as amended by
025_seekers_publish.sql) re-expressed in code, per module.

Three layers live here:

1. The public projection. The client reads ONLY through the 025 views
   (`content_public`, `reviews_public`, `profile_follow_counts`,
   `authors_public`) — those views are the access control (020: "The view's
   own projection is the access control — it exposes aggregates and never the
   actor IDs behind them"). Django does not own the underlying SQL views, so
   `public_content()` is a queryset that replicates the 025 `content_public`
   definition exactly: status='live', the NOT EXISTS that keeps a blocked
   consultant's posts out of the feed without making approval a gate on
   ordinary people, and the four computed columns (author_name,
   author_is_consultant, like_count, save_count). Counts are COUNT(*)
   queries, not columns (§1.3): exact by construction, nothing to drift.

2. The publication state machine. Who may publish what is the 025 insert
   policy: author is always the caller (rule 3 — the client never sends an
   identity), `post`/`article` for anyone, `clip` (and `live_session`) only
   for an APPROVED consultant, admins excepted from nothing because an admin
   IS approved of by definition. Drafts: status 'draft' is visible to nobody
   but the author; `publish_draft` moves own draft -> live and stamps
   published_at. Removal is `status = 'removed'` — a soft delete, never a
   DELETE (a removed post in a dispute is evidence).

3. The review gate and the rating cache. The anti-fraud rule, enforced in
   the 020 policy because there is no money and no second write: a review
   requires a booking that is the caller's own and COMPLETED — not pending,
   not confirmed — and booking_id is unique, so one booking buys one review.
   `verified` is derived, never stored: booking_id is not null. The rating
   caches recompute from the live reviews in the SAME transaction as the
   write, under a consultants row lock — the 020 trigger's exact arithmetic,
   round(avg::numeric, 1), recomputed rather than incremented.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import IntegrityError, models, transaction
from django.db.models import Avg, Count, F
from django.db.models.expressions import RawSQL
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.reactions.models import Reaction

from . import gateway
from .models import Content, Review

# The two refusal sentences src/lib/content.js already shows. The server's
# job is to make the interface's string true (INSTRUCTIONS §2, Errors) — the
# client maps these onto its toasts verbatim.
GATE_REFUSAL = "You can only review a session you have completed"
DUPLICATE_REFUSAL = "You have already reviewed this session"
REEL_REFUSAL = "Only a consultant can post a reel"

# Kinds anyone signed in may publish (025: the kind gate is an RLS predicate
# because it depends on another table — a CHECK cannot see one).
OPEN_KINDS = (Content.Kind.POST, Content.Kind.ARTICLE)


class DuplicateReview(Exception):
    """One booking bought two reviews — the unique index's refusal, raised so
    the view can answer 409 instead of the gate's 403."""


# ── the public projection ────────────────────────────────────────────────────

# Cross-table UUID joins between Django-managed tables (content, reviews,
# reactions — Django UUIDFields, stored dashless on SQLite) and the raw
# gateway tables (profiles, consultants, bookings — native uuid in Postgres).
# replace(cast(...)) normalises both sides to dashless text so the join reads
# identically on Postgres and SQLite; on Postgres the cast of a uuid column
# is exactly its text form, on SQLite of a char(32) it is a no-op.
def _xid(left, right):
    return (
        f"replace(cast({left} as text), '-', '')"
        f" = replace(cast({right} as text), '-', '')"
    )


def public_content():
    """The 025 `content_public` view as a queryset — same rows, same columns.

    where c.status = 'live'
      and not exists (select 1 from consultants b
                       where b.profile_id = c.author_id and b.status <> 'approved')
    """
    blocked = RawSQL(
        "select count(*) from consultants b"
        f" where {_xid('b.profile_id', 'content.author_id')} and b.status <> 'approved'",
        [],
        output_field=models.IntegerField(),
    )
    return (
        Content.objects.filter(status=Content.Status.LIVE)
        .annotate(_blocked=blocked)
        .filter(_blocked=0)
        .annotate(
            author_name=RawSQL(
                f"select p.name from profiles p where {_xid('p.id', 'content.author_id')}",
                [],
                output_field=models.TextField(),
            ),
            # 025: (cs.profile_id is not null) over a LEFT JOIN consultants
            # ON profile_id = author_id AND status = 'approved'.
            _approved=RawSQL(
                "select count(*) from consultants c"
                f" where {_xid('c.profile_id', 'content.author_id')} and c.status = 'approved'",
                [],
                output_field=models.IntegerField(),
            ),
            like_count=RawSQL(
                "select count(*) from reactions r"
                " where r.target_type = 'content' and r.target_id = content.id"
                " and r.kind = 'like'",
                [],
                output_field=models.IntegerField(),
            ),
            save_count=RawSQL(
                "select count(*) from reactions r"
                " where r.target_type = 'content' and r.target_id = content.id"
                " and r.kind = 'save'",
                [],
                output_field=models.IntegerField(),
            ),
        )
    )


def _public_page(qs, *, after_id=None, limit=40):
    """Keyset page over (-published_at, -id), NULLs last.

    The client's PostgREST query ordered published_at desc nullsFirst:false;
    Postgres reads that as NULLS LAST, and this ordering matches it on every
    backend Django runs on. `after_id` is the id of the last row the caller
    saw; the anchor's (published_at, id) pair is the bookmark.
    """
    ordering = (F("published_at").desc(nulls_last=True), "-id")
    page = qs.order_by(*ordering)
    if after_id is not None:
        anchor = qs.model._default_manager.filter(pk=after_id).first()
        if anchor is not None:
            if anchor.published_at is None:
                # NULLs sort last: after a NULL anchor come only NULL rows
                # with a smaller id.
                page = page.filter(published_at__isnull=True, id__lt=anchor.id)
            else:
                page = page.filter(
                    models.Q(published_at__lt=anchor.published_at)
                    | models.Q(published_at__isnull=True)
                    | models.Q(published_at=anchor.published_at, id__lt=anchor.id)
                )
    rows = list(page[:limit])
    next_after = str(rows[-1].id) if len(rows) == limit else None
    return rows, next_after


def feed_page(*, kinds=None, after_id=None, limit=40):
    """Newest live content across all authors — the feed is a query, not a
    table (docs/05 §5.3); no ranking, no feed_pins weight in M1."""
    qs = public_content()
    if kinds:
        qs = qs.filter(kind__in=kinds)
    return _public_page(qs, after_id=after_id, limit=limit)


def by_author_page(author_id, *, after_id=None, limit=40):
    qs = public_content().filter(author_id=author_id)
    return _public_page(qs, after_id=after_id, limit=limit)


def public_detail(content_id):
    row = public_content().filter(pk=content_id).first()
    if row is None:
        raise NotFound("That post is not available.")
    return row


# ── publication ──────────────────────────────────────────────────────────────


def _assert_kind_allowed(author_id, role, kind):
    """The 025 insert policy's kind gate.

    Anyone may publish post/article. `clip` and `live_session` require an
    APPROVED consultant row (the policy's EXISTS clause) — a pending or
    blocked consultant is refused exactly as a seeker is. The admin claim
    bypasses nothing here because an admin publishing a reel administers the
    feed; the author is still themselves.
    """
    if kind in OPEN_KINDS:
        return
    if role == "admin":
        return
    if not gateway.is_approved_consultant(author_id):
        raise PermissionDenied(REEL_REFUSAL)


def publish_content(author_id, role, *, kind, title=None, body=None, caption=None,
                    media_url=None, status=Content.Status.LIVE):
    """Insert one content row as the caller. author_id is forced (rule 3);
    published_at is the server's clock, never the client's (rule 3 again —
    a timestamp the client picks is a number the user benefits from).
    `legacy_id` is accepted only on the seed path, never from a URL."""
    _assert_kind_allowed(author_id, role, kind)
    if status not in (Content.Status.LIVE, Content.Status.DRAFT):
        raise PermissionDenied("Removed content cannot be republished.")
    row = Content(
        author_id=author_id,
        kind=kind,
        title=title,
        body=body,
        caption=caption,
        media_url=media_url,
        status=status,
        published_at=timezone.now() if status == Content.Status.LIVE else None,
    )
    row.save()
    return row


def publish_draft(content_id, actor_id, role):
    """Own draft -> live. Stamps published_at; removing is one-way."""
    row = Content.objects.filter(pk=content_id).first()
    if row is None:
        raise NotFound("That post is not available.")
    if str(row.author_id) != str(actor_id) and role != "admin":
        raise PermissionDenied("You do not have access to this.")
    if row.status == Content.Status.REMOVED:
        raise PermissionDenied("Removed content cannot be republished.")
    if row.status == Content.Status.DRAFT:
        row.status = Content.Status.LIVE
        row.published_at = timezone.now()
        row.save(update_fields=["status", "published_at"])
    return row


def remove_content(content_id, actor_id, role):
    """Soft delete, owner-scoped (admin excepted) — the 020 `update_own`
    policy; there is no hard DELETE anywhere in this module."""
    row = Content.objects.filter(pk=content_id).first()
    if row is None:
        raise NotFound("That post is not available.")
    if str(row.author_id) != str(actor_id) and role != "admin":
        raise PermissionDenied("You do not have access to this.")
    if row.status != Content.Status.REMOVED:
        row.status = Content.Status.REMOVED
        row.save(update_fields=["status"])
    return row


def seed_content(author_id, *, kind, legacy_id, title=None, body=None, caption=None,
                 media_url=None, status=Content.Status.LIVE, published_at=None):
    """The service-role `backend/seed/content.mjs` replacement: publish rows
    idempotently on legacy_id (§1.4 — the seed says which mock row a table
    row came from without migrating a mock ID into a primary key). Reachable
    from no URL; constraint-safe against a racing re-seed (the losing insert
    reads the winner and refreshes it)."""
    with transaction.atomic():
        try:
            with transaction.atomic():  # savepoint: a lost race rolls back only the insert
                row = Content.objects.create(
                    author_id=author_id,
                    kind=kind,
                    legacy_id=legacy_id,
                    title=title,
                    body=body,
                    caption=caption,
                    media_url=media_url,
                    status=status,
                    published_at=published_at or (timezone.now() if status == "live" else None),
                )
                return row, True
        except IntegrityError:
            row = Content.objects.get(legacy_id=legacy_id)
            for field, value in (
                ("kind", kind), ("title", title), ("body", body), ("caption", caption),
                ("media_url", media_url), ("status", status),
                ("published_at", published_at or row.published_at),
            ):
                setattr(row, field, value)
            row.save()
            return row, False


# ── reviews ──────────────────────────────────────────────────────────────────


def _recompute_rating_cache(consultant_id):
    """The 020 trigger's arithmetic: round(avg(rating)::numeric, 1) and
    count(*) over LIVE reviews. Postgres numeric rounding is half away from
    zero (ROUND_HALF_UP here — Python's banker's round would answer 4.2 for
    an average of 4.25, Postgres says 4.3). Called inside the caller's
    transaction, before the consultants row lock is taken."""
    agg = Review.objects.filter(
        consultant_id=consultant_id, status=Review.Status.LIVE
    ).aggregate(avg=Avg("rating"), n=Count("id"))
    n = agg["n"] or 0
    avg = None
    if n:
        # Avg returns float; str() keeps the full decimal expansion so the
        # quantize sees the same digits Postgres's numeric avg would carry.
        avg = Decimal(str(agg["avg"])).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    gateway.write_rating_cache(consultant_id, avg, n)
    return avg, n


def leave_review(seeker_id, *, booking_id, consultant_id, rating, body=None):
    """THE ANTI-FRAUD RULE, re-expressed. A review requires a booking that is
    the caller's own and COMPLETED — not pending, not confirmed — and names
    the same consultant as the booking. booking_id is unique: one booking
    buys one review, and the unique index (not a read-before-write) decides
    the race. The rating cache recomputes in this same transaction."""
    booking = gateway.booking_for_review(booking_id)
    if (
        booking is None
        or booking["seeker_id"] != str(seeker_id)
        or booking["consultant_id"] != str(consultant_id)
        or booking["status"] != "completed"
    ):
        raise PermissionDenied(GATE_REFUSAL)
    with transaction.atomic():
        try:
            with transaction.atomic():  # savepoint: the lost race only rolls back the insert
                review = Review.objects.create(
                    booking_id=booking_id,
                    seeker_id=seeker_id,
                    consultant_id=consultant_id,
                    rating=rating,
                    body=body,
                )
        except IntegrityError:
            # 23505 on reviews_booking_id_key — the check's "one booking,
            # one review", answered with its own sentence.
            raise DuplicateReview(DUPLICATE_REFUSAL) from None
        _recompute_rating_cache(consultant_id)
    return review


def seed_review(*, booking_id=None, seeker_id, consultant_id, rating, body=None):
    """The service-role bypass the 020 check itself relies on: seeded reviews
    carry no fabricated bookings, so they are visible but NOT verified.
    Reachable from no URL. Upserts on booking_id when one is given."""
    with transaction.atomic():
        review = None
        if booking_id is not None:
            review = Review.objects.filter(booking_id=booking_id).first()
        if review is None:
            review = Review.objects.create(
                booking_id=booking_id,
                seeker_id=seeker_id,
                consultant_id=consultant_id,
                rating=rating,
                body=body,
            )
        else:
            review.rating, review.body, review.status = rating, body, Review.Status.LIVE
            review.save(update_fields=["rating", "body", "status"])
        _recompute_rating_cache(consultant_id)
        return review


def set_review_status(review_id, status):
    """Moderation moves `status` — the 020 design says so and gives reviews
    no update policy to anyone else. Admin-console seam (phase 13), no URL
    in this module; the cache recomputes in the same transaction, for BOTH
    the old and new consultant per the 020 trigger (they cannot differ, but
    the trigger handles the case, so does this)."""
    with transaction.atomic():
        review = Review.objects.filter(pk=review_id).first()
        if review is None:
            raise NotFound("That review is not available.")
        old_consultant = review.consultant_id
        if review.status != status:
            review.status = status
            review.save(update_fields=["status"])
        _recompute_rating_cache(old_consultant)
        if review.consultant_id != old_consultant:  # the trigger's both-rows case
            _recompute_rating_cache(review.consultant_id)
        return review


def _reviewer_name(full_name):
    """reviews_public's split_part derivation: first name, plus the initial
    of the second space-separated part when there is one. A review is
    public; the reviewer's full identity is not (020)."""
    if not full_name:
        return ""
    parts = full_name.split(" ")
    first, second = parts[0], parts[1] if len(parts) > 1 else ""
    return f"{first} {second[0]}." if second else first


def list_reviews(consultant_id, *, limit=20):
    """The reviews_public projection: live rows, newest first, verified
    derived from booking_id, the reviewer named as "Tara V." rather than in
    full."""
    rows = list(
        Review.objects.filter(consultant_id=consultant_id, status=Review.Status.LIVE)
        .order_by("-created_at", "-id")[:limit]
    )
    names = gateway.profile_names([r.seeker_id for r in rows])
    return [
        {
            "id": str(r.id),
            "consultant_id": str(r.consultant_id),
            "rating": r.rating,
            "body": r.body,
            "created_at": r.created_at,
            "verified": r.booking_id is not None,
            "reviewer_name": _reviewer_name(names.get(str(r.seeker_id), "")),
        }
        for r in rows
    ]


def reviewable_bookings(seeker_id):
    """The 020 gate's positive half, for the client's Review affordance."""
    return gateway.reviewable_bookings(seeker_id)


# ── follow counts and authors ────────────────────────────────────────────────


def follow_counts(profile_id):
    """profile_follow_counts (025): followers AND following for ANY profile.
    A follow of a practitioner ('consultant') and a follow of a person
    ('profile') both count — one audience, not two."""
    targets = [Reaction.TargetType.PROFILE, Reaction.TargetType.CONSULTANT]
    followers = Reaction.objects.filter(
        kind=Reaction.Kind.FOLLOW, target_type__in=targets, target_id=profile_id
    ).count()
    following = Reaction.objects.filter(
        kind=Reaction.Kind.FOLLOW, target_type__in=targets, actor_id=profile_id
    ).count()
    return {"followers": followers, "following": following}


def fetch_author(profile_id):
    """authors_public (025): the public name of a seeker whose posts are in
    the feed — publishing a post is what puts a name on a screen; only people
    who have published are listed, and nothing but the name is exposed."""
    has_live = Content.objects.filter(
        author_id=profile_id, status=Content.Status.LIVE
    ).exists()
    if not has_live:
        return None
    name = gateway.profile_name(profile_id)
    if name is None:
        return None
    return {"id": str(profile_id), "name": name}
