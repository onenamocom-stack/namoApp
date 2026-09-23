from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_409_CONFLICT

from apps.core.views import refusal_body

from . import services
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
    status = serializers.ChoiceField(
        choices=[Content.Status.LIVE, Content.Status.DRAFT],
        required=False,
        default=Content.Status.LIVE,
    )


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
        "author_is_consultant": bool(row._approved),
        "kind": row.kind,
        "title": row.title,
        "body": row.body,
        "media_url": row.media_url,
        "caption": row.caption,
        "view_count": row.view_count,
        "published_at": row.published_at,
        "like_count": row.like_count,
        "save_count": row.save_count,
    }


def _review_row(row):
    return {
        "id": row["id"],
        "consultant_id": row["consultant_id"],
        "rating": row["rating"],
        "body": row["body"],
        "created_at": row["created_at"],
        "verified": row["verified"],
        "reviewer_name": row["reviewer_name"],
    }


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
    return Response({"results": [_public_row(r) for r in rows], "next_after": next_after})


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
    return Response([_public_row(r) for r in rows])


@api_view(["GET"])
@permission_classes([AllowAny])
def detail(request, content_id):
    """One live post. A draft or removed row is a 404, not a 403 — the
    public projection cannot see it, so ids do not leak existence."""
    row = services.public_detail(content_id)
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
    )
    return Response({"id": str(row.id)}, status=201)


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
    is deliberately no `status` field: a review arrives live or not at all,
    and only moderation moves it."""

    booking_id = serializers.UUIDField()
    consultant_id = serializers.UUIDField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    body = serializers.CharField(required=False, allow_null=True, default=None)


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
            consultant_id=data["consultant_id"],
            rating=data["rating"],
            body=data["body"],
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


class FollowCountsQuery(serializers.Serializer):
    profile_id = serializers.UUIDField()


@api_view(["GET"])
@permission_classes([AllowAny])
def follow_counts(request):
    query = FollowCountsQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    return Response(services.follow_counts(query.validated_data["profile_id"]))


@api_view(["GET"])
@permission_classes([AllowAny])
def author(request, profile_id):
    """A published author's public name, for /u/:id. A profile with no live
    content is a 404 — publishing is what puts a name on a screen (025)."""
    row = services.fetch_author(profile_id)
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
