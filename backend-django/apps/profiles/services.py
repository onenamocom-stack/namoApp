"""Profile services — the `profiles` table's rules as code.

This module is the ONLY owner of `profiles` reads and writes, and the seam
every other module's raw profiles-gateway re-points to (module 9's promise:
astro reads the caller's own birth row here; content/consultants/chat read
names here — same answers, no raw SQL left against this table). What lives
here, rule by rule:

  * `ensure_profile` — 001's `handle_new_user` as code. The row is made at
    signup by a Supabase trigger and auth stays on Supabase, so in prod this
    is the fallback for the window before the trigger fires and for fresh
    databases. Race-safe: the unique primary key collapses a double-create,
    the loser reads the winner (the catch-IntegrityError-read-winner
    pattern).
  * `save_onboarding` — the 001/002 column grant as an allow-list: name,
    email and the eight birth columns, nothing else, ever. `admin`, `phone`,
    `legacy_id`, `id` and `created_at` stay out of client reach even on the
    caller's own row (001's comment is the spec: the policy scopes WHICH
    ROW, the grant scopes WHICH COLUMNS). `avatar_url` is deliberately NOT
    grant-writable here even though 027 re-issued the grant: the Django path
    routes every avatar write through `set_avatar`, so the row can only
    point at a READY media asset the caller owns — the grant's quiet-failure
    trap (027's header) cannot exist where the write is validated.
  * `get_birth_details` — the astro seam. The CALLER'S OWN six birth
    columns, for the chart computation only; a query error propagates so a
    failed read never masquerades as an absent row (the incident the astro
    gateway's warning came from).
  * `profile_name` / `profile_names` / `*_subquery` — the public-name seams
    the 007/010/025 views join, now ORM subqueries (all-Django joins, so the
    SQLite dashless-UUID dance the raw gateways needed is gone at this
    boundary).
  * `public_profile` — the narrow public projection: name (and avatar_url,
    027's documented follow-up) for a profile the existing public surfaces
    already expose — someone with live content (authors_public, 025) or an
    approved practice (consultants_public, 007). Anything else is a 404, so
    ids do not leak existence. No birth details, no phone, no email, ever.
  * `set_avatar` — 027's mapping onto the media spine: the upload is a
    media_assets row (kind image, owner the caller, bytes in R2 via the
    module-1 presign flow); the profiles row references the READY asset's
    public URL with a `?v=` cache-bust, exactly what avatar.js stores today.
"""

import time
import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import OuterRef, Subquery, TextField

from apps.media.models import MediaAsset

from .models import EMAIL_SHAPE, Profile

# The 001 grant + 002's email re-grant, as code. The body may only ever
# touch these; `avatar_url` is set through set_avatar instead (module doc).
CLIENT_WRITABLE = (
    "name",
    "email",
    "birth_date",
    "birth_time",
    "birth_time_known",
    "birth_place",
    "birth_lat",
    "birth_lon",
    "birth_zone",
)

EMAIL_PATTERN = EMAIL_SHAPE

DEFAULT_NAME = "there"  # handle_new_user's coalesce(new.raw_user_meta_data ->> 'name', 'there')


class Refusal(Exception):
    """A shaped refusal the views map onto the standard envelope."""

    def __init__(self, status, reason, message):
        super().__init__(message)
        self.status = status
        self.reason = reason
        self.message = message


def _canon_uuid(value):
    return str(uuid.UUID(str(value)))


def _same_uuid(left, right):
    try:
        return _canon_uuid(left) == _canon_uuid(right)
    except (ValueError, AttributeError, TypeError):
        return False


# ── serialization ────────────────────────────────────────────────────────────


def _iso_date(value):
    return value.isoformat() if value is not None else None


def _hms(value):
    return value.strftime("%H:%M:%S") if value is not None else None


def serialize_profile(profile):
    """The full row, snake_case, in the shape PostgREST's select('*') returns
    today — store.jsx reads these keys verbatim (profile.birth_date,
    profile.birth_time_known !== false, profile.avatar_url, …)."""
    return {
        "id": str(profile.id),
        "phone": profile.phone,
        "name": profile.name,
        "email": profile.email,
        "birth_date": _iso_date(profile.birth_date),
        "birth_time": _hms(profile.birth_time),
        "birth_time_known": profile.birth_time_known,
        "birth_place": profile.birth_place,
        "birth_lat": float(profile.birth_lat) if profile.birth_lat is not None else None,
        "birth_lon": float(profile.birth_lon) if profile.birth_lon is not None else None,
        "birth_zone": profile.birth_zone,
        "admin": profile.admin,
        "legacy_id": profile.legacy_id,
        "avatar_url": profile.avatar_url,
        "created_at": profile.created_at.isoformat(),
    }


# ── row creation and the onboarding write ────────────────────────────────────


def ensure_profile(user_id, phone=None, name=None):
    """handle_new_user as code: the row for a freshly signed-up phone, named
    from the signup metadata with 001's 'there' fallback. Returns
    (profile, created). The insert IS the race protection — a concurrent
    double-create hits the primary key, and the loser reads the winner."""
    profile = Profile.objects.filter(pk=user_id).first()
    if profile is not None:
        return profile, False
    try:
        with transaction.atomic():
            return (
                Profile.objects.create(
                    id=user_id,
                    phone=phone if phone else f"+unknown-{user_id}",
                    name=name or DEFAULT_NAME,
                ),
                True,
            )
    except IntegrityError:
        return Profile.objects.get(pk=user_id), False


def save_onboarding(user_id, phone, fields):
    """The onboarding write (src/screens/onboarding/Computing.jsx's UPDATE):
    create the row if the trigger has not fired yet, then apply exactly the
    caller-writable fields present in `fields` (partial updates land as
    sent; an absent key leaves its column alone). Identity comes from the
    JWT — nothing in `fields` can say whose row this is (rule 3), and the
    non-writable columns in `fields` are dropped, not echoed (the column
    grant as the rule, like the content module's never-client-settable
    columns)."""
    profile, _ = ensure_profile(user_id, phone=phone, name=fields.get("name"))
    updates = {key: value for key, value in fields.items() if key in CLIENT_WRITABLE}
    if updates:
        for key, value in updates.items():
            setattr(profile, key, value)
        profile.save(update_fields=list(updates))
        profile.refresh_from_db()
    return profile


# ── the seams other modules re-point to (were raw-SQL gateways) ──────────────


def get_birth_details(user_id):
    """The astro seam: the CALLER'S OWN six birth columns, for the chart
    computation only — the client sends nothing that decides the answer
    (rule 3) and no endpoint exposes these for anyone else. A query ERROR
    propagates on purpose: the caller must not conflate a failed read with
    an absent row (that conflation once sent a working consultant to a
    signup form). Returns the dict astro builds its cache key and upstream
    body from, or None when there is no row."""
    profile = Profile.objects.filter(pk=user_id).first()
    if profile is None:
        return None
    return {
        "birth_date": _iso_date(profile.birth_date),
        "birth_time": _hms(profile.birth_time),
        "birth_time_known": bool(profile.birth_time_known),
        "birth_lat": float(profile.birth_lat) if profile.birth_lat is not None else None,
        "birth_lon": float(profile.birth_lon) if profile.birth_lon is not None else None,
        "birth_zone": profile.birth_zone or None,
    }


def profile_name(profile_id):
    """The public name of a profile, or None when there is no row — the
    007/010/025 view joins, as a lookup. A name leaves this module only
    through the public projections, exactly as before."""
    row = Profile.objects.filter(pk=profile_id).values_list("name", flat=True).first()
    return row if row is not None else None


def profile_names(profile_ids):
    """Bulk read for shaping lists without an N+1: {canonical uuid str: name}."""
    ids = [str(p) for p in profile_ids if p is not None]
    if not ids:
        return {}
    rows = Profile.objects.filter(id__in=ids).values_list("id", "name")
    return {_canon_uuid(pk): name for pk, name in rows}


def name_subquery(outer_field):
    """ORM annotation: the profile name for the row's <outer_field> — the
    _name_expr RawSQL the consultants/chat gateways carried, now an ORM
    subquery (both sides are Django tables; no format-agnostic SQL needed
    at this boundary anymore)."""
    return Subquery(
        Profile.objects.filter(id=OuterRef(outer_field)).values("name")[:1],
        output_field=TextField(),
    )


def birth_subquery(outer_field, column):
    """ORM annotation for one of the birth columns the bookings_view join
    carries to the consultant ON the booking (010: a reading cannot be done
    without them, and there is no path to the birth details of somebody who
    has not booked you). Column is one of birth_date/birth_time/birth_place."""
    return Subquery(
        Profile.objects.filter(id=OuterRef(outer_field)).values(column)[:1],
        output_field=TextField(),
    )


# ── the public projection ────────────────────────────────────────────────────


def public_profile(profile_id):
    """The narrow public row: id, name, avatar_url — and ONLY for a profile
    the existing public surfaces already expose (authors_public: has live
    content, 025; consultants_public: an approved practice, 007). Anything
    else answers None (the view's 404) so ids do not leak existence. No
    birth details, no phone, no email, no admin — the 027 header's rule:
    other people's faces come from a narrow projection, never a wider
    policy on the table. avatar_url rides along as 027's documented
    follow-up for authors_public."""
    from apps.consultants.models import Consultant, ConsultantStatus
    from apps.content.models import Content

    visible = Content.objects.filter(
        author_id=profile_id, status=Content.Status.LIVE
    ).exists() or Consultant.objects.filter(
        profile_id=profile_id, status=ConsultantStatus.APPROVED
    ).exists()
    if not visible:
        return None
    profile = Profile.objects.filter(pk=profile_id).first()
    if profile is None:
        return None
    return {
        "id": str(profile.id),
        "name": profile.name,
        "avatar_url": profile.avatar_url,
    }


# ── avatars (027 onto the media spine) ───────────────────────────────────────


def set_avatar(user_id, asset_id):
    """Point the caller's profile row at a READY media asset of theirs.

    The upload half is the media app's presign -> PUT -> confirm (module 1;
    kind image, owner the caller, bytes in R2, Django never carries them).
    This is the write half, and every 027 invariant is checked here:

      * the asset must be the CALLER'S OWN — someone else's asset is a 404,
        not a 403, so asset ids do not leak existence (the media app's
        owner-scoping precedent);
      * the asset must be kind image and status ready — the row references
        a real, uploaded file, never a promise;
      * the stored URL is the asset's public URL plus a `?v=` cache-bust,
        byte-compatible with what avatar.js writes today (it is stored on
        the row, so every reader gets the same busted URL).

    Returns the stored URL."""
    asset = MediaAsset.objects.filter(pk=asset_id).first()
    if asset is None or not _same_uuid(asset.owner, user_id):
        raise Refusal(404, "not_found", "That upload does not exist.")
    if asset.kind != MediaAsset.Kind.IMAGE:
        raise Refusal(400, "invalid", "Avatars must be an image file.")
    if asset.status != MediaAsset.Status.READY:
        raise Refusal(409, "not_ready", "That upload is not ready yet.")

    url = f"{settings.MEDIA_PUBLIC_BASE_URL.rstrip('/')}/{asset.bucket_key}"
    busted = f"{url}?v={int(time.time() * 1000)}"
    Profile.objects.filter(pk=user_id).update(avatar_url=busted)
    return busted
