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


class ReportReason(models.TextChoices):
    """Why somebody reported it. Short, closed list, and every option is a
    thing an admin can actually act on — "other" is last and carries a note,
    because a free-text-only form gets "idk it's bad" and a closed list with
    no escape hatch gets the wrong reason picked to get past the form."""

    SPAM = "spam", "Spam or a scam"
    ABUSE = "abuse", "Abuse, threats or harassment"
    ADULT = "adult", "Nudity or sexual content"
    FALSE = "false", "Dangerous or false claims"
    OTHER = "other", "Something else"


class ReportStatus(models.TextChoices):
    OPEN = "open", "Open — nobody has looked"
    UPHELD = "upheld", "Upheld — the post or the person was actioned"
    DISMISSED = "dismissed", "Dismissed — nothing wrong with it"


class Report(models.Model):
    """Somebody said this is wrong. An admin decides whether it is.

    **A report is not a verdict and never acts on its own.** Nothing here
    removes a post or blocks a person: a count is not a decision, and a
    feature that hides content at N reports is a feature that hands any
    five accounts the power to silence anyone. Every removal and every
    block is an admin's own action, and lands in `admin_actions` with the
    admin's name on it.

    **`content_id` is nullable, and that is the whole design.** A report
    is either about a POST (content set, subject is its author) or about a
    PERSON (content null). The second is what makes "this account has been
    reported many times" a question the console can answer, which is the
    reason the seeker asked for reporting at all.

    One report per person per thing. Somebody who dislikes a post may say
    so once — the unique indexes make a brigade of one impossible, and make
    the count mean "this many different people", which is the only version
    of the count worth showing an admin.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Null means the report is about the person, not one of their posts.
    content = models.ForeignKey(
        Content, null=True, blank=True, on_delete=models.CASCADE,
        related_name="reports", db_column="content_id",
    )
    # Who is complained about. Denormalised from content.author_id on
    # purpose: the author of a post can never change, and carrying it here
    # is what lets "count the reports against this person" be one index
    # scan instead of a join through content on every console page load.
    subject_id = models.UUIDField()
    reporter_id = models.UUIDField()
    reason = models.CharField(max_length=16, choices=ReportReason.choices)
    note = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=ReportStatus.choices, default=ReportStatus.OPEN
    )
    # The admin who decided, and what they did about it. Kept even after
    # the post is gone: a person told their account was blocked can be
    # shown when, by whom, and on what — the same rule as apps/console/audit.
    reviewed_by = models.UUIDField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    outcome = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Reason = ReportReason
    Status = ReportStatus

    class Meta:
        db_table = "content_reports"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(reason__in=ReportReason.values),
                name="content_reports_reason_check",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=ReportStatus.values),
                name="content_reports_status_check",
            ),
            # Nobody reports themselves. Not a real use case, and without
            # it the report count is something an author can inflate.
            models.CheckConstraint(
                condition=~models.Q(reporter_id=models.F("subject_id")),
                name="content_reports_not_self_check",
            ),
            # Once per post per person...
            models.UniqueConstraint(
                fields=["content", "reporter_id"],
                condition=models.Q(content__isnull=False),
                name="content_reports_one_per_post",
            ),
            # ...and once per PERSON per person. Two partial indexes rather
            # than one over a nullable column, because in Postgres NULLs are
            # distinct and a plain unique would let the same reporter file
            # the same complaint about the same account forever.
            models.UniqueConstraint(
                fields=["subject_id", "reporter_id"],
                condition=models.Q(content__isnull=True),
                name="content_reports_one_per_person",
            ),
        ]
        indexes = [
            # The console's only list: open reports, oldest first, because
            # the oldest unanswered complaint is the one that matters.
            models.Index(
                fields=["created_at"],
                name="content_reports_open_idx",
                condition=models.Q(status="open"),
            ),
            # "How many times has this account been reported?"
            models.Index(fields=["subject_id", "-created_at"],
                         name="content_reports_subject_idx"),
        ]
