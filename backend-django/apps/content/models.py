import uuid

from django.db import models
from django.utils import timezone


class ContentKind(models.TextChoices):
    POST = "post", "Post"
    ARTICLE = "article", "Article"
    CLIP = "clip", "Clip"
    LIVE_SESSION = "live_session", "Live session"


class ContentStatus(models.TextChoices):
    LIVE = "live", "Live"
    REMOVED = "removed", "Removed"
    DRAFT = "draft", "Draft"


class Content(models.Model):
    """One row of the `content` table (docs/05-BACKEND-SCHEMA.md §5.2).

    Maps 1:1 onto backend/schema/020_content_reviews.sql as amended by
    025_seekers_publish.sql, which renamed `consultant_id` to `author_id` and
    repointed the key at `profiles(id)` because seekers publish too. The
    migration it generates is faked in at cutover (`migrate --fake-initial`) —
    every constraint and index name below is the name Postgres already
    carries.

    author_id is a bare UUIDField, not an FK: the SQL references profiles(id)
    with on delete cascade, but there is no profiles table in Django yet (that
    lands with the profile module). The FK arrives with that module's
    migration; until then profile deletion reaping is the database's own
    constraint, which faking-in preserves.

    The feed is NOT a ranking: this table is queried, newest `published_at`
    first, through the public projection in services.py that replicates the
    025 `content_public` view definition exactly (§5.3).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author_id = models.UUIDField()  # profiles id; FK deferred to the profile module
    kind = models.CharField(max_length=16, choices=ContentKind.choices)
    title = models.TextField(null=True, blank=True)
    body = models.TextField(null=True, blank=True)
    media_url = models.TextField(null=True, blank=True)
    caption = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=ContentStatus.choices, default=ContentStatus.LIVE
    )
    # A counter the client increments is a number the user benefits from
    # (rule 3), so nothing writes this from a request. It stays 0 until
    # something server-side owns it (020, verbatim).
    view_count = models.IntegerField(default=0)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    legacy_id = models.TextField(null=True, blank=True, unique=True)

    Kind = ContentKind
    Status = ContentStatus

    class Meta:
        db_table = "content"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(kind__in=ContentKind.values),
                name="content_kind_check",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=ContentStatus.values),
                name="content_status_check",
            ),
            models.CheckConstraint(
                condition=models.Q(view_count__gte=0),
                name="content_view_count_check",
            ),
        ]
        indexes = [
            # 020 §8: partial, because every feed query carries status='live'.
            models.Index(
                fields=["author_id", "-published_at"],
                name="content_author_idx",
                condition=models.Q(status="live"),
            ),
            models.Index(
                fields=["-published_at"],
                name="content_published_idx",
                condition=models.Q(status="live"),
            ),
        ]


class ReviewStatus(models.TextChoices):
    LIVE = "live", "Live"
    REMOVED = "removed", "Removed"


class Review(models.Model):
    """One row of the `reviews` table (docs/05-BACKEND-SCHEMA.md §5.4).

    Maps 1:1 onto backend/schema/020_content_reviews.sql. booking_id is
    UNIQUE BUT NULLABLE, and both halves are load-bearing (020, verbatim):
    unique means one booking buys one review; nullable means seeded reviews
    have no fabricated bookings, and `verified` derives from
    `booking_id is not null` — a column the seed cannot forge.

    The rating caches on `consultants` are recomputed from this table's live
    rows in the same transaction as every write (services.py replicates the
    020 trigger's arithmetic exactly) — a cache that recomputes cannot drift,
    which is the §1.3 rule the whole design defers to.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_id = models.UUIDField(null=True, blank=True, unique=True)
    seeker_id = models.UUIDField()  # profiles id; FK deferred to the profile module
    consultant_id = models.UUIDField()  # consultants.profile_id; FK deferred likewise
    rating = models.SmallIntegerField()
    body = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=ReviewStatus.choices, default=ReviewStatus.LIVE
    )
    created_at = models.DateTimeField(default=timezone.now)

    Status = ReviewStatus

    class Meta:
        db_table = "reviews"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1) & models.Q(rating__lte=5),
                name="reviews_rating_check",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=ReviewStatus.values),
                name="reviews_status_check",
            ),
        ]
        indexes = [
            models.Index(
                fields=["consultant_id", "-created_at"],
                name="reviews_consultant_idx",
                condition=models.Q(status="live"),
            ),
        ]


class FeedPin(models.Model):
    """One row of `feed_pins` (020): editorial override written only by the
    admin console (phase 13). Modelled 1:1 for schema ownership; no endpoint
    exposes it in this module."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.TextField()
    ref_id = models.UUIDField()
    sort = models.SmallIntegerField(default=0)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "feed_pins"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__isnull=True)
                | models.Q(starts_at__isnull=True)
                | models.Q(ends_at__gt=models.F("starts_at")),
                name="feed_pins_window_check",
            ),
        ]
        indexes = [
            models.Index(fields=["sort", "starts_at", "ends_at"], name="feed_pins_window_idx"),
        ]
