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
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.profiles import services as profile_services
from apps.reactions.models import Reaction

from . import gateway
from .models import (
    MAX_COMMENT_CHARS,
    MAX_TAGGED_PRODUCTS,
    Comment,
    Content,
    ContentProduct,
    ContentView,
    Report,
    Review,
)

# The two refusal sentences src/lib/content.js already shows. The server's
# job is to make the interface's string true (INSTRUCTIONS §2, Errors) — the
# client maps these onto its toasts verbatim.
GATE_REFUSAL = "You can only review a session you have completed"
DUPLICATE_REFUSAL = "You have already reviewed this session"
REEL_REFUSAL = "Only a consultant can post a reel"
VIDEO_REFUSAL = "Video posting is not switched on for your account"
BLOCKED_REFUSAL = "Your account cannot post"
TAG_REFUSAL = "Only an approved consultant can tag products"
TAG_LIMIT_REFUSAL = f"Tag at most {MAX_TAGGED_PRODUCTS} products"
TAG_MISSING_REFUSAL = "One of those products is not in the shop"
SELF_REPORT_REFUSAL = "You cannot report your own post"
DUPLICATE_REPORT_REFUSAL = "You have already reported this"

# Kinds anyone signed in may publish (025: the kind gate is an RLS predicate
# because it depends on another table — a CHECK cannot see one).
OPEN_KINDS = (Content.Kind.POST, Content.Kind.ARTICLE)


class DuplicateReview(Exception):
    """One booking bought two reviews — the unique index's refusal, raised so
    the view can answer 409 instead of the gate's 403."""


# ── the public projection ────────────────────────────────────────────────────

# Cross-table UUID joins between Django-managed tables (content, reviews,
# reactions — Django UUIDFields, stored dashless on SQLite) and the raw
# gateway tables (consultants, bookings — module 6's; native uuid in
# Postgres). replace(cast(...)) normalises both sides to dashless text so
# the join reads identically on Postgres and SQLite; on Postgres the cast
# of a uuid column is exactly its text form, on SQLite of a char(32) it is
# a no-op. profiles left this list in module 9 — the profile module owns
# the table and its reads are ORM subqueries (name_subquery).
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
    # A blocked PERSON's posts leave the feed too — added 23 Sep 2026 with
    # reporting. Separate from the consultant clause above and deliberately
    # so: that one is about a practice not being approved, this one is a
    # moderation decision about a human being, and the two are revoked by
    # different people for different reasons.
    blocked_author = RawSQL(
        "select count(*) from profiles p"
        f" where {_xid('p.id', 'content.author_id')} and p.blocked_at is not null",
        [],
        output_field=models.IntegerField(),
    )
    return (
        Content.objects.filter(status=Content.Status.LIVE)
        .annotate(_blocked=blocked)
        .filter(_blocked=0)
        .annotate(_author_blocked=blocked_author)
        .filter(_author_blocked=0)
        .annotate(
            author_name=profile_services.name_subquery("author_id"),
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
            # Live comments by people who are not blocked — the same rows
            # the comment sheet lists, so the number and the list agree.
            comment_count=RawSQL(
                "select count(*) from content_comments cc"
                " where cc.content_id = content.id and cc.status = 'live'"
                " and not exists (select 1 from profiles p"
                f"  where {_xid('p.id', 'cc.author_id')} and p.blocked_at is not null)",
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


def _assert_not_blocked(author_id):
    """A blocked account publishes nothing at all — not a reel, not a photo,
    not a line of text. Checked before the kind gate, because "you cannot
    post a reel" is the wrong sentence to show somebody whose account is
    blocked outright."""
    if profile_services.is_blocked(author_id):
        raise PermissionDenied(BLOCKED_REFUSAL)


def _may_post_video(author_id, role):
    """Three ways to earn video, and they are deliberately separate things.

    1. **An admin.** Administering the feed includes posting to it.
    2. **An approved consultant** — the 025 policy's EXISTS clause. A
       pending or blocked consultant is refused exactly as a seeker is.
    3. **`profiles.video_enabled`** — the flag, added 23 Sep 2026.

    The third exists because the first two are ROLES and this is a
    CAPABILITY. An influencer who joins as an ordinary seeker should be
    able to post reels without being turned into a consultant: that would
    put them in the astrologer list, make them bookable, and give them a
    rate card, none of which anybody asked for. One switch in the console
    grants it, and flipping it back revokes it.
    """
    if role == "admin":
        return True
    if gateway.is_approved_consultant(author_id):
        return True
    return profile_services.video_enabled(author_id)


def _assert_kind_allowed(author_id, role, kind):
    """The 025 insert policy's kind gate, widened by the video flag.

    Anyone not blocked may publish post/article — text and images are open
    to everybody. `clip` and `live_session` need video permission.
    """
    _assert_not_blocked(author_id)
    if kind in OPEN_KINDS:
        return
    if not _may_post_video(author_id, role):
        raise PermissionDenied(VIDEO_REFUSAL)


def _checked_products(author_id, role, product_ids):
    """The products a post may carry, in the order the author picked them.

    Refuses rather than trims: silently dropping the fourth tag, or a
    retired product, would publish a post the author did not write."""
    from apps.shop.models import Product

    ids = list(dict.fromkeys(str(p) for p in product_ids))  # de-dup, keep order
    if not ids:
        return []
    if role != "admin" and not gateway.is_approved_consultant(author_id):
        raise PermissionDenied(TAG_REFUSAL)
    if len(ids) > MAX_TAGGED_PRODUCTS:
        raise ValidationError({"product_ids": TAG_LIMIT_REFUSAL})
    found = {str(p.id): p for p in Product.objects.filter(id__in=ids, active=True)}
    if len(found) != len(ids):
        raise ValidationError({"product_ids": TAG_MISSING_REFUSAL})
    return [found[i] for i in ids]


def publish_content(author_id, role, *, kind, title=None, body=None, caption=None,
                    media_url=None, status=Content.Status.LIVE, product_ids=()):
    """Insert one content row as the caller. author_id is forced (rule 3);
    published_at is the server's clock, never the client's (rule 3 again —
    a timestamp the client picks is a number the user benefits from).
    `legacy_id` is accepted only on the seed path, never from a URL.

    `product_ids` tags shop products on the post (ContentProduct). The post
    and its tags are one write: a post that published and then lost its
    tags would be a different post from the one the author sent."""
    _assert_kind_allowed(author_id, role, kind)
    if status not in (Content.Status.LIVE, Content.Status.DRAFT):
        raise PermissionDenied("Removed content cannot be republished.")
    products = _checked_products(author_id, role, product_ids)
    with transaction.atomic():
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
        ContentProduct.objects.bulk_create(
            ContentProduct(content=row, product=p, sort=i) for i, p in enumerate(products)
        )
    if products:
        # Mint the author's A code now, so every reader of this post finds
        # one to carry — the read side never mints (a GET must not write).
        from apps.referrals import services as referral_services
        from apps.referrals.models import CodeKind

        referral_services.code_for(author_id, CodeKind.CONSULTANT)
    return row


def record_view(content_id, viewer_id):
    """Count this person once for this post; return the post's view count.

    Only live, publicly visible content — a draft or a blocked author's reel
    is a 404 here exactly as it is on the detail view. The author's own
    views are not counted. The row and the counter move together, and the
    unique index makes a double-send (two tabs, a retry) a no-op rather
    than a second view."""
    row = public_content().filter(pk=content_id).only("id", "author_id", "view_count").first()
    if row is None:
        raise NotFound("That post is not available.")
    if str(row.author_id).replace("-", "") == str(viewer_id).replace("-", ""):
        return row.view_count
    try:
        with transaction.atomic():
            ContentView.objects.create(content_id=row.id, viewer_id=viewer_id)
            Content.objects.filter(pk=row.id).update(view_count=F("view_count") + 1)
    except IntegrityError:
        pass  # already counted
    return Content.objects.values_list("view_count", flat=True).get(pk=row.id)


# ── comments ─────────────────────────────────────────────────────────────────

COMMENT_EMPTY_REFUSAL = "Write something first"
COMMENT_LONG_REFUSAL = f"Keep it under {MAX_COMMENT_CHARS} characters"


def list_comments(content_id, *, limit=100):
    """A post's live comments, oldest first — a thread reads top to bottom.
    A hidden post is a 404, exactly as its detail view is; a blocked
    person's comments leave with them, as their posts do."""
    if not public_content().filter(pk=content_id).exists():
        raise NotFound("That post is not available.")
    blocked = RawSQL(
        "select count(*) from profiles p"
        f" where {_xid('p.id', 'content_comments.author_id')} and p.blocked_at is not null",
        [],
        output_field=models.IntegerField(),
    )
    return list(
        Comment.objects.filter(content_id=content_id, status=Comment.Status.LIVE)
        .annotate(_blocked=blocked)
        .filter(_blocked=0)
        .annotate(author_name=profile_services.name_subquery("author_id"))
        .order_by("created_at", "id")[:limit]
    )


def add_comment(content_id, author_id, body):
    """Post a comment as the caller (rule 3: the author is the JWT, never the
    body). The post's author hears about it, unless they wrote it."""
    _assert_not_blocked(author_id)
    text = (body or "").strip()
    if not text:
        raise ValidationError({"body": COMMENT_EMPTY_REFUSAL})
    if len(text) > MAX_COMMENT_CHARS:
        raise ValidationError({"body": COMMENT_LONG_REFUSAL})
    post = public_content().filter(pk=content_id).only("id", "author_id").first()
    if post is None:
        raise NotFound("That post is not available.")
    row = _with_name(Comment.objects.create(content_id=post.id, author_id=author_id, body=text))

    if str(post.author_id).replace("-", "") != str(author_id).replace("-", ""):
        # After the write and never raising (notify.push): a comment that
        # posted and went unannounced is fine; one rolled back because the
        # alert failed is not.
        from apps.notifications import services as notify

        notify.push(
            post.author_id,
            kind="content.comment",
            title=f"{row.author_name or 'Someone'} commented on your post",
            body=text[:140],
            ref_type="content",
            ref_id=str(post.id),
        )
    return row


def _with_name(row):
    """The commenter's name on a freshly created row, as the list carries it."""
    row.author_name = (
        Comment.objects.filter(pk=row.pk)
        .annotate(n=profile_services.name_subquery("author_id"))
        .values_list("n", flat=True)
        .first()
    )
    return row


def remove_comment(comment_id, actor_id, role):
    """Soft delete. The commenter, the post's author (their post, their
    thread) or an admin — nobody else."""
    row = Comment.objects.select_related("content").filter(pk=comment_id).first()
    if row is None or row.status == Comment.Status.REMOVED:
        raise NotFound("That comment is not available.")
    me = str(actor_id).replace("-", "")
    mine = str(row.author_id).replace("-", "") == me
    my_post = str(row.content.author_id).replace("-", "") == me
    if not (mine or my_post or role == "admin"):
        raise PermissionDenied("You do not have access to this.")
    row.status = Comment.Status.REMOVED
    row.save(update_fields=["status"])
    return row


def attach_products(rows):
    """Give each public row `_products` (active tags, in order) and
    `_shop_ref` (the author's A code, when it has products to carry).

    Two queries for a whole page, not two per row: one for the tags, one
    for the codes of the authors who have any."""
    from apps.referrals.models import CodeKind, ReferralCode

    rows = list(rows)
    if not rows:
        return rows
    tags = (
        ContentProduct.objects.filter(
            content_id__in=[r.id for r in rows], product__active=True
        )
        .select_related("product")
        .order_by("content_id", "sort")
    )
    by_content = {}
    for t in tags:
        by_content.setdefault(t.content_id, []).append(t.product)

    tagged_authors = {r.author_id for r in rows if by_content.get(r.id)}
    codes = {
        c.profile_id: c.code
        for c in ReferralCode.objects.filter(
            profile_id__in=tagged_authors, kind=CodeKind.CONSULTANT, active=True
        )
    }
    for r in rows:
        r._products = by_content.get(r.id, [])
        # Only an approved consultant's code is worth carrying. Belt and
        # braces: an unapproved consultant's posts already leave the public
        # projection, but an admin-authored tag has no consultant behind it.
        r._shop_ref = codes.get(r.author_id) if r._products and r._approved else None
    return rows


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


# ── reporting and moderation ────────────────────────────────────────────────
#
# A report is a COMPLAINT, not an action. Nothing in this section removes a
# post or blocks a person. An admin does that in the console, having read
# it — which is the seeker's own instruction: "admin dhyaan se dekhega".
#
# The alternative, auto-hiding at N reports, hands any N accounts the power
# to silence anybody. That is not a moderation system, it is a weapon, and
# every product that has shipped it has spent the following year building
# the appeals process it needed instead.


def report_content(reporter_id, content_id, *, reason, note=None):
    """Report one post. Once per person per post."""
    row = Content.objects.filter(pk=content_id).values("id", "author_id").first()
    if not row:
        raise NotFound("That post is gone")
    if _same_profile(row["author_id"], reporter_id):
        raise PermissionDenied(SELF_REPORT_REFUSAL)
    return _file_report(
        reporter_id, subject_id=row["author_id"], content_id=row["id"],
        reason=reason, note=note,
    )


def report_profile(reporter_id, subject_id, *, reason, note=None):
    """Report a person rather than one of their posts.

    This is the half that makes "this account has been reported many
    times" answerable — a per-post count cannot see somebody who deletes
    and reposts, and that is exactly what a bad actor does.
    """
    if _same_profile(subject_id, reporter_id):
        raise PermissionDenied(SELF_REPORT_REFUSAL)
    if not profile_services.profile_name(subject_id):
        raise NotFound("No such person")
    return _file_report(
        reporter_id, subject_id=subject_id, content_id=None,
        reason=reason, note=note,
    )


def _same_profile(left, right):
    return str(left).replace("-", "") == str(right).replace("-", "")


def _file_report(reporter_id, *, subject_id, content_id, reason, note):
    if reason not in Report.Reason.values:
        reason = Report.Reason.OTHER
    try:
        with transaction.atomic():
            report = Report.objects.create(
                reporter_id=reporter_id, subject_id=subject_id,
                content_id=content_id, reason=reason,
                note=(note or "").strip()[:2000] or None,
            )
    except IntegrityError:
        # The partial unique indexes. Answered as success on purpose: the
        # seeker's intent is "I have told you about this", and telling them
        # they already did invites a second tap looking for a different
        # outcome. The count is unaffected either way.
        raise AlreadyReported(DUPLICATE_REPORT_REFUSAL)
    return {"ok": True, "id": str(report.id)}


class AlreadyReported(Exception):
    """Filed twice by the same person. The view answers 200, not 409 — see
    `_file_report`."""


def reports_against(subject_id):
    """How many DIFFERENT people have complained about this account, and
    how many of those are still unanswered. The console's whole reason for
    the subject index."""
    rows = Report.objects.filter(subject_id=subject_id)
    return {
        "total": rows.count(),
        "open": rows.filter(status=Report.Status.OPEN).count(),
    }


def resolve_report(report_id, *, admin_profile_id, upheld, outcome):
    """An admin has decided. Records WHO and WHAT, never silently.

    This only closes the report. Removing the post and blocking the person
    are separate calls made by the console alongside it, so that a report
    resolved as "upheld, post removed" and a post that is actually still
    live cannot be two different truths — each action is its own write with
    its own audit line.
    """
    return Report.objects.filter(pk=report_id, status=Report.Status.OPEN).update(
        status=Report.Status.UPHELD if upheld else Report.Status.DISMISSED,
        reviewed_by=admin_profile_id,
        reviewed_at=timezone.now(),
        outcome=outcome,
    ) == 1


def admin_remove_content(content_id):
    """Take a post out of the feed on an ADMIN's decision.

    Deliberately not `remove_content`, which is the author removing their
    own and carries an ownership check. This one has no owner check
    because the admin is not the owner — naming them the same thing would
    have shadowed the author's path entirely, which is how a moderation
    feature quietly removes the ability to delete your own post.
    """
    return Content.objects.filter(pk=content_id).exclude(
        status=Content.Status.REMOVED
    ).update(status=Content.Status.REMOVED) == 1
