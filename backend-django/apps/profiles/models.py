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

from django.db import models
from django.utils import timezone

# 002's CHECK, verbatim (the SQL pattern, as a Django iregex — `~*` is
# case-insensitive). Shape only: it rejects an obviously malformed address
# at the trust boundary without pretending to prove the address exists.
EMAIL_SHAPE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


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
    admin = models.BooleanField(default=False)

    # Posting video is a FLAG, not a role. An approved consultant gets it
    # from their consultants row; this is for everybody else — the
    # influencer who signs up as an ordinary seeker and should be able to
    # post reels without being made a consultant, which would also make
    # them bookable and put them in the astrologer list. One switch in the
    # console, granted per person, revoked the same way.
    video_enabled = models.BooleanField(default=False)

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

    legacy_id = models.TextField(null=True, blank=True)
    avatar_url = models.TextField(null=True, blank=True)  # 027: public URL into media
    created_at = models.DateTimeField(default=timezone.now)

    @property
    def is_blocked(self):
        return self.blocked_at is not None

    class Meta:
        db_table = "profiles"
        constraints = [
            # 002's named CHECK, carried home (profiles_email_shape).
            models.CheckConstraint(
                condition=models.Q(email__iregex=EMAIL_SHAPE) | models.Q(email__isnull=True),
                name="profiles_email_shape",
            ),
        ]
