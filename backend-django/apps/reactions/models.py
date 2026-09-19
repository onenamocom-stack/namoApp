import uuid

from django.db import models
from django.utils import timezone


class TargetType(models.TextChoices):
    CONSULTANT = "consultant", "Consultant"
    CONTENT = "content", "Content"
    PRODUCT = "product", "Product"
    COURSE = "course", "Course"
    LIVE_SESSION = "live_session", "Live session"
    PROFILE = "profile", "Profile"


class Kind(models.TextChoices):
    FOLLOW = "follow", "Follow"
    SAVE = "save", "Save"
    LIKE = "like", "Like"
    REMIND = "remind", "Remind"


class Reaction(models.Model):
    """One row of the `reactions` table (docs/05-BACKEND-SCHEMA.md §5.1).

    Maps 1:1 onto the existing Supabase table from backend/schema/
    020_content_reviews.sql (as amended by 025_seekers_publish.sql, which
    added 'profile' to target_type). This model adds nothing the SQL does
    not already have — the migration it generates is faked in at cutover.

    actor_id is a bare UUIDField, not an FK: the SQL references
    profiles(id) with on delete cascade, but there is no profiles table in
    Django yet (that lands with the profile module). The FK arrives with
    that module's migration; until then profile deletion reaping is the
    database's own constraint, which faking-in preserves.

    target_id is deliberately not an FK: it points into five tables
    (docs/05 §5.1 — no referential trigger, deliberately).
    """

    class TargetType(models.TextChoices):
        CONSULTANT = "consultant", "Consultant"
        CONTENT = "content", "Content"
        PRODUCT = "product", "Product"
        COURSE = "course", "Course"
        LIVE_SESSION = "live_session", "Live session"
        PROFILE = "profile", "Profile"

    class Kind(models.TextChoices):
        FOLLOW = "follow", "Follow"
        SAVE = "save", "Save"
        LIKE = "like", "Like"
        REMIND = "remind", "Remind"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_id = models.UUIDField()  # auth.users id; FK deferred to the profile module
    target_type = models.CharField(max_length=16, choices=TargetType.choices)
    target_id = models.UUIDField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    created_at = models.DateTimeField(default=timezone.now)

    # Convenience aliases so call sites read Reaction.Kind / Reaction.TargetType.
    Kind = Kind
    TargetType = TargetType

    class Meta:
        db_table = "reactions"
        constraints = [
            # Constraint names match what Postgres already has, because the
            # cutover fakes this migration in over the live table — Django's
            # name and the database's must be the same object.
            models.UniqueConstraint(
                fields=["actor_id", "target_type", "target_id", "kind"],
                name="reactions_actor_id_target_type_target_id_kind_key",
            ),
            models.CheckConstraint(
                condition=models.Q(target_type__in=TargetType.values),
                name="reactions_target_type_check",
            ),
            models.CheckConstraint(
                condition=models.Q(kind__in=Kind.values),
                name="reactions_kind_check",
            ),
        ]
        indexes = [
            models.Index(fields=["target_type", "target_id", "kind"], name="reactions_target_idx"),
        ]
