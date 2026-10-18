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

import random
import re
import time
import unicodedata
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Exists, OuterRef, Q, Subquery, TextField
from django.utils import timezone

from apps.media.models import MediaAsset

from . import username_rules
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
    "gender",
    "bio",
    "interests",
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
        "gender": profile.gender,
        "admin": profile.admin,
        # The video flag reaches the client so the composer can draw a Reel
        # tab. It GRANTS nothing — the server's kind gate is the permission
        # and refuses a clip from somebody without it whatever the UI shows.
        # This is the same relationship ProStudio's `kinds` prop already had
        # with the 025 policy: it decides which tabs are drawn, not who may
        # publish.
        "video_enabled": profile.video_enabled,
        "influencer": profile.influencer,  # Content step 2
        "referrer": profile.referrer or profile.influencer,  # Content step 1 (17 Oct 2026); step 2 includes it
        "seller": profile.seller,  # the Seller module (docs/06 Phase 18)
        "bio": profile.bio,
        "interests": profile.interests,
        "username": profile.username,
        "username_changed_at": (
            profile.username_changed_at.isoformat() if profile.username_changed_at else None
        ),
        # Blocked people are told so rather than left to discover it by
        # having every post refused with no explanation.
        "blocked": profile.blocked_at is not None,
        "legacy_id": profile.legacy_id,
        "avatar_url": profile.avatar_url,
        "created_at": profile.created_at.isoformat(),
    }


# ── row creation and the onboarding write ────────────────────────────────────


def _ensure_wallet(profile_id):
    """The wallet half of what `handle_new_user` does. Imported here
    rather than at module scope: profiles is the lower-level module and
    the wallet already reads profiles, so a top-level import would close
    the loop."""
    from apps.wallet import services as wallet_services

    wallet_services.ensure_wallet(profile_id)


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
            created = Profile.objects.create(
                id=user_id,
                phone=phone if phone else f"+unknown-{user_id}",
                name=name or DEFAULT_NAME,
            )
            # THE WALLET COMES WITH THE PROFILE, because the Supabase
            # trigger this function stands in for creates both. Without
            # it an account exists that cannot be charged and cannot be
            # told why usefully: `debit` answers "No wallet on this
            # account", which names no fix and is not the seeker's fault.
            #
            # Seen for real on 25 Sep: `reset_test_account` removed a
            # profile and its wallet, signing in recreated the profile
            # here, and the account was left unable to pay for anything.
            # A restored backup or a trigger that did not fire produces
            # the same state.
            _ensure_wallet(created.id)
            return created, True
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
    (rule 3). One endpoint shows them to somebody else: the consultant of a
    LIVE session with this person, for their kundli (astro client_chart,
    17 Oct 2026). A query ERROR
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


def birth_place(profile_id):
    """The birth place as typed, for the consultant's kundli header."""
    return Profile.objects.filter(pk=profile_id).values_list("birth_place", flat=True).first()


def profile_name(profile_id):
    """The public name of a profile, or None when there is no row — the
    007/010/025 view joins, as a lookup. A name leaves this module only
    through the public projections, exactly as before."""
    row = Profile.objects.filter(pk=profile_id).values_list("name", flat=True).first()
    return row if row is not None else None


def is_blocked(profile_id):
    """Has an admin blocked this person? Used by every write path that
    publishes something — a blocked account is refused before the thing it
    is trying to post is even looked at."""
    return Profile.objects.filter(
        pk=profile_id, blocked_at__isnull=False
    ).exists()


def video_enabled(profile_id):
    """Is the video flag on for this person?

    A capability, not a role — see `apps/content/services._may_post_video`
    for why the two are kept apart. This answers only the flag; the
    consultant and admin routes to video are that function's business.
    """
    return Profile.objects.filter(
        pk=profile_id, video_enabled=True, blocked_at__isnull=True
    ).exists()


def is_creator(profile_id):
    """A Creator (13 Oct 2026, Rahul; the console's "Make creator", stored as
    `influencer`): a blue tick, and every kind of post."""
    return Profile.objects.filter(
        pk=profile_id, influencer=True, blocked_at__isnull=True
    ).exists()


def may_refer(profile_id):
    """Content step 1 or step 2 (Rahul, 17 Oct 2026): tags products,
    shares product links, holds the A code and earns on all three, earns
    on sign-ups, sees insights. Pay on views is step 2's alone
    (`is_creator`)."""
    return Profile.objects.filter(
        Q(referrer=True) | Q(influencer=True), pk=profile_id, blocked_at__isnull=True
    ).exists()


def creator_subquery(outer_field):
    """ORM annotation: does the row's <outer_field> carry the blue tick
    without being a Pro: Content step 2 only (Rahul, 17 Oct 2026; Seller
    and step 1 carry none, Seller did from 16 Oct). Display only; what a
    person may do reads `is_creator`, `may_refer` and `modules.is_seller`."""
    return Exists(Profile.objects.filter(id=OuterRef(outer_field), influencer=True))


def set_influencer(profile_id, on):
    """The console's influencer switch; True when a row actually changed."""
    return Profile.objects.filter(pk=profile_id).exclude(
        influencer=on
    ).update(influencer=on) == 1


def set_video_enabled(profile_id, on):
    """The console's switch. Returns whether a row actually changed, so the
    caller can skip writing an audit line for a no-op."""
    return Profile.objects.filter(pk=profile_id).exclude(
        video_enabled=on
    ).update(video_enabled=on) == 1


def set_blocked(profile_id, blocked, reason=None):
    """Block or unblock. Returns whether a row changed.

    Blocking DELETES NOTHING. Their posts stop being served and new ones
    are refused, and that is all — unblocking has to be able to put
    everything back, and a removed account in a dispute is evidence.
    """
    fields = {
        "blocked_at": timezone.now() if blocked else None,
        "blocked_reason": reason if blocked else None,
    }
    qs = Profile.objects.filter(pk=profile_id)
    qs = qs.filter(blocked_at__isnull=True) if blocked else qs.filter(blocked_at__isnull=False)
    return qs.update(**fields) == 1


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


def avatar_subquery(outer_field):
    """ORM annotation: the profile picture URL for the row's <outer_field>,
    public like the name (`public_profile`). For the feed's post headers
    (13 Oct 2026, Rahul: they showed initials only)."""
    return Subquery(
        Profile.objects.filter(id=OuterRef(outer_field)).values("avatar_url")[:1],
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
    """The narrow public row: id, name, avatar_url, bio — for anybody who
    is not blocked (17 Oct 2026, Rahul: "Search me सबका naam dikhe. We are
    social network." Before that, only somebody with a live post or an
    approved practice). A blocked account answers None, the view's 404. No
    birth details, no phone, no email, no admin — the 027 header's rule:
    other people's faces come from a narrow projection, never a wider
    policy on the table."""
    profile = Profile.objects.filter(pk=profile_id, blocked_at__isnull=True).first()
    if profile is None:
        return None
    return {
        "id": str(profile.id),
        "name": profile.name,
        "avatar_url": profile.avatar_url,
        "bio": profile.bio,
    }


def search_people(q, limit=30):
    """People by name or username, for Search's People tab (14 Oct 2026,
    Rahul). Everybody with a name who is not blocked (17 Oct 2026, Rahul:
    "We are social network"; before that only people with a live post or an
    approved practice). Two characters at least."""
    from django.db.models import Q

    from apps.consultants.models import Consultant, ConsultantStatus

    q = (q or "").strip().lstrip("@")
    if len(q) < 2:
        return []
    rows = (
        Profile.objects.filter(Q(name__icontains=q) | Q(username__istartswith=q))
        .filter(blocked_at__isnull=True)
        .exclude(name__isnull=True).exclude(name="")
        .order_by("name")[:limit]
    )
    approved_ids = set(
        Consultant.objects.filter(status=ConsultantStatus.APPROVED, profile_id__in=[r.id for r in rows])
        .values_list("profile_id", flat=True)
    )
    return [
        {
            "id": str(r.id), "name": r.name, "username": r.username,
            "avatar_url": r.avatar_url, "is_consultant": r.id in approved_ids,
            "is_creator": bool(r.influencer),
        }
        for r in rows
    ]


# ── usernames (11 Oct 2026, Rahul) ───────────────────────────────────────────
#
# 1namo.com/<username> instead of an id nobody can read. Everybody gets one
# automatically; Settings changes it once every 30 days. A username finds
# only what the public surfaces already show (resolve_username), so a
# seeker who has never posted is no more findable by name than by id.

USERNAME_COOLDOWN = timedelta(days=30)


def _slug_words(name):
    """The ASCII words of a display name: 'Rahul Jain' -> ['rahul', 'jain'].
    A name in Devanagari has none, and the caller falls back to 'user'."""
    ascii_name = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    return re.findall(r"[a-z0-9]+", ascii_name.lower())


def suggest_username(name):
    """name-surname-NNNN, e.g. rahul-jain-4821 (Rahul's default). The two
    first words of the name, cut so the number always fits in 30; 'user'
    when the name has no Latin letters or is the signup placeholder."""
    words = [w for w in _slug_words(name) if w] if name != DEFAULT_NAME else []
    base = "-".join(words[:2])[: username_rules.MAX_LEN - 5].strip("-") or "user"
    if not username_rules.LETTER.search(base):
        base = "user"
    candidate = f"{base}-{random.randint(1000, 9999)}"
    while len(candidate) < username_rules.MIN_LEN:
        candidate += str(random.randint(0, 9))
    if username_rules.problem(candidate):
        candidate = f"user-{random.randint(1000, 9999)}"
    return candidate


def ensure_username(profile):
    """Give `profile` its automatic username if it has none, and return it.
    The write is conditional on the column still being null, so two reads
    racing each other give one name, and a collision just tries a new
    number."""
    if profile.username:
        return profile.username
    for _ in range(20):
        candidate = suggest_username(profile.name)
        try:
            with transaction.atomic():
                updated = Profile.objects.filter(pk=profile.pk, username__isnull=True).update(
                    username=candidate
                )
        except IntegrityError:
            continue  # somebody has that one; draw another number
        if not updated:  # another request named it first
            profile.refresh_from_db(fields=["username"])
            return profile.username
        profile.username = candidate
        return candidate
    return None


def username_status(raw, user_id=None):
    """{username, ok, message} for the Settings field as the person types:
    the rules first, then whether somebody else has it. Your own current
    name counts as available."""
    name = username_rules.normalize(raw)
    message = username_rules.problem(name)
    if message is None:
        taken = Profile.objects.filter(username=name).exclude(pk=user_id).exists()
        if taken:
            message = "Somebody has that name. Try another."
    return {"username": name, "ok": message is None, "message": message}


def next_username_change(profile, now=None):
    """When the person may next choose a username, or None if they may now."""
    if profile.username_changed_at is None:
        return None
    at = profile.username_changed_at + USERNAME_COOLDOWN
    return at if at > (now or timezone.now()) else None


def set_username(user_id, raw):
    """The person's own choice. Refuses a bad or taken name (400/409) and a
    second change inside 30 days (429). Choosing the name you already have
    is a no-op, not a change."""
    profile = Profile.objects.filter(pk=user_id).first()
    if profile is None:
        raise Refusal(404, "not_found", "No profile on this account yet.")
    name = username_rules.normalize(raw)
    if name == profile.username:
        return profile
    message = username_rules.problem(name)
    if message:
        raise Refusal(400, "invalid", message)
    wait = next_username_change(profile)
    if wait is not None:
        day = timezone.localtime(wait)
        raise Refusal(
            429, "too_soon",
            f"You can change your username again on {day.day} {day.strftime('%b %Y')}.",
        )
    try:
        with transaction.atomic():
            Profile.objects.filter(pk=user_id).update(
                username=name, username_changed_at=timezone.now()
            )
    except IntegrityError:
        raise Refusal(409, "taken", "Somebody has that name. Try another.")
    profile.refresh_from_db()
    return profile


def resolve_username(raw):
    """{id, is_consultant} for the profile behind a username, for anybody
    not blocked (17 Oct 2026, the public_profile rule). Anything else is
    None, the view's 404."""
    from apps.consultants.models import Consultant, ConsultantStatus

    name = username_rules.normalize(raw)
    profile = Profile.objects.filter(username=name, blocked_at__isnull=True).first()
    if profile is None:
        return None
    pro = Consultant.objects.filter(
        profile_id=profile.pk, status=ConsultantStatus.APPROVED
    ).exists()
    return {"id": str(profile.pk), "username": profile.username, "is_consultant": pro}


def username_subquery(outer_field):
    """ORM annotation: the username for the row's <outer_field>."""
    return Subquery(
        Profile.objects.filter(id=OuterRef(outer_field)).values("username")[:1],
        output_field=TextField(),
    )


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
