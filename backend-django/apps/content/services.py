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
from django.db.models import Avg, Count, F, OuterRef, Q, Subquery
from django.db.models.expressions import RawSQL
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.core import limits
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
    ist_today,
)

# The two refusal sentences src/lib/content.js already shows. The server's
# job is to make the interface's string true (INSTRUCTIONS §2, Errors) — the
# client maps these onto its toasts verbatim.
GATE_REFUSAL = "You can only review a session you have completed"
DUPLICATE_REFUSAL = "You have already reviewed this session"
REEL_REFUSAL = "Only a consultant can post a reel"
VIDEO_REFUSAL = "Reels and video are for Creators. Ask for the Creator module in Profile settings"
BLOCKED_REFUSAL = "Your account cannot post"
TAG_REFUSAL = "Tagging products opens with Content step 1. See Studio"
TAG_LIMIT_REFUSAL = f"Tag at most {MAX_TAGGED_PRODUCTS} products"
TAG_MISSING_REFUSAL = "One of those products is not on the Market"
SELF_REPORT_REFUSAL = "You cannot report your own post"
DUPLICATE_REPORT_REFUSAL = "You have already reported this"

# Kinds anyone signed in may publish (025: the kind gate is an RLS predicate
# because it depends on another table — a CHECK cannot see one). A video
# (clip) joined them on 17 Oct 2026 (Rahul: "allow video post for all
# seekers"); before, it was the Creator module's. Earning on views stays
# the Creator's. `live_session` still needs video permission.
OPEN_KINDS = (Content.Kind.POST, Content.Kind.ARTICLE, Content.Kind.CLIP)


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
    from apps.groups.models import Group

    return (
        Content.objects.filter(status=Content.Status.LIVE)
        # A blocked group's posts leave the app with it (Phase 15c).
        .exclude(group_id__in=Group.objects.filter(status=Group.Status.BLOCKED).values("id"))
        .annotate(group_name=Subquery(Group.objects.filter(pk=OuterRef("group_id")).values("name")[:1]))
        .annotate(_blocked=blocked)
        .filter(_blocked=0)
        .annotate(_author_blocked=blocked_author)
        .filter(_author_blocked=0)
        .annotate(
            author_name=profile_services.name_subquery("author_id"),
            author_avatar=profile_services.avatar_subquery("author_id"),
            author_creator=profile_services.creator_subquery("author_id"),
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
            repost_count=RawSQL(
                "select count(*) from reactions r"
                " where r.target_type = 'content' and r.target_id = content.id"
                " and r.kind = 'repost'",
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
    # Group posts are for the group and its members (Phase 15c): the open
    # feed leaves them out; for_you adds the reader's own groups.
    qs = public_content().filter(group_id__isnull=True)
    if kinds:
        qs = qs.filter(kind__in=kinds)
    return _public_page(qs, after_id=after_id, limit=limit)


TAG_SCAN = 1000  # the newest posts a tag page looks through


def by_tag(tag, *, sort="new", limit=60):
    """Posts carrying #tag in their caption, body or title (13 Oct 2026,
    docs/06 Phase 15a). The tag is the text the author wrote, so nothing is
    stored: the newest TAG_SCAN live posts are matched whole-word and
    case-blind, in any script. `top` orders the matches by likes, saves,
    comments and reshares."""
    import re

    word = tag.lstrip("#").strip()
    if not word:
        return []
    # Not followed by a letter or a Devanagari mark: #shiv is not #shivratri.
    pattern = re.compile(rf"#{re.escape(word)}(?![\wऀ-ॿ])", re.IGNORECASE)
    qs = public_content().filter(
        models.Q(caption__icontains=f"#{word}")
        | models.Q(body__icontains=f"#{word}")
        | models.Q(title__icontains=f"#{word}")
    )
    rows = [
        r for r in qs.order_by(F("published_at").desc(nulls_last=True), "-id")[:TAG_SCAN]
        if any(pattern.search(t or "") for t in (r.caption, r.body, r.title))
    ]
    if sort == "top":
        rows.sort(
            key=lambda r: r.like_count + 2 * (r.save_count + r.comment_count + r.repost_count),
            reverse=True,
        )
    return rows[:limit]


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
    # An approved consultant no longer posts video by being one (docs/06
    # Phase 18, 16 Oct 2026): video is the Creator module's.
    # 4. A Creator posts every kind (13 Oct 2026, Rahul).
    if profile_services.is_creator(author_id):
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


def _checked_listings(author_id, role, listing_ids, n_products):
    """Market listings a post may tag (15 Oct 2026): the same people as
    products, and the same three-tag limit counting both."""
    if not listing_ids:
        return []
    # Tagging is Content step 1's (Rahul, 17 Oct 2026; the Creator module's
    # from 16 Oct).
    if role != "admin" and not profile_services.may_refer(author_id):
        raise PermissionDenied(TAG_REFUSAL)
    from apps.market import services as market

    return market.checked_tags(listing_ids, already=n_products, limit=MAX_TAGGED_PRODUCTS)


def _checked_ebooks(author_id, role, ebook_ids, n_other):
    """Namo's e-books a post may tag (15 Oct 2026): the same people as
    products, and the same three-tag limit counting everything."""
    if not ebook_ids:
        return []
    # Tagging is Content step 1's (Rahul, 17 Oct 2026; the Creator module's
    # from 16 Oct).
    if role != "admin" and not profile_services.may_refer(author_id):
        raise PermissionDenied(TAG_REFUSAL)
    from apps.bhakti import services as bhakti

    return bhakti.checked_tags(ebook_ids, already=n_other, limit=MAX_TAGGED_PRODUCTS)


def _checked_products(author_id, role, product_ids):
    """The products a post may carry, in the order the author picked them.

    Refuses rather than trims: silently dropping the fourth tag, or a
    retired product, would publish a post the author did not write."""
    from apps.shop.models import Product

    ids = list(dict.fromkeys(str(p) for p in product_ids))  # de-dup, keep order
    if not ids:
        return []
    # Tagging is Content step 1's (Rahul, 17 Oct 2026; the Creator module's
    # from 16 Oct).
    if role != "admin" and not profile_services.may_refer(author_id):
        raise PermissionDenied(TAG_REFUSAL)
    if len(ids) > MAX_TAGGED_PRODUCTS:
        raise ValidationError({"product_ids": TAG_LIMIT_REFUSAL})
    found = {str(p.id): p for p in Product.objects.filter(id__in=ids, active=True)}
    if len(found) != len(ids):
        raise ValidationError({"product_ids": TAG_MISSING_REFUSAL})
    return [found[i] for i in ids]


# Photos on one post or listing (17 Oct 2026, Rahul): the cover and nine more.
MAX_PHOTOS = 10


def clean_gallery(urls, cover):
    """The photos after the cover: https URLs, in order, duplicates and
    blanks dropped, at most MAX_PHOTOS - 1, and only with a cover."""
    out = []
    for url in urls or []:
        url = str(url or "").strip()
        if not url:
            continue
        if not url.startswith("https://") or len(url) > 1000:
            raise ValidationError({"gallery": "A photo did not upload. Add it again."})
        if url != cover and url not in out:
            out.append(url)
    if out and not cover:
        raise ValidationError({"gallery": "Add the first photo."})
    if len(out) > MAX_PHOTOS - 1:
        raise ValidationError({"gallery": f"Up to {MAX_PHOTOS} photos."})
    return out


def publish_content(author_id, role, *, kind, title=None, body=None, caption=None,
                    media_url=None, status=Content.Status.LIVE, product_ids=(), group_id=None,
                    listing_ids=(), ebook_ids=(), gallery=(), video_id=None):
    """Insert one content row as the caller. author_id is forced (rule 3);
    published_at is the server's clock, never the client's (rule 3 again —
    a timestamp the client picks is a number the user benefits from).
    `legacy_id` is accepted only on the seed path, never from a URL.

    `product_ids` tags shop products on the post (ContentProduct). The post
    and its tags are one write: a post that published and then lost its
    tags would be a different post from the one the author sent.

    `video_id` is a reel uploaded through the video pipeline: the post
    waits as a draft until the video is live (`video_settled`)."""
    _assert_kind_allowed(author_id, role, kind)
    if video_id:
        if kind != Content.Kind.CLIP:
            raise ValidationError({"video_id": "Only a reel carries a video."})
        from apps.clips import services as clips

        try:
            media_url, live = clips.for_post(author_id, video_id)
        except clips.Refused as err:
            raise PermissionDenied(err.message) from None
        if not live:
            status = Content.Status.DRAFT
    gallery = clean_gallery(gallery, media_url) if kind == Content.Kind.POST else []
    if status not in (Content.Status.LIVE, Content.Status.DRAFT):
        raise PermissionDenied("Removed content cannot be republished.")
    if role != "admin":
        limits.check(Content.objects.filter(author_id=author_id), limits.POSTS)
    products = _checked_products(author_id, role, product_ids)
    listings = _checked_listings(author_id, role, listing_ids, len(products))
    ebooks = _checked_ebooks(author_id, role, ebook_ids, len(products) + len(listings))
    if group_id:
        # Only a member of a live group posts in it; a removed member never
        # again (Phase 15c, the done-condition).
        from apps.groups import services as group_services

        try:
            group_services.assert_may_post(group_id, author_id)
        except group_services.Refused as err:
            raise PermissionDenied(err.message) from None
    with transaction.atomic():
        row = Content(
            author_id=author_id,
            group_id=group_id or None,
            kind=kind,
            title=title,
            body=body,
            caption=caption,
            media_url=media_url,
            gallery=gallery,
            status=status,
            published_at=timezone.now() if status == Content.Status.LIVE else None,
            video_id=video_id or None,
        )
        row.save()
        ContentProduct.objects.bulk_create(
            ContentProduct(content=row, product=p, sort=i) for i, p in enumerate(products)
        )
        if listings:
            from apps.market import services as market

            market.set_tags(row.id, listings)
        if ebooks:
            from apps.bhakti import services as bhakti

            bhakti.set_tags(row.id, ebooks)
    if role != "admin":
        from . import moderation

        moderation.scan_post(row)  # the daily queue's finders (Phase 15d)
    if group_id:
        from apps.groups import services as group_services

        group_services.posted(group_id)
    if products or listings or ebooks:
        # Mint the author's A code now, so every reader of this post finds
        # one to carry — the read side never mints (a GET must not write).
        from apps.referrals import services as referral_services
        from apps.referrals.models import CodeKind

        referral_services.code_for(author_id, CodeKind.CONSULTANT)
    return row


def video_settled(video_ids):
    """The video pipeline moved these videos on (apps.clips): the posts
    waiting for one go live when it does, with its HLS playlist as
    `media_url`, and are removed when it is rejected or deleted. The
    author hears either way."""
    from apps.clips.models import Video, VideoStatus
    from apps.media.providers import public_url
    from apps.notifications import services as notify

    now = timezone.now()
    for video in Video.objects.filter(pk__in=list(video_ids)):
        rows = Content.objects.filter(video_id=video.id)
        playlist = public_url(video.hls_path) if video.hls_path else None
        if video.status == VideoStatus.LIVE:
            for row in rows.filter(status=Content.Status.DRAFT):
                row.status, row.media_url, row.published_at = Content.Status.LIVE, playlist, now
                row.save(update_fields=["status", "media_url", "published_at"])
                notify.push(row.author_id, kind="content.video.live", title="Your reel is live",
                            ref_type="content", ref_id=row.id, dedupe_key=f"video-live:{row.id}")
        elif video.status in (VideoStatus.REJECTED, VideoStatus.DELETED):
            rejected = video.status == VideoStatus.REJECTED
            for row in rows.exclude(status=Content.Status.REMOVED):
                row.status = Content.Status.REMOVED
                row.save(update_fields=["status"])
                notify.push(row.author_id, kind="content.video.refused", title="Your reel was not posted",
                            body="It breaks the rules." if rejected
                            else "The video could not be processed. Post it again.",
                            ref_type="content", ref_id=row.id, dedupe_key=f"video-refused:{row.id}")
        elif playlist:
            rows.filter(status=Content.Status.DRAFT).update(media_url=playlist)


def record_view(content_id, viewer_id):
    """Count this person once per IST day for this post; return the post's
    view count.

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
    # Every view counts, the same person again too (16 Oct 2026, Rahul: "like
    # Instagram"); it was once per person per day. The day's ContentView row
    # stays — the 7-day insights and the 30-second check read it.
    Content.objects.filter(pk=row.id).update(view_count=F("view_count") + 1)
    try:
        with transaction.atomic():
            ContentView.objects.create(content_id=row.id, viewer_id=viewer_id, day=ist_today())
    except IntegrityError:
        # Seen today already: one more view on the day's row, which is how
        # a month's views are counted.
        ContentView.objects.filter(content_id=row.id, viewer_id=viewer_id, day=ist_today()).update(
            views=F("views") + 1)
    return Content.objects.values_list("view_count", flat=True).get(pk=row.id)


# ── qualified views (16 Oct 2026, Rahul) ────────────────────────────────────
# A view that earns: a reel played 30 seconds, a blog open 30 seconds, a
# like, comment or reshare on a post. Once per person per post per IST day,
# never the author's own. A reel's or a blog's is claimed by the app after
# 30 seconds, and the server checks the person's first view today is at
# least that old; a post's comes from the like, comment or reshare itself.
# Shares are not counted: the app only knows the sheet opened.

QUALIFY_AFTER_SECONDS = 25   # the app waits 30; a little slack for clocks
DEFAULT_PAISE_PER_THOUSAND = 2000
_REASON_FOR_KIND = {
    "clip": {"watch"},
    "article": {"read"},
    "post": {"like", "comment", "repost"},
}


def pay_rate():
    from .models import ContentPaySettings

    row = ContentPaySettings.objects.filter(pk=1).first()
    return row.paise_per_thousand if row else DEFAULT_PAISE_PER_THOUSAND


def qualify(content_id, viewer_id, reason, now=None):
    """Count a qualified view if this one is. Returns True when it counted.
    Never raises for a view that does not qualify: the caller is a like or a
    comment that has already succeeded, or a timer in the app."""
    from .models import QualifiedView

    now = now or timezone.now()
    row = public_content().filter(pk=content_id).only("id", "author_id", "kind").first()
    if row is None or viewer_id is None:
        return False
    if reason not in _REASON_FOR_KIND.get(row.kind, set()):
        return False
    if str(row.author_id).replace("-", "") == str(viewer_id).replace("-", ""):
        return False
    # Content earns for the Creator module only (docs/06 Phase 18).
    if not profile_services.is_creator(row.author_id):
        return False
    if reason in ("watch", "read"):
        seen = ContentView.objects.filter(content_id=row.id, viewer_id=viewer_id, day=ist_today()).first()
        if seen is None or (now - seen.created_at).total_seconds() < QUALIFY_AFTER_SECONDS:
            return False
    try:
        with transaction.atomic():
            QualifiedView.objects.create(content_id=row.id, author_id=row.author_id, viewer_id=viewer_id,
                                         day=ist_today(), reason=reason, paise_per_thousand=pay_rate(),
                                         created_at=now)
    except IntegrityError:
        return False  # counted today already
    return True


def content_earnings(author_id, range_key, start=None, end=None, now=None):
    """A Pro's or a Creator's content earnings for one period: what their
    qualified views earned at the rate each was counted at, plus commission
    from their links, tags and code. One figure, not the two (Rahul: "We
    will not show both earning separately"). Their posts with all-time views
    and the period's qualified views, newest first."""
    from django.db.models import Count, Sum

    from apps.consultants.earnings import _midnight, ist_today as ist_day, period
    from apps.consultants.models import Consultant, EarningsLedger
    from apps.referrals.models import CreatorEarning

    from .models import QualifiedView

    now = now or timezone.now()
    lo, hi = period(range_key, ist_day(now), start, end)

    def within(qs):
        qs = qs.filter(created_at__lte=now)
        if lo is not None:
            qs = qs.filter(created_at__gte=_midnight(lo))
        if hi is not None:
            qs = qs.filter(created_at__lt=_midnight(hi))
        return qs

    qualified = within(QualifiedView.objects.filter(author_id=author_id))
    views_pay = (qualified.aggregate(r=Sum("paise_per_thousand"))["r"] or 0) // 1000
    if Consultant.objects.filter(profile_id=author_id).exists():
        tags_pay = within(EarningsLedger.objects.filter(consultant_id=author_id, kind__startswith="Referral")
                          ).aggregate(n=Sum("net_paise"))["n"] or 0
    else:
        tags_pay = within(CreatorEarning.objects.filter(profile_id=author_id)).aggregate(n=Sum("amount_paise"))["n"] or 0

    # Sign-ups with their code (16 Oct 2026, Rahul: "Add this income in
    # content income"): ₹25 each, the console's figure, voided ones left out.
    from apps.referrals.models import SignupBonus

    joined = within(SignupBonus.objects.filter(referrer_id=author_id, status=SignupBonus.Status.EARNED))
    signups = joined.aggregate(n=Count("id"), p=Sum("amount_paise"))

    per_post = dict(qualified.values("content_id").annotate(n=Count("id")).values_list("content_id", "n"))
    posts = list(public_content().filter(author_id=author_id).order_by("-published_at")[:200])
    # The period's views, every one (16 Oct 2026, Rahul): the days' rows,
    # by IST day, as the periods are IST — up to yesterday, so the number
    # moves once a day ("yesterday tak ke view dikhayenge").
    seen = ContentView.objects.filter(content__author_id=author_id, day__lt=ist_day(now))
    if lo is not None:
        seen = seen.filter(day__gte=lo)
    if hi is not None:
        seen = seen.filter(day__lt=hi)
    period_views = seen.filter(created_at__lte=now).aggregate(n=Sum("views"))["n"] or 0
    return {
        "range": range_key,
        "from": lo.isoformat() if lo else None,
        "to": (hi - timezone.timedelta(days=1)).isoformat() if hi else None,
        "earnings_paise": views_pay + tags_pay + (signups["p"] or 0),
        "signups": {"count": signups["n"] or 0, "paise": signups["p"] or 0},
        "views": period_views,
        "views_all_time": sum(p.view_count or 0 for p in posts),
        "qualified_views": qualified.count(),
        "posts": [{
            "id": str(p.id), "kind": p.kind, "title": p.title, "caption": p.caption, "media_url": p.media_url,
            "published_at": p.published_at.isoformat() if p.published_at else None,
            "views": p.view_count or 0, "qualified_views": per_post.get(p.id, 0),
            "likes": p.like_count, "comments": p.comment_count, "reposts": p.repost_count,
        } for p in posts],
        "sales": tag_sales(author_id),
    }


def tag_sales(person_id):
    """What sold through this person's tags and links, together (16 Oct 2026,
    Rahul: "Combine both tags and referrals sales"), most sold first: shop
    products from every referred order (the sharer's cashback row, one per
    order, not cancelled) and Market listings bought through them. All
    time. `sales` is units for a product, purchases for a listing."""
    from django.db.models import Count, Max, Sum

    from apps.market.models import Purchase
    from apps.referrals.models import Cashback, CashbackStatus
    from apps.shop.models import OrderItem, Product

    orders = (Cashback.objects.filter(profile_id=person_id, side=Cashback.Side.REFERRER, order__isnull=False)
              .exclude(status=CashbackStatus.CANCELLED).values_list("order_id", flat=True))
    lines = (OrderItem.objects.filter(order_id__in=list(orders), item_type="product").values("item_id")
             .annotate(units=Sum("qty"), buyers=Count("order__profile_id", distinct=True),
                       title=Max("title"), last=Max("order__created_at")))
    images = dict(Product.objects.filter(id__in=[x["item_id"] for x in lines]).values_list("id", "image_url"))
    out = [{"id": str(x["item_id"]), "kind": "product", "name": x["title"],
            "image_url": images.get(x["item_id"]), "sales": x["units"], "buyers": x["buyers"]} for x in lines]
    listings = (Purchase.objects.filter(referrer_id=person_id).values("listing_id", "listing__title",
                                                                       "listing__cover_url", "listing__kind")
                .annotate(n=Count("id"), buyers=Count("buyer_id", distinct=True)))
    out += [{"id": str(x["listing_id"]), "kind": x["listing__kind"], "name": x["listing__title"],
             "image_url": x["listing__cover_url"], "sales": x["n"], "buyers": x["buyers"]} for x in listings]
    return sorted(out, key=lambda x: -x["sales"])


# ── reposts ──────────────────────────────────────────────────────────────────
# A repost is a `reactions` row of kind 'repost' (apps/reactions), so the
# app's durable-flag machinery toggles it like a like. These are its rules
# and its read side.

REPOST_OWN_REFUSAL = "You cannot reshare your own post"


def assert_repostable(target_type, target_id, actor_id):
    """Called by reactions.add_reaction before a repost row is written."""
    if target_type != Reaction.TargetType.CONTENT:
        raise ValidationError({"target_type": "Only posts and reels can be reshared"})
    _assert_not_blocked(actor_id)
    post = public_content().filter(pk=target_id).only("id", "author_id").first()
    if post is None:
        raise NotFound("That post is not available.")
    if str(post.author_id).replace("-", "") == str(actor_id).replace("-", ""):
        raise PermissionDenied(REPOST_OWN_REFUSAL)


def notify_repost(content_id, actor_id):
    """Tell the author. After the write and never raising (notify.push)."""
    from apps.notifications import services as notify

    post = Content.objects.filter(pk=content_id).only("author_id").first()
    if post is None:
        return
    from apps.profiles.models import Profile

    name = Profile.objects.filter(pk=actor_id).values_list("name", flat=True).first()
    notify.push(
        post.author_id,
        kind="content.repost",
        title=f"{name or 'Someone'} reshared your post",
        ref_type="content",
        ref_id=str(content_id),
    )


def _same(a, b):
    return str(a).replace("-", "") == str(b).replace("-", "")


def _actor_name(actor_id):
    from apps.profiles.models import Profile

    return Profile.objects.filter(pk=actor_id).values_list("name", flat=True).first()


def notify_like(content_id, actor_id):
    """Tell the author, at most once per post per IST hour (13 Oct 2026,
    docs/06 Phase 15a): ten likes in an hour are one notification, named
    after the first. Never raises (notify.push); not for your own post."""
    from apps.notifications import services as notify

    post = Content.objects.filter(pk=content_id).only("author_id").first()
    if post is None or _same(post.author_id, actor_id):
        return
    hour = (timezone.now() + timezone.timedelta(hours=5, minutes=30)).strftime("%Y%m%d%H")
    notify.push(
        post.author_id,
        kind="content.like",
        title=f"{_actor_name(actor_id) or 'Someone'} liked your post",
        ref_type="content",
        ref_id=str(content_id),
        dedupe_key=f"like:{content_id}:{hour}",
    )


def notify_follow(profile_id, actor_id):
    """Tell the person somebody followed them — once per pair, ever, so
    unfollowing and following again does not ring twice."""
    from apps.notifications import services as notify

    if _same(profile_id, actor_id):
        return
    notify.push(
        profile_id,
        kind="profile.follow",
        title=f"{_actor_name(actor_id) or 'Someone'} started following you",
        ref_type="profile",
        ref_id=str(actor_id),
        dedupe_key=f"follow:{actor_id}:{profile_id}",
    )


def list_reposts(*, by=None, limit=50):
    """Reshares, newest first: who reshared what, and when, with the post as
    the feed renders it. `by` narrows to one person's profile. A post that
    is no longer public drops out, and so does a blocked resharer."""
    qs = Reaction.objects.filter(
        kind=Reaction.Kind.REPOST, target_type=Reaction.TargetType.CONTENT
    )
    if by is not None:
        qs = qs.filter(actor_id=by)
    blocked = RawSQL(
        "select count(*) from profiles p"
        f" where {_xid('p.id', 'reactions.actor_id')} and p.blocked_at is not null",
        [],
        output_field=models.IntegerField(),
    )
    events = list(
        qs.annotate(_blocked=blocked)
        .filter(_blocked=0)
        .annotate(actor_name=profile_services.name_subquery("actor_id"))
        .annotate(actor_avatar=profile_services.avatar_subquery("actor_id"))
        .order_by("-created_at")[: limit * 2]  # headroom for posts that drop out
    )
    posts = {
        str(p.id).replace("-", ""): p
        for p in attach_products(public_content().filter(pk__in=[e.target_id for e in events]))
    }
    out = []
    for e in events:
        post = posts.get(str(e.target_id).replace("-", ""))
        if post is not None:
            out.append((e, post))
        if len(out) == limit:
            break
    return out


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
    limits.check(Comment.objects.filter(author_id=author_id), limits.COMMENTS)
    row = _with_name(Comment.objects.create(content_id=post.id, author_id=author_id, body=text))
    qualify(post.id, author_id, "comment")  # a comment on a post earns its author (16 Oct 2026)
    from . import moderation

    moderation.scan_comment(row)  # the daily queue's finders (Phase 15d)

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
    from apps.market import services as market

    market.attach_tags(rows)
    from apps.bhakti import services as bhakti

    bhakti.attach_tags(rows)

    tagged_authors = {r.author_id for r in rows if by_content.get(r.id) or r._listings or r._ebooks}
    codes = {
        c.profile_id: c.code
        for c in ReferralCode.objects.filter(
            profile_id__in=tagged_authors, kind=CodeKind.CONSULTANT, active=True
        )
    }
    from apps.profiles.models import Profile

    referrers = set(
        Profile.objects.filter(Q(referrer=True) | Q(influencer=True), id__in=tagged_authors,
                               blocked_at__isnull=True)
        .values_list("id", flat=True)
    )
    for r in rows:
        r._products = by_content.get(r.id, [])
        # Only a code that earns is worth carrying: Content step 1 or 2
        # (17 Oct 2026; an approved consultant's still rides along, though
        # the visit pays only step 1). An admin-authored tag has nobody
        # behind it.
        earns = r._approved or r.author_id in referrers
        r._shop_ref = codes.get(r.author_id) if (r._products or r._listings or r._ebooks) and earns else None
    return rows


_UNSET = object()


def edit_content(content_id, actor_id, role, *, title=_UNSET, body=_UNSET, caption=_UNSET,
                 media_url=_UNSET, product_ids=None, listing_ids=None, ebook_ids=None,
                 gallery=_UNSET):
    """The author changes their own post, reel or blog (6 Oct 2026, Rahul:
    "edit button in blog and all posts"). Owner-scoped like remove, admin
    excepted. The kind never changes — a reel is not edited into a blog —
    and a removed post stays removed. Only the fields sent are touched;
    `product_ids`, when sent, replaces the tags in one write with the rest,
    under the same rules as publishing them."""
    row = Content.objects.filter(pk=content_id).first()
    if row is None or row.status == Content.Status.REMOVED:
        raise NotFound("That post is not available.")
    if str(row.author_id) != str(actor_id) and role != "admin":
        raise PermissionDenied("You can only edit your own posts.")
    changes = {k: v for k, v in (("title", title), ("body", body), ("caption", caption),
                                  ("media_url", media_url)) if v is not _UNSET}
    after = {f: changes.get(f, getattr(row, f)) for f in ("title", "body", "caption", "media_url")}
    if row.kind == Content.Kind.ARTICLE and not ((after["title"] or "").strip() and (after["body"] or "").strip()):
        raise ValidationError({"body": "A blog needs a title and a body."})
    if row.kind == Content.Kind.CLIP and not after["media_url"]:
        raise ValidationError({"media_url": "A reel needs its video."})
    if row.kind == Content.Kind.POST and (gallery is not _UNSET or "media_url" in changes):
        changes["gallery"] = clean_gallery(row.gallery if gallery is _UNSET else gallery,
                                           after["media_url"])
    products = None if product_ids is None else _checked_products(row.author_id, role, product_ids)
    n = len(products) if products is not None else ContentProduct.objects.filter(content=row).count()
    if listing_ids is not None:
        listings = _checked_listings(row.author_id, role, listing_ids, n)
    if ebook_ids is not None:
        from apps.market.models import ListingTag

        n_listings = len(listings) if listing_ids is not None else ListingTag.objects.filter(content_id=row.id).count()
        ebooks = _checked_ebooks(row.author_id, role, ebook_ids, n + n_listings)
    with transaction.atomic():
        for field, value in changes.items():
            setattr(row, field, value)
        if changes:
            row.save(update_fields=list(changes))
        if products is not None:
            ContentProduct.objects.filter(content=row).delete()
            ContentProduct.objects.bulk_create(
                ContentProduct(content=row, product=p, sort=i) for i, p in enumerate(products)
            )
        if listing_ids is not None:
            from apps.market import services as market

            market.set_tags(row.id, listings)
        if ebook_ids is not None:
            from apps.bhakti import services as bhakti

            bhakti.set_tags(row.id, ebooks)
    if products or listing_ids or ebook_ids:
        from apps.referrals import services as referral_services
        from apps.referrals.models import CodeKind

        referral_services.code_for(row.author_id, CodeKind.CONSULTANT)
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


# How long after a call or chat it can still be reviewed (17 Oct 2026).
SESSION_REVIEW_DAYS = 7


def _session_reviewable(session, seeker_id, consultant_id):
    return (
        session is not None
        and session["seeker_id"] == str(seeker_id)
        and session["consultant_id"] == str(consultant_id)
        and session["status"] == "ended"
        and session["recent"]
    )


def leave_review(seeker_id, *, consultant_id, rating, body=None, booking_id=None, session_id=None):
    """THE ANTI-FRAUD RULE, re-expressed. A review requires a booking that is
    the caller's own and COMPLETED — not pending, not confirmed — and names
    the same consultant as the booking. booking_id is unique: one booking
    buys one review, and the unique index (not a read-before-write) decides
    the race.

    Or a call or chat (17 Oct 2026, Rahul): the caller's own, ENDED after
    it connected, within SESSION_REVIEW_DAYS, same consultant; session_id
    is unique the same way.

    Every review arrives PENDING and waits for the console (17 Oct 2026,
    Rahul). It is not public and not in the rating until approved, so the
    cache does not move here."""
    if (booking_id is None) == (session_id is None):
        raise PermissionDenied(GATE_REFUSAL)
    if booking_id is not None:
        booking = gateway.booking_for_review(booking_id)
        if (
            booking is None
            or booking["seeker_id"] != str(seeker_id)
            or booking["consultant_id"] != str(consultant_id)
            or booking["status"] != "completed"
        ):
            raise PermissionDenied(GATE_REFUSAL)
    elif not _session_reviewable(
        gateway.session_for_review(session_id, timezone.now() - timezone.timedelta(days=SESSION_REVIEW_DAYS)),
        seeker_id, consultant_id,
    ):
        raise PermissionDenied(GATE_REFUSAL)
    with transaction.atomic():
        try:
            with transaction.atomic():  # savepoint: the lost race only rolls back the insert
                review = Review.objects.create(
                    booking_id=booking_id,
                    session_id=session_id,
                    seeker_id=seeker_id,
                    consultant_id=consultant_id,
                    rating=rating,
                    body=body,
                    status=Review.Status.PENDING,
                )
        except IntegrityError:
            # 23505 on reviews_booking_id_key — the check's "one booking,
            # one review", answered with its own sentence.
            raise DuplicateReview(DUPLICATE_REFUSAL) from None
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
            "verified": r.booking_id is not None or r.session_id is not None,
            "reviewer_name": _reviewer_name(names.get(str(r.seeker_id), "")),
        }
        for r in rows
    ]


def reviewable_bookings(seeker_id):
    """The 020 gate's positive half, for the client's Review affordance."""
    return gateway.reviewable_bookings(seeker_id)


def reviewable_sessions(seeker_id, now=None):
    """The session gate's positive half: what the after-call ask may offer."""
    now = now or timezone.now()
    return gateway.reviewable_sessions(seeker_id, now - timezone.timedelta(days=SESSION_REVIEW_DAYS))


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


def follow_list(profile_id, which, limit=200):
    """Who follows this person, or whom they follow — names and pictures,
    newest first (5 Oct 2026). The view only ever passes the caller's own id:
    a follow list is the caller's to read, not anybody's to browse."""
    from apps.consultants.models import Consultant
    from apps.profiles.models import Profile

    targets = [Reaction.TargetType.PROFILE, Reaction.TargetType.CONSULTANT]
    rows = Reaction.objects.filter(kind=Reaction.Kind.FOLLOW, target_type__in=targets)
    if which == "followers":
        ids = rows.filter(target_id=profile_id).order_by("-created_at").values_list("actor_id", flat=True)
    else:
        ids = rows.filter(actor_id=profile_id).order_by("-created_at").values_list("target_id", flat=True)
    ids = list(dict.fromkeys(str(i) for i in ids[:limit]))
    people = {str(p.id): p for p in Profile.objects.filter(id__in=ids, blocked_at=None)}
    pros = set(str(i) for i in Consultant.objects.filter(
        profile_id__in=ids, status="approved").values_list("profile_id", flat=True))
    return [
        {"id": i, "name": people[i].name or "NAMO member",
         "avatar_url": people[i].avatar_url, "is_consultant": i in pros}
        for i in ids if i in people
    ]


SUGGEST_ACTIVE_DAYS = 14


def suggest_follows(viewer_id, *, limit=10):
    """People to follow (13 Oct 2026, docs/06 Phase 15a). First, people
    followed by the people you follow, most shared first ("Followed by
    Tara"); then authors who posted most in the last two weeks ("Active
    this week"). Never you, nobody you already follow, nobody blocked.
    Signed out, only the active authors."""
    from collections import Counter

    from apps.consultants.models import Consultant
    from apps.profiles.models import Profile

    targets = [Reaction.TargetType.PROFILE, Reaction.TargetType.CONSULTANT]
    follows = Reaction.objects.filter(kind=Reaction.Kind.FOLLOW, target_type__in=targets)
    mine = set()
    picks = []  # (profile id, reason) in order
    if viewer_id is not None:
        mine = {str(t).replace("-", "") for t in follows.filter(actor_id=viewer_id).values_list("target_id", flat=True)}
        shared = Counter()
        via = {}
        for actor, target in follows.filter(actor_id__in=[m for m in mine]).values_list("actor_id", "target_id"):
            key = str(target).replace("-", "")
            shared[key] += 1
            via.setdefault(key, str(actor).replace("-", ""))
        picks += [(k, ("via", via[k])) for k, _ in shared.most_common(limit * 3)]

    since = timezone.now() - timezone.timedelta(days=SUGGEST_ACTIVE_DAYS)
    active = Counter(
        str(a).replace("-", "")
        for a in public_content().filter(published_at__gte=since).values_list("author_id", flat=True)
    )
    picks += [(k, ("active", None)) for k, _ in active.most_common(limit * 3)]

    me = str(viewer_id).replace("-", "") if viewer_id is not None else None
    seen, order = set(), []
    for key, reason in picks:
        if key == me or key in mine or key in seen:
            continue
        seen.add(key)
        order.append((key, reason))

    people = {
        str(p.id).replace("-", ""): p
        for p in Profile.objects.filter(id__in=[k for k, _ in order] + [r[1] for _, r in order if r[1]], blocked_at=None)
    }
    pros = {
        str(i).replace("-", "")
        for i in Consultant.objects.filter(profile_id__in=[k for k, _ in order], status="approved").values_list("profile_id", flat=True)
    }
    out = []
    for key, (why, via_id) in order:
        p = people.get(key)
        if p is None:
            continue
        if why == "via":
            friend = people.get(via_id)
            reason = f"Followed by {(friend.name if friend else None) or 'people you follow'}"
        else:
            reason = "Active this week"
        out.append({
            "id": str(p.id), "name": p.name or "NAMO member", "avatar_url": p.avatar_url,
            "is_consultant": key in pros, "reason": reason,
        })
        if len(out) == limit:
            break
    return out


def _follow_between(a, b):
    """True when either of two profiles follows the other."""
    if not a or not b:
        return False
    targets = [Reaction.TargetType.PROFILE, Reaction.TargetType.CONSULTANT]
    return Reaction.objects.filter(kind=Reaction.Kind.FOLLOW, target_type__in=targets).filter(
        models.Q(actor_id=a, target_id=b) | models.Q(actor_id=b, target_id=a)
    ).exists()


def fetch_author(profile_id, viewer_id=None):
    """A person's public page header: name, username, picture, ticks.
    Anybody who is not blocked (17 Oct 2026, Rahul: "We are social network";
    before that only people with a live post, or a follow between you).
    Nothing private: no birth details, phone or email."""
    from apps.profiles.models import Profile

    if not Profile.objects.filter(id=profile_id, blocked_at=None).exists():
        return None
    name = gateway.profile_name(profile_id)
    if name is None:
        return None
    # A consultant's one public page is /consult/:id (6 Oct 2026): the app
    # forwards /u/:id there when this is true.
    return {"id": str(profile_id), "name": name,
            "username": gateway.profile_username(profile_id),
            "is_consultant": bool(gateway.is_approved_consultant(profile_id)),
            "is_creator": profile_services.is_creator(profile_id),
            # Their photo for the page's header (14 Oct 2026): /u/:id drew
            # initials only, because this never carried it.
            "avatar_url": Profile.objects.filter(pk=profile_id).values_list("avatar_url", flat=True).first()}


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


def list_commented(actor_id, *, limit=50):
    """Somebody else's posts you commented on, newest comment first, each
    once with your latest comment on it — your Profile's Commented tab (13
    Oct 2026, Rahul). Yours alone: the view is signed in and scoped to you.
    A post that is no longer public drops out."""
    mine = list(
        Comment.objects.filter(author_id=actor_id, status=Comment.Status.LIVE)
        .exclude(content__author_id=actor_id)
        .order_by("-created_at")[: limit * 4]
    )
    latest = {}
    for c in mine:
        latest.setdefault(str(c.content_id).replace("-", ""), c)
    posts = {
        str(p.id).replace("-", ""): p
        for p in attach_products(public_content().filter(pk__in=[c.content_id for c in latest.values()]))
    }
    out = []
    for key, c in latest.items():
        if key in posts:
            out.append((c, posts[key]))
        if len(out) == limit:
            break
    return out
