"""Module 9 — profile + avatar (docs/07-DJANGO-MIGRATION.md §6 step 9): the
identity spine and the LAST write surface. One model, 1:1 onto the existing
`profiles` table, so the initial migration is faked in at cutover
(`migrate --fake-initial`) — every constraint name below is the name
Postgres already carries, nothing here creates anything new on the real
database. Owned here:

  profiles  001_profiles.sql (own-row-only RLS; `handle_new_user` makes the
            row at signup — auth stays on Supabase, so the trigger stays
            too), 002_profiles_email.sql (the nullable, non-unique,
            owner-correctable contact column and its shape CHECK), and
            027_profile_avatars.sql (avatar_url + the re-issued column
            grant — see the header trap the file documents).

What the module is, per docs/05-BACKEND-SCHEMA.md §4.1 and §7:

  * The identity spine. Every other table's `*_id` points here; modules
    3/5/6/7 read it through their raw gateways "until the profile module" —
    this is that module: those gateways re-point here (apps.profiles
    .services), same answers, no raw SQL left against this table.
  * Own-row-only, exactly as 001's policies: SELECT own, UPDATE own (the
    column grant — name, email and the eight birth columns — as code),
    and NO client INSERT policy in the source schema because the row is
    made server-side at signup. `services.ensure_profile` is that trigger
    as code, for fresh databases and the cutover race; nothing lets one
    caller touch another's row, and `admin` on the row is not a privilege
    the API hands out — the column grant keeps it out of client reach and
    so does the serializer.
  * Birth details (dob/tob/place/zone) are PRIVATE. The only readers are
    the owner (GET /v1/profiles/me/) and the server-side seams that rule
    explicitly: astro reads the CALLER'S OWN row to compute a chart, and
    bookings_view (010) carries the seeker's birth details to the
    consultant ON that booking — both stay exactly where they were, now
    reading through this module.
  * `email` is contact, never identity (002): nullable, not unique,
    shape-CHECKed, owner-correctable. The phone is the account.
  * `birth_date` + `birth_time` + `birth_zone`, never a timestamptz —
    naive local time plus the IANA zone of the birth PLACE (§4.1, do not
    "fix" this). `birth_time_known` keeps NULL distinguishable from
    midnight and is always written as a pair with birth_time.

Deliberately NOT owned here: auth.users (Supabase Auth stays, docs/07 §1),
`authors_public` / `consultants_public` (025/007's views — content and
consultants replicate them), the bucket bytes (the media app owns R2).
"""

import uuid

from django.db import models
from django.utils import timezone

from .username_rules import MAX_LEN, validate_username

# 002's CHECK, verbatim (the SQL pattern, as a Django iregex — `~*` is
# case-insensitive). Shape only: it rejects an obviously malformed address
# at the trust boundary without pretending to prove the address exists.
EMAIL_SHAPE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

GENDERS = ("male", "female", "other")


class Profile(models.Model):
    """One row of `profiles` — one person. The primary key IS the Supabase
    auth user id: identity stays in Supabase Auth, so this is a bare
    UUIDField with no local FK (the wallet's profile_id precedent).

    In prod the row is created by `handle_new_user` the instant a phone
    signs up; `services.ensure_profile` is the same insert as code, for
    fresh databases and the window before the trigger fires. `phone` is
    the identity and the only verified channel (002); `admin` and
    `legacy_id` exist for the admin console and the seed, and no client
    write can touch either (the 001 column grant as a serializer
    allow-list)."""

    id = models.UUIDField(primary_key=True, editable=False)
    phone = models.TextField(unique=True)  # 001: text unique not null
    name = models.TextField()
    email = models.TextField(null=True, blank=True)  # 002: contact, not identity
    birth_date = models.DateField(null=True, blank=True)
    birth_time = models.TimeField(null=True, blank=True)
    birth_time_known = models.BooleanField(default=False)
    birth_place = models.TextField(null=True, blank=True)
    birth_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    birth_lon = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    birth_zone = models.TextField(null=True, blank=True)  # IANA name, never an offset
    # Asked at sign-up since 30 Sep 2026. NULL for every account made before
    # that, and for anybody who skips it — nothing reads it as a default.
    gender = models.TextField(null=True, blank=True)
    admin = models.BooleanField(default=False)

    # Posting video is a FLAG, not a role. An approved consultant gets it
    # from their consultants row; this is for everybody else — the
    # influencer who signs up as an ordinary seeker and should be able to
    # post reels without being made a consultant, which would also make
    # them bookable and put them in the astrologer list. One switch in the
    # console, granted per person, revoked the same way.
    video_enabled = models.BooleanField(default=False)

    # An influencer (3 Oct 2026): a person, usually not a consultant, paid
    # for the people their invite code brings — signups and those who go on
    # to pay. Like `video_enabled`, a flag the console grants, not a role:
    # it adds the Influencer tab and its numbers (apps/referrals/influencer.py)
    # and nothing else. Their code is their ordinary N invite code.
    influencer = models.BooleanField(default=False)

    # The Seller module (docs/06 Phase 18, Rahul 16 Oct 2026): lists on the
    # Market. Granted only by approving a request; Creator (`influencer`)
    # and Pro (an approved consultants row) are the other two modules.
    seller = models.BooleanField(default=False, db_default=False)

    # Content, step 1 (Rahul, 17 Oct 2026): granted on its own when the
    # person has 100 followers, 10 live videos and a 30-day-old account.
    # Tags, product links and the A code, with their earnings, the ₹25 a
    # sign-up, and insights; no pay on views. `influencer` is step 2 (pay
    # on views on top) and includes everything here.
    referrer = models.BooleanField(default=False, db_default=False)

    # A line under the picture on the profile (4 Oct 2026). Nullable, not a
    # Django default: `handle_new_user` inserts only (id, phone, name), and
    # a NOT NULL column without a database default breaks every sign-up
    # (backend/schema/032). Empty reads as "Available" in the app.
    bio = models.CharField(max_length=150, null=True, blank=True)

    # What the person picked at sign-up, keys of `interests.INTERESTS` (13 Oct
    # 2026, Phase 15a). Null until they pick: nullable for the same reason as
    # `bio`. A list, three to five long, checked at the door (views).
    interests = models.JSONField(null=True, blank=True)

    # Set when an admin blocks this person after reviewing reports. A
    # timestamp rather than a boolean because "when" is the first question
    # asked in an appeal, and a boolean cannot answer it. Null is the
    # normal state.
    #
    # Blocking hides their posts and refuses new ones. It does NOT delete
    # anything: a removed account in a dispute is evidence, and unblocking
    # has to be able to put things back.
    blocked_at = models.DateTimeField(null=True, blank=True)
    blocked_reason = models.TextField(null=True, blank=True)

    # The readable half of a shared link, 1namo.com/<username> (11 Oct
    # 2026, Rahul). Given automatically the first time the person's own
    # profile is read (services.ensure_username: name-surname-1234), and
    # changeable from Settings once every 30 days. Lowercase only; the rules
    # are username_rules.py. Null until then — and nullable for good, like
    # bio, because handle_new_user inserts only (id, phone, name).
    username = models.CharField(
        max_length=MAX_LEN, null=True, blank=True, unique=True,
        validators=[validate_username],
    )
    # When the PERSON last chose one. An automatic name leaves it null, so
    # the first change is never held back by the 30 days.
    username_changed_at = models.DateTimeField(null=True, blank=True)

    legacy_id = models.TextField(null=True, blank=True)
    avatar_url = models.TextField(null=True, blank=True)  # 027: public URL into media
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def is_blocked(self):
        return self.blocked_at is not None

    class Meta:
        db_table = "profiles"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gender__in=GENDERS) | models.Q(gender__isnull=True),
                name="profiles_gender_check",
            ),
            # 002's named CHECK, carried home (profiles_email_shape).
            models.CheckConstraint(
                condition=models.Q(email__iregex=EMAIL_SHAPE) | models.Q(email__isnull=True),
                name="profiles_email_shape",
            ),
        ]


class ModuleRequest(models.Model):
    """A request for the Creator or the Seller module (docs/06 Phase 18).
    The Pro module's request is the consultant application. One pending
    request per person per module; a rejection carries the admin's note."""

    class Module(models.TextChoices):
        REFERRER = "referrer", "Content, step 1"
        CREATOR = "creator", "Creator"
        SELLER = "seller", "Seller"

    class Status(models.TextChoices):
        PENDING = "pending", "Waiting"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()
    module = models.CharField(max_length=8, choices=Module.choices)
    answers = models.JSONField(default=dict)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    review_note = models.TextField(blank=True, default="")
    submitted_at = models.DateTimeField(default=timezone.now)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.TextField(blank=True, default="")

    class Meta:
        db_table = "module_requests"
        constraints = [
            models.UniqueConstraint(fields=["profile_id", "module"], condition=models.Q(status="pending"),
                                    name="module_requests_one_pending"),
        ]
        indexes = [models.Index(fields=["status", "submitted_at"], name="module_requests_queue")]

    def __str__(self):
        return f"{self.get_module_display()} · {self.get_status_display()}"

