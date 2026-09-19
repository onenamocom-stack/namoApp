import uuid

from django.db import models
from django.utils import timezone


class Kind(models.TextChoices):
    STATUS = "status", "Status"
    WALLPAPER = "wallpaper", "Wallpaper"
    TUNE = "tune", "Tune"
    BHAJAN = "bhajan", "Bhajan"


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
