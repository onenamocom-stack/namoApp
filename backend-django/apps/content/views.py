from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_409_CONFLICT

from apps.core.views import refusal_body

from . import ranking, services
from .models import Content, Report
from .services import AlreadyReported, DuplicateReview


class PublishInput(serializers.Serializer):
    """What the client sends — exactly the columns the 025 insert grant
    names (author_id, kind, title, body, media_url, caption, status,
    published_at) minus author_id, which the server fills from the verified
    JWT (rule 3), minus published_at, which is the server's clock, minus
    legacy_id, which belongs to the seed."""

    kind = serializers.ChoiceField(choices=Content.Kind.choices)
    title = serializers.CharField(required=False, allow_null=True, default=None)
    body = serializers.CharField(required=False, allow_null=True, default=None)
    caption = serializers.CharField(required=False, allow_null=True, default=None)
    media_url = serializers.CharField(required=False, allow_null=True, default=None)
    # The photos after media_url on a post (17 Oct 2026), up to nine.
    gallery = serializers.ListField(child=serializers.CharField(max_length=1000), required=False,
                                    default=list, max_length=20)
    status = serializers.ChoiceField(
        choices=[Content.Status.LIVE, Content.Status.DRAFT],
        required=False,
        default=Content.Status.LIVE,
    )
    # Shop products to tag (ContentProduct). The limit and the "approved
    # consultants only" rule are the service's, so the refusal sentence is
    # the same whichever door the request came through.
    product_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )
    # Market listings to tag (15 Oct 2026): downloads, courses, events.
    listing_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    # Namo's e-books to tag (15 Oct 2026).
    ebook_ids = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    # Post into a group you are a member of (Phase 15c).
    group_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    # A reel from the video pipeline (/v1/videos/, 18 Oct 2026), in place
    # of media_url: the post waits until the video is live.
    video_id = serializers.UUIDField(required=False, allow_null=True, default=None)


class EditInput(serializers.Serializer):
    """Only what the author may change. A field left out is left alone."""

    title = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    body = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    caption = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    media_url = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    gallery = serializers.ListField(child=serializers.CharField(max_length=1000), required=False,
                                    max_length=20)
    product_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    listing_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    ebook_ids = serializers.ListField(child=serializers.UUIDField(), required=False)


class FeedQuery(serializers.Serializer):
    kinds = serializers.CharField(required=False, default="")
    limit = serializers.IntegerField(required=False, default=40, min_value=1, max_value=200)
    after = serializers.UUIDField(required=False, allow_null=True, default=None)


def _public_row(row):
    """A content_public row, snake_case exactly as the 025 view projects it.
    The client derives its own initials/time labels from these (shape() in
    src/lib/content.js does the rendering)."""
    return {
        "id": str(row.id),
        "author_id": str(row.author_id),
        "author_name": row.author_name,
        "author_avatar": getattr(row, "author_avatar", None),
        # The group it was posted in, or null (Phase 15c).
        "group": {"id": str(row.group_id), "name": getattr(row, "group_name", None) or ""} if getattr(row, "group_id", None) else None,
        # The blue tick (13 Oct 2026); a consultant's is orange, from
        # author_is_consultant.
        "author_is_creator": bool(getattr(row, "author_creator", False)),
        "author_is_consultant": bool(row._approved),
        "kind": row.kind,
        "title": row.title,
        "body": row.body,
        "media_url": row.media_url,
        "gallery": list(getattr(row, "gallery", None) or []),
        "caption": row.caption,
        "view_count": row.view_count,
        # The reader watched it in the last two weeks (the for-you feed only;
        # ranking.py puts these after everything new, 19 Oct 2026).
        "seen": bool(getattr(row, "_seen", False)),
        "published_at": row.published_at,
        "like_count": row.like_count,
        "save_count": row.save_count,
        "comment_count": row.comment_count,
        "repost_count": row.repost_count,
        # Tagged shop products, and the author's A code for the link to carry
        # (services.attach_products). Empty and null on an untagged post.
        "products": [
            {
                "id": str(p.id),
                "name": p.name,
                "image_url": p.image_url,
                "price_paise": p.price_paise,
                "mrp_paise": p.mrp_paise,
            }
            for p in getattr(row, "_products", [])
        ],
        # Tagged Market listings (15 Oct 2026); the same code carries.
        "listings": [
            {
                "id": str(x.id),
                "kind": x.kind,
                "title": x.title,
                "cover_url": x.cover_url,
                "price_paise": x.price_paise,
                "mrp_paise": x.mrp_paise,
            }
            for x in getattr(row, "_listings", [])
        ],
        # Tagged e-books, Namo's own downloads (15 Oct 2026).
        "ebooks": [
            {
                "id": str(x.id),
                "title": x.title,
                "cover_url": x.preview_url or "",
                "price_paise": x.price_paise or 0,
                "mrp_paise": x.mrp_paise,
            }
            for x in getattr(row, "_ebooks", [])
        ],
        "shop_ref": getattr(row, "_shop_ref", None),
    }


def _review_row(row):
    return {
        "id": row["id"],
        "consultant_id": row["consultant_id"],
        "rating": row["rating"],
        "body": row["body"],
        "solved": row["solved"],
        "created_at": row["created_at"],
        "verified": row["verified"],
        "reviewer_name": row["reviewer_name"],
    }


def _without_blocked(request, rows):
    """The rows minus the authors the signed-in reader blocked."""
    if not request.user or not request.user.is_authenticated:
        return rows
    from apps.dms.services import blocked_by

    hidden = {str(x).replace("-", "") for x in blocked_by(request.user.pk)}
    return [r for r in rows if str(r.author_id).replace("-", "") not in hidden] if hidden else rows


@api_view(["GET"])
@permission_classes([AllowAny])
def feed(request):
    """The feed — newest live content first, from every seeker and every
    approved consultant (docs/05 §5.3). Anonymous, exactly as the
    content_public grant is to anon; keyset-paginated with `after`."""
    query = FeedQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    data = query.validated_data
    kinds = [k for k in (data["kinds"] or "").split(",") if k] or None
    rows, next_after = services.feed_page(
        kinds=kinds, after_id=data["after"], limit=data["limit"]
    )
    rows = _without_blocked(request, rows)
    rows = services.attach_products(rows)
    return Response({"results": [_public_row(r) for r in rows], "next_after": next_after})


class ForYouQuery(serializers.Serializer):
    kinds = serializers.CharField(required=False, default="")
    limit = serializers.IntegerField(required=False, default=40, min_value=1, max_value=200)


@api_view(["GET"])
@permission_classes([AllowAny])
def for_you(request):
    """Home's and Reels' feed, ordered for the reader (13 Oct 2026, Rahul):
    `ranking.py` has the rules. Signed out, it is fresh and popular posts.
    One page; the client never asked for a second."""
    query = ForYouQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    data = query.validated_data
    kinds = [k for k in (data["kinds"] or "").split(",") if k] or None
    viewer = request.user.pk if request.user and request.user.is_authenticated else None
    # Everybody's posts, plus the posts of the reader's own groups (Phase 15c).
    from django.db.models import Q

    from apps.groups import services as group_services

    qs = services.public_content().filter(
        Q(group_id__isnull=True) | Q(group_id__in=group_services.my_group_ids(viewer))
    )
    if kinds:
        qs = qs.filter(kind__in=kinds)
    # Nobody the reader blocked (19 Oct 2026).
    from apps.dms.services import blocked_by

    hidden = blocked_by(viewer)
    if hidden:
        qs = qs.exclude(author_id__in=hidden)
    rows = ranking.for_you(qs, viewer, limit=data["limit"])
    rows = services.attach_products(rows)
    return Response({"results": [_public_row(r) for r in rows]})


class TagQuery(serializers.Serializer):
    sort = serializers.ChoiceField(choices=["new", "top"], required=False, default="new")
    limit = serializers.IntegerField(required=False, default=60, min_value=1, max_value=200)


@api_view(["GET"])
@permission_classes([AllowAny])
def by_tag(request, tag):
    """A hashtag's page: newest or top posts carrying it (Phase 15a)."""
    query = TagQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    rows = services.by_tag(tag, sort=query.validated_data["sort"], limit=query.validated_data["limit"])
    rows = services.attach_products(rows)
    return Response({"tag": tag.lstrip("#"), "results": [_public_row(r) for r in rows]})


class ByAuthorQuery(serializers.Serializer):
    author_id = serializers.UUIDField()
    limit = serializers.IntegerField(required=False, default=40, min_value=1, max_value=200)


@api_view(["GET"])
@permission_classes([AllowAny])
def by_author(request):
    """One person's published work — their profile tab and the studio list.
    Through the same public projection: drafts and removed rows never leave
    the table."""
    query = ByAuthorQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    data = query.validated_data
    rows, _ = services.by_author_page(data["author_id"], limit=data["limit"])
    rows = services.attach_products(rows)
    return Response([_public_row(r) for r in rows])


@api_view(["GET"])
@permission_classes([AllowAny])
def detail(request, content_id):
    """One live post. A draft or removed row is a 404, not a 403 — the
    public projection cannot see it, so ids do not leak existence."""
    row = services.public_detail(content_id)
    services.attach_products([row])
    return Response(_public_row(row))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def publish(request):
    """The studio's "Published to your feed" toast becomes a row. The kind
    gate is the 025 insert policy: post/article for anyone, clip only for an
    approved consultant (403 with the sentence the interface shows)."""
    serializer = PublishInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    row = services.publish_content(
        request.user.pk,
        getattr(request.user, "role", ""),
        kind=data["kind"],
        title=data["title"],
        body=data["body"],
        caption=data["caption"],
        media_url=data["media_url"],
        status=data["status"],
        product_ids=data["product_ids"],
        listing_ids=data["listing_ids"],
        ebook_ids=data["ebook_ids"],
        group_id=data["group_id"],
        gallery=data["gallery"],
        video_id=data["video_id"],
    )
    return Response({"id": str(row.id), "status": row.status}, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def edit(request, content_id):
    """The author's own post, reel or blog, changed in place (6 Oct 2026)."""
    serializer = EditInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = dict(serializer.validated_data)
    product_ids = data.pop("product_ids", None)
    listing_ids = data.pop("listing_ids", None)
    ebook_ids = data.pop("ebook_ids", None)
    row = services.edit_content(
        content_id, request.user.pk, getattr(request.user, "role", ""),
        product_ids=product_ids, listing_ids=listing_ids, ebook_ids=ebook_ids, **data,
    )
    return Response({"ok": True, "id": str(row.id)})


class RepostsQuery(serializers.Serializer):
    by = serializers.UUIDField(required=False, allow_null=True, default=None)
    limit = serializers.IntegerField(required=False, default=50, min_value=1, max_value=200)


@api_view(["GET"])
@permission_classes([AllowAny])
def reposts(request):
    """Reshares, newest first — the feed's "X reshared" items, or one
    person's profile with `by`. Anonymous, like the feed. Who reshared is
    public by design: resharing is saying so in public."""
    query = RepostsQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    data = query.validated_data
    rows = services.list_reposts(by=data["by"], limit=data["limit"])
    return Response([
        {
            "reposted_by": str(event.actor_id),
            "reposted_by_name": event.actor_name,
            "reposted_by_avatar": getattr(event, "actor_avatar", None),
            "reposted_at": event.created_at,
            "note": event.note,
            "post": _public_row(post),
        }
        for event, post in rows
    ])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def commented(request):
    """Somebody else's posts you commented on, with your latest comment —
    your Profile's Commented tab (13 Oct 2026). Yours only."""
    return Response([
        {
            "comment": {"id": str(c.id), "body": c.body, "created_at": c.created_at},
            "post": _public_row(post),
        }
        for c, post in services.list_commented(request.user.pk)
    ])


def _comment_row(c):
    return {
        "id": str(c.id),
        "author_id": str(c.author_id),
        "author_name": c.author_name,
        "body": c.body,
        "created_at": c.created_at,
    }


class CommentInput(serializers.Serializer):
    # Length is checked in the service, so the refusal sentence is its own.
    body = serializers.CharField(allow_blank=True, trim_whitespace=False)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def comments(request, content_id):
    """GET: a post's live comments, oldest first — anonymous, like the feed.
    POST: comment as the caller; signed in, not blocked."""
    if request.method == "GET":
        rows = services.list_comments(content_id)
        # Not the comments of anybody the reader blocked (19 Oct 2026).
        if request.user and request.user.is_authenticated:
            from apps.dms.services import blocked_by

            hidden = {str(x).replace("-", "") for x in blocked_by(request.user.pk)}
            rows = [c for c in rows if str(c.author_id).replace("-", "") not in hidden]
        return Response([_comment_row(c) for c in rows])
    if not request.user or not request.user.is_authenticated:
        return Response(refusal_body("unauthenticated", "Sign in to comment."), status=401)
    data = CommentInput(data=request.data)
    data.is_valid(raise_exception=True)
    row = services.add_comment(content_id, request.user.pk, data.validated_data["body"])
    return Response(_comment_row(row), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_comment(request, comment_id):
    """Soft delete: the commenter, the post's author, or an admin."""
    services.remove_comment(comment_id, request.user.pk, getattr(request.user, "role", ""))
    return Response({"removed": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def record_view(request, content_id):
    """This person opened the post: every view counts (16 Oct 2026);
    returns the post's view count."""
    views = services.record_view(content_id, request.user.pk)
    return Response({"views": views})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def qualify(request, content_id):
    """The app's 30-second claim for a reel (`watch`) or a blog (`read`).
    `{counted}`: false when it does not qualify or was counted today."""
    reason = request.data.get("reason")
    if reason not in ("watch", "read"):
        return Response(refusal_body("bad_reason", "Say watch or read."), status=400)
    return Response({"counted": services.qualify(content_id, request.user.pk, reason)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_content_earnings(request):
    """The caller's content earnings for one period and their posts with
    views and qualified views (16 Oct 2026)."""
    from apps.consultants.earnings import BadRange

    q = request.query_params
    try:
        return Response(services.content_earnings(request.user.pk, q.get("range", "this_month"),
                                                  q.get("from"), q.get("to")))
    except BadRange as exc:
        return Response(refusal_body("bad_range", str(exc)), status=400)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove(request, content_id):
    """Soft delete, owner-scoped (admin excepted). Never a DELETE — a removed
    post in a dispute is evidence (020)."""
    services.remove_content(content_id, request.user.pk, getattr(request.user, "role", ""))
    return Response({"removed": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def publish_draft(request, content_id):
    """Draft -> live: stamps published_at with the server's clock."""
    row = services.publish_draft(content_id, request.user.pk, getattr(request.user, "role", ""))
    return Response({"id": str(row.id), "status": row.status, "published_at": row.published_at})


class ReviewInput(serializers.Serializer):
    """The 020 insert grant's column list (booking_id, seeker_id,
    consultant_id, rating, body) minus seeker_id, filled from the JWT. There
    is deliberately no `status` field: the server decides it from the
    rating (20 Oct 2026). A booking or a session, not both. `solved` is the
    seeker's "Is your answer solved", Yes or No."""

    booking_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    session_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    consultant_id = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    body = serializers.CharField(required=False, allow_null=True, allow_blank=True, default=None, max_length=1000)
    solved = serializers.BooleanField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        if (attrs["booking_id"] is None) == (attrs["session_id"] is None):
            raise serializers.ValidationError("Review a booking or a session.")
        return attrs


class ReviewsQuery(serializers.Serializer):
    consultant_id = serializers.UUIDField()
    limit = serializers.IntegerField(required=False, default=20, min_value=1, max_value=100)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def reviews(request):
    """GET: a consultant's reviews as reviews_public projects them — verified
    derived, the reviewer named "Tara V.", live rows only. Anonymous, per the
    view's grant. POST: the anti-fraud gate (see services.leave_review)."""
    if request.method == "GET":
        query = ReviewsQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        return Response(
            [_review_row(r) for r in services.list_reviews(data["consultant_id"], limit=data["limit"])]
        )

    if not (request.user and request.user.is_authenticated):
        return Response(refusal_body("unauthenticated", "Sign in to continue."), status=401)
    serializer = ReviewInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        review = services.leave_review(
            request.user.pk,
            booking_id=data["booking_id"],
            session_id=data["session_id"],
            consultant_id=data["consultant_id"],
            rating=data["rating"],
            body=data["body"] or None,
            solved=data["solved"],
        )
    except DuplicateReview as exc:
        return Response(refusal_body("duplicate", str(exc)), status=HTTP_409_CONFLICT)
    return Response({"id": str(review.id)}, status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reviewable(request):
    """Bookings this seeker has completed and not yet reviewed — the gate's
    positive half, so the Review button never appears on something the server
    would refuse."""
    return Response(services.reviewable_bookings(request.user.pk))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reviewable_sessions(request):
    """Calls and chats this seeker finished in the last week and has not
    reviewed: what the ask after a call may offer (17 Oct 2026)."""
    return Response(services.reviewable_sessions(request.user.pk))


class FollowCountsQuery(serializers.Serializer):
    profile_id = serializers.UUIDField()


@api_view(["GET"])
@permission_classes([AllowAny])
def follow_counts(request):
    query = FollowCountsQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    return Response(services.follow_counts(query.validated_data["profile_id"]))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def follow_list(request, which):
    """Your followers or whom you follow. Your own only — there is no
    profile_id parameter to put somebody else's id in."""
    if which not in ("followers", "following"):
        return Response(refusal_body("not_found", "No such list."), status=404)
    return Response({"items": services.follow_list(request.user.pk, which)})


@api_view(["GET"])
@permission_classes([AllowAny])
def suggestions(request):
    """People to follow (Phase 15a); signed out, the active authors."""
    viewer = request.user.pk if request.user and request.user.is_authenticated else None
    return Response({"items": services.suggest_follows(viewer)})


@api_view(["GET"])
@permission_classes([AllowAny])
def author(request, profile_id):
    """A published author's public name, for /u/:id. A profile with no live
    content is a 404 — publishing is what puts a name on a screen (025)."""
    viewer = request.user.pk if request.user.is_authenticated else None
    row = services.fetch_author(profile_id, viewer)
    if row is None:
        return Response(refusal_body("not_found", "That author is not available."), status=404)
    return Response(row)


# ── reporting ───────────────────────────────────────────────────────────────


class ReportInput(serializers.Serializer):
    """The reason is a closed list; the note is the escape hatch.

    `subject_id` is for reporting a PERSON. Exactly one of the two routes
    supplies a target, so it is not on this serializer — the URL says which
    kind of report this is.
    """

    reason = serializers.ChoiceField(choices=Report.Reason.choices)
    note = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=2000,
    )


def _report(request, filer):
    serializer = ReportInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        result = filer(reason=data["reason"], note=data.get("note"))
    except AlreadyReported:
        # 200, not 409. The seeker's intent was "I have told you about
        # this", and it is true — telling them they already did invites a
        # second tap hunting for a different outcome.
        return Response({"ok": True, "already": True})
    return Response(result, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def report_content(request, content_id):
    """Report one post. The ⋯ menu on a feed card and on a reel."""
    return _report(request, lambda **kw: services.report_content(
        request.user.pk, content_id, **kw))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def report_profile(request, profile_id):
    """Report a person. Their profile page, under the same ⋯."""
    return _report(request, lambda **kw: services.report_profile(
        request.user.pk, profile_id, **kw))
