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
    # More photos after `media_url` on a post, in order, up to nine (17 Oct
    # 2026, Rahul: ten photos a post, swiped). Empty for everything else.
    gallery = models.JSONField(default=list, db_default=[], blank=True)
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
    # The group it was posted in (14 Oct 2026, Phase 15c; `groups`), or
    # null. A group post shows on the group's page and in its members'
    # Home feeds, not in everybody's.
    group_id = models.UUIDField(null=True, blank=True)
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
            # The writing limit's count (apps/core/limits.py, Phase 15d).
            models.Index(fields=["author_id", "created_at"], name="content_author_created_idx"),
            # A group's page (Phase 15c).
            models.Index(fields=["group_id", "-published_at"], name="content_group_idx"),
            models.Index(
                fields=["-published_at"],
                name="content_published_idx",
                condition=models.Q(status="live"),
            ),
        ]


MAX_TAGGED_PRODUCTS = 3


class ContentProduct(models.Model):
    """A shop product tagged on a post or reel (30 Sep 2026).

    The consultant says "this is the stone I mean" and the seeker taps
    through to it in the shop, carrying the consultant's A code — so the
    tag IS an affiliate link, credited exactly as a link from "Your links"
    is. Three rules, enforced in services.publish_content:

    1. **Approved consultants only.** An A code is theirs alone, and a
       seeker tagging products would be advertising with no one to credit.
    2. **Active products only**, at most MAX_TAGGED_PRODUCTS per post. The
       read side filters `active` again: a product retired after the post
       went out quietly drops off it rather than linking to a dead page.
    3. **Set at publish, never edited.** There is no edit path for a post
       either; a tag that changes under a published post is a bait and
       switch the reader never agreed to.

    A through table rather than a bare M2M because the order the author
    picked is the order the strip shows (`sort`), and because the name
    `content_products` is what a SQL reader will look for.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.ForeignKey(
        Content, on_delete=models.CASCADE, db_column="content_id",
        related_name="product_tags",
    )
    # DO_NOTHING like every other pointer at `products`: a product is never
    # deleted, only made inactive (shop/models.py).
    product = models.ForeignKey(
        "shop.Product", on_delete=models.DO_NOTHING, db_column="product_id",
        related_name="content_tags",
    )
    sort = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "content_products"
        ordering = ("sort",)
        constraints = [
            models.UniqueConstraint(
                fields=["content", "product"], name="content_products_once",
            ),
        ]


def ist_today():
    """Today on the IST calendar (docs/02-TRD.md §10). IST has no DST, so the
    shift is a constant."""
    return (timezone.now() + timezone.timedelta(hours=5, minutes=30)).date()


class ContentView(models.Model):
    """One signed-in person watched this reel on this IST day.

    `content.view_count` is the count of these rows, kept by the server in
    the same transaction as the insert — which is what finally gives that
    column an owner (020 left it at 0 "until something server-side owns
    it").

    **Once per person per reel per day, since 3 Oct 2026** (owner's call).
    It was once per person ever (30 Sep), which made the count grow too
    slowly to read as alive. Within a day, replaying, scrolling back and
    reloading are still not new views, so nobody can raise it by sitting
    on a reel; coming back tomorrow is. The author watching their own reel
    is not recorded. Anonymous viewers are not counted — there is no
    identity to de-duplicate on.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.ForeignKey(
        Content, on_delete=models.CASCADE, db_column="content_id", related_name="views",
    )
    viewer_id = models.UUIDField()
    day = models.DateField(default=ist_today)
    # Every view that day, the same person again too (16 Oct 2026): a
    # period's views are the sum. Rows before that are one view each.
    views = models.PositiveIntegerField(default=1, db_default=1)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "content_views"
        constraints = [
            models.UniqueConstraint(
                fields=["content", "viewer_id", "day"], name="content_views_once_a_day",
            ),
        ]


MAX_COMMENT_CHARS = 1000


class CommentStatus(models.TextChoices):
    LIVE = "live", "Live"
    REMOVED = "removed", "Removed"


class Comment(models.Model):
    """A comment on a post or reel (30 Sep 2026).

    Until this table the comment icon toasted "Replies — prototype only".
    Anyone signed in and not blocked may comment on anything publicly
    visible. Removal is a status, never a DELETE — the same rule as content,
    because a removed comment in a dispute is evidence. The commenter, the
    post's author and an admin may remove one; nobody may edit one, so what
    a reply answered cannot change under it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.ForeignKey(
        Content, on_delete=models.CASCADE, db_column="content_id", related_name="comments",
    )
    author_id = models.UUIDField()
    body = models.TextField()
    status = models.CharField(
        max_length=16, choices=CommentStatus.choices, default=CommentStatus.LIVE
    )
    created_at = models.DateTimeField(default=timezone.now)

    Status = CommentStatus

    class Meta:
        db_table = "content_comments"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=CommentStatus.values),
                name="content_comments_status_check",
            ),
        ]
        indexes = [
            models.Index(
                fields=["content", "created_at"],
                name="content_comments_thread_idx",
                condition=models.Q(status="live"),
            ),
            # The writing limit's count (apps/core/limits.py, Phase 15d).
            models.Index(fields=["author_id", "created_at"], name="content_comments_author_idx"),
        ]


class ReviewStatus(models.TextChoices):
    # A seeker's review waits here for the console (17 Oct 2026, Rahul:
    # "all review before live should go to admin to approve"). Pending
    # rows are not public and do not count in the rating.
    PENDING = "pending", "Waiting for approval"
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
    # Or the call or chat it reviews (17 Oct 2026): unique the same way,
    # one session buys one review.
    session_id = models.UUIDField(null=True, blank=True, unique=True)
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


class DriveReel(models.Model):
    """A Google Drive video the reel poster has dealt with (12 Oct 2026;
    apps/content/drive_reels.py). One row per Drive file, ever — the unique
    id is what stops a video going up twice. `content` is the reel it
    became; `skipped_reason` is set instead when it could not be posted."""

    drive_file_id = models.CharField(max_length=128, unique=True)
    folder = models.TextField()
    file_name = models.TextField()
    content = models.ForeignKey(Content, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name="+")
    posted_at = models.DateTimeField(null=True, blank=True)
    skipped_reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "drive_reels"
        indexes = [models.Index(fields=["posted_at"], name="drive_reels_posted_idx")]

    def __str__(self):
        return f"{self.folder}/{self.file_name}"


class FlagKind(models.TextChoices):
    NEW_LINK = "new_link", "A link from an account under a week old"
    REPEATED = "repeated", "The same words, three times in a day"


class FlagTarget(models.TextChoices):
    POST = "post", "Post"
    COMMENT = "comment", "Comment on a post"
    BHAKTI_COMMENT = "bhakti_comment", "Comment on a Bhakti picture"


class FlagStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLEARED = "cleared", "Looked at — fine"
    REMOVED = "removed", "Removed"
    BLOCKED = "blocked", "Person blocked"


class ModerationFlag(models.Model):
    """One item in the daily moderation queue that nobody reported (14 Oct
    2026, Phase 15d; finders in `moderation.py`). Like a report, a flag
    hides nothing: an admin decides. One per thing per reason."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=16, choices=FlagKind.choices)
    target_type = models.CharField(max_length=16, choices=FlagTarget.choices)
    target_id = models.UUIDField()
    subject_id = models.UUIDField()
    excerpt = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=FlagStatus.choices, default=FlagStatus.OPEN)
    decided_by = models.TextField(blank=True, default="")
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Kind = FlagKind
    Target = FlagTarget
    Status = FlagStatus

    class Meta:
        db_table = "moderation_flags"
        constraints = [
            models.UniqueConstraint(fields=["target_type", "target_id", "kind"], name="moderation_flags_once"),
        ]
        indexes = [models.Index(fields=["status", "created_at"], name="moderation_flags_queue_idx")]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.excerpt[:40]}"


class ContentPaySettings(models.Model):
    """What Namo pays a Pro or a Creator for 1,000 qualified views (16 Oct
    2026, Rahul: ₹20, editable in the console). One row; each qualified view
    stores the rate it was counted at, so a change never reprices the past."""

    id = models.SmallIntegerField(primary_key=True, default=1)
    paise_per_thousand = models.PositiveIntegerField(default=2000, db_default=2000)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "content_pay_settings"
        verbose_name = "content pay rate"
        verbose_name_plural = "content pay rate"


class QualifiedView(models.Model):
    """A view that earns (16 Oct 2026, Rahul): a reel played 30 seconds, a
    blog open 30 seconds, or a like, comment or reshare on a post. Once per
    person per post per IST day; never the author's own, never signed out.
    `author_id` is the post's, so a period's count is one indexed read."""

    class Reason(models.TextChoices):
        WATCH = "watch", "Watched 30 seconds"
        READ = "read", "Read 30 seconds"
        LIKE = "like", "Liked"
        COMMENT = "comment", "Commented"
        REPOST = "repost", "Reshared"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.ForeignKey(Content, on_delete=models.CASCADE, db_column="content_id", related_name="qualified")
    author_id = models.UUIDField()
    viewer_id = models.UUIDField()
    day = models.DateField(default=ist_today)
    reason = models.CharField(max_length=8, choices=Reason.choices)
    paise_per_thousand = models.PositiveIntegerField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "content_qualified_views"
        constraints = [
            models.UniqueConstraint(fields=["content", "viewer_id", "day"], name="qualified_views_once_a_day"),
        ]
        indexes = [models.Index(fields=["author_id", "created_at"], name="qualified_views_author_at")]
