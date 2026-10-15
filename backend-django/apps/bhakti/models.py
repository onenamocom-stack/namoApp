import uuid

from django.db import models
from django.utils import timezone


class Kind(models.TextChoices):
    STATUS = "status", "Status"
    WALLPAPER = "wallpaper", "Wallpaper"
    TUNE = "tune", "Tune"
    BHAJAN = "bhajan", "Bhajan"
    EBOOK = "ebook", "E-book"  # the Academy's E-book tab; not a Bhakti shelf
    MANTRA = "mantra", "Mantra"  # a short clip the screen repeats a chosen number of times


class BhaktiAsset(models.Model):
    """One row of the `bhakti_assets` table (backend/schema/024_bhakti_assets.sql
    as amended by 026_bhakti_status_kind.sql, which merged 'ringtone' into
    'tune' and added the leading 'status' kind).

    Maps 1:1 onto the existing Supabase table. This model adds nothing the
    SQL does not already have — the migration it generates is faked in at
    cutover. It is a curated catalogue, not a feed (024's header): there is
    no author column and no client write policy, because there is no client
    writer. RLS in Postgres carries exactly one policy — public select of
    active rows — and "no insert/update/delete policy" is itself the rule;
    the Django equivalent is that the only write path is the service layer's
    seed/upsert function (the bhakti.mjs service-role script's replacement),
    and no endpoint mutates anything.

    RLS dies module by module: after cutover the select policy is revoked in
    a follow-up migration, and `list_assets()` below is the read rule.
    """

    class Kind(models.TextChoices):
        STATUS = "status", "Status"
        WALLPAPER = "wallpaper", "Wallpaper"
        TUNE = "tune", "Tune"
        BHAJAN = "bhajan", "Bhajan"
        EBOOK = "ebook", "E-book"  # the Academy's E-book tab; not a Bhakti shelf
        MANTRA = "mantra", "Mantra"  # a short clip the screen repeats a chosen number of times

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.TextField()
    deity = models.TextField(null=True, blank=True)
    media_url = models.TextField()
    preview_url = models.TextField(null=True, blank=True)
    # Paise, like every amount the server holds. NULL = "not priced yet",
    # which is not the same as free — and 0 never appears, the check refuses
    # it (024).
    price_paise = models.IntegerField(null=True, blank=True)
    # Struck through beside the price on the Market (15 Oct 2026). Display
    # only; NULL shows none.
    mrp_paise = models.IntegerField(null=True, blank=True)
    # A download's own page (15 Oct 2026): what is in it, in the console's
    # words — headings, bold and lists, as a product's description.
    description = models.TextField(default="", db_default="", blank=True)
    # Attribution is three columns and all three are NOT NULL (024): these
    # files are downloaded and some will be sold; `licence` is what the
    # future paywall filters on.
    artist = models.TextField()
    licence = models.TextField()
    source = models.TextField()
    # Soft withdrawal — nothing is hard-deleted (024). The RLS select policy
    # is `using (active)`, so this flag IS the visibility rule.
    active = models.BooleanField(default=True)
    sort = models.IntegerField(default=0)
    # Idempotency key for the seed script, same trick as content.legacy_id
    # (024) — re-running the manifest updates instead of duplicating.
    legacy_id = models.TextField(null=True, blank=True, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "bhakti_assets"
        constraints = [
            # Constraint names match what Postgres already carries (026
            # confirmed the auto-name bhakti_assets_kind_check on dev), because
            # the cutover fakes this migration in over the live table — Django's
            # name and the database's must be the same object.
            models.CheckConstraint(
                condition=models.Q(kind__in=Kind.values),
                name="bhakti_assets_kind_check",
            ),
            # 024: length(btrim(title)) > 0. `regex \S` is the same rule —
            # at least one non-space character — expressible on every backend.
            models.CheckConstraint(
                condition=models.Q(title__regex=r"\S"),
                name="bhakti_assets_title_check",
            ),
            # 024: price_paise is null or price_paise > 0.
            models.CheckConstraint(
                condition=models.Q(price_paise__isnull=True) | models.Q(price_paise__gt=0),
                name="bhakti_assets_price_paise_check",
            ),
            models.CheckConstraint(
                condition=models.Q(mrp_paise__isnull=True) | models.Q(mrp_paise__gt=0),
                name="bhakti_assets_mrp_paise_check",
            ),
        ]
        indexes = [
            # 024's partial index: ordering within a kind, live rows only —
            # exactly the query fetchAssets runs.
            models.Index(
                fields=["kind", "sort"],
                name="bhakti_assets_kind_idx",
                condition=models.Q(active=True),
            ),
        ]


class DarshanDeity(models.Model):
    """A deity on the darshan page — one pill (8 Oct 2026). Rahul: the
    murtis will be photographs from different temples, so what the page
    shows comes from the console now, not from the app's code. Nothing is
    deleted; untick Active to take one off the page."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.TextField()
    name_hi = models.TextField(blank=True, default="")
    sort = models.IntegerField(default=0)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "darshan_deities"
        ordering = ("sort", "name")
        verbose_name = "darshan deity"
        verbose_name_plural = "darshan deities"

    def __str__(self):
        return self.name


class DarshanImage(models.Model):
    """One murti on the darshan page, and the temple it is from. The plaque
    over the murti reads `temple` (or "Shri <deity> Mandir" when empty) and,
    under it, `location`. `title` and `credit` are the murti sheet's line —
    the attribution some of the seeded paintings' licences require."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    deity = models.ForeignKey(DarshanDeity, on_delete=models.PROTECT, related_name="images")
    image_url = models.TextField()
    temple = models.TextField(blank=True, default="")
    temple_hi = models.TextField(blank=True, default="")
    location = models.TextField(blank=True, default="")
    location_hi = models.TextField(blank=True, default="")
    title = models.TextField(blank=True, default="")
    credit = models.TextField(blank=True, default="")
    sort = models.IntegerField(default=0)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "darshan_images"
        ordering = ("deity__sort", "sort")
        verbose_name = "darshan image"

    def __str__(self):
        return self.temple or self.title or str(self.id)


class CommentStatus(models.TextChoices):
    LIVE = "live", "Live"
    REMOVED = "removed", "Removed"


class BhaktiComment(models.Model):
    """A comment on a Bhakti picture (12 Oct 2026, Rahul: like and comment
    on a status, as on a post). The same rules as a post's comment
    (`content_comments`): anyone signed in and not blocked; removal is a
    status, never a DELETE; nobody edits one. The library has no author, so
    the commenter or an admin removes it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(BhaktiAsset, on_delete=models.CASCADE, related_name="comments")
    author_id = models.UUIDField()
    body = models.TextField()
    status = models.CharField(max_length=16, choices=CommentStatus.choices, default=CommentStatus.LIVE)
    created_at = models.DateTimeField(default=timezone.now)

    Status = CommentStatus

    class Meta:
        db_table = "bhakti_comments"
        indexes = [
            models.Index(fields=["asset", "status", "created_at"], name="bhakti_comments_asset_idx"),
            # The writing limit's count (apps/core/limits.py, Phase 15d).
            models.Index(fields=["author_id", "created_at"], name="bhakti_comments_author_idx"),
        ]

    def __str__(self):
        return self.body[:60]


class SadhanaDay(models.Model):
    """One IST day on which a person did their sadhana (14 Oct 2026, Phase
    15c): a mantra's japa played through to its count in Bhakti, or an
    aarti in Darshan. One row per person per day; the streak on the profile
    is the run of consecutive days (`streak.py`). Self-reported, as a mala
    is: nothing here proves anybody chanted."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    day = models.DateField()
    japa_rounds = models.PositiveIntegerField(default=0)
    aarti = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "sadhana_days"
        constraints = [
            models.UniqueConstraint(fields=["profile_id", "day"], name="sadhana_days_one_per_day"),
        ]

    def __str__(self):
        return f"{self.profile_id} {self.day}"


class AssetTag(models.Model):
    """One of Namo's e-books tagged on a post or reel (15 Oct 2026, Rahul),
    as a shop product (content.ContentProduct) and a Market listing
    (market.ListingTag) are: set by a Pro or a Creator, three tags a post at
    most counting all of them, shown while the e-book is active."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content_id = models.UUIDField(db_index=True)
    asset = models.ForeignKey(BhaktiAsset, on_delete=models.CASCADE, related_name="tags")
    sort = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "bhakti_asset_tags"
        constraints = [models.UniqueConstraint(fields=["content_id", "asset"], name="bhakti_asset_tags_once")]
