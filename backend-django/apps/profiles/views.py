"""Profile + avatar endpoints — the /v1/profiles surface the store.jsx
profile slice and avatar.js call after cutover (cutovers/
profiles.clientlib.js).

Parity notes, call for call with the Supabase the client talks to today:

  me      supabase.from('profiles').select('*').eq('id', user.id).single()
          -> GET /v1/profiles/me/ — profiles_select_own as an endpoint:
            the row is the CALLER'S, forced from the JWT (there is no id in
            the URL; the body cannot carry an identity, rule 3). The row
            shape is the PostgREST select('*') shape, key for key, so
            store.jsx's profile reads need no translation. No row is a 404
            so store.jsx's null-means-not-loaded distinction stays honest
            (the same answer PostgREST's .single() gives it today).
  save    supabase.from('profiles').update({...birth fields}).eq('id', ...)
          -> PATCH /v1/profiles/me/ — the 001/002 column grant as a
            serializer allow-list; creates the row if the signup trigger
            has not fired yet (ensure_profile). Onboarding double-submits
            are safe: the write is idempotent, and the Idempotency-Key
            middleware replays an exact retry.
  public  (no client call yet — the projection the 025/007 views expose)
          -> GET /v1/profiles/<id>/ — name + avatar_url only, only for a
            profile the public surfaces already show; AllowAny, exactly
            like the views' anon grants. 404, never a wider read.
  avatar  supabase.storage.upload('<uid>/avatar') + update avatar_url
          -> POST /v1/media/presign/ (kind image) -> PUT to the bucket ->
            POST /v1/media/<id>/confirm/ -> POST /v1/profiles/me/avatar/
            {asset_id}. Bytes go straight to R2; Django carries only the
            metadata (docs/07 §4). The profiles row references the READY
            asset — 027's mapping onto the media spine.

Permission matrix (001's policies as endpoints): me is authenticated and
owner-scoped by construction; the public endpoint is anonymous like the
views' grants; there is no admin shape here — 001's policies give an admin
nothing on this table that the owner does not have (docs/05 §6 keeps admin
tier in admin_users, not in wider table access).
"""

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.fields import CoordinateField
from apps.core.views import refusal_body

from . import services
from .interests import INTERESTS, MAX_PICK, MIN_PICK
from .models import EMAIL_SHAPE, GENDERS, Profile


class OnboardingInput(serializers.Serializer):
    """The writable-column allow-list (001's grant + 002's email). Every
    field optional — PATCH applies what is present and leaves the rest
    alone (the onboarding write always sends the full birth set; the
    profile screen's later edits send what changed). Fields outside this
    list (admin, phone, legacy_id, id, created_at, avatar_url) never
    enter: unknown keys are ignored like a column the grant does not
    name, and the email shape is 002's CHECK at the door, not as a raw
    driver message on the reveal screen."""

    name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.RegexField(EMAIL_SHAPE, required=False, allow_null=True)
    birth_date = serializers.DateField(required=False, allow_null=True)
    birth_time = serializers.TimeField(required=False, allow_null=True)
    birth_time_known = serializers.BooleanField(required=False)
    birth_place = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Rounded, not refused: the geocoder returns more decimals than the
    # column holds, and refusing them is an unfixable signup (core/fields).
    birth_lat = CoordinateField(90, required=False, allow_null=True)
    birth_lon = CoordinateField(180, required=False, allow_null=True)
    birth_zone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    gender = serializers.ChoiceField(choices=GENDERS, required=False, allow_null=True)
    # A line under the picture; "Available" when empty (4 Oct 2026).
    bio = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=150, trim_whitespace=True)
    # Three to five keys of profiles.interests.INTERESTS (Phase 15a).
    interests = serializers.ListField(
        child=serializers.ChoiceField(choices=list(INTERESTS)),
        required=False,
        min_length=MIN_PICK,
        max_length=MAX_PICK,
    )

    def validate_interests(self, value):
        picked = list(dict.fromkeys(value))  # once each, in the order picked
        if len(picked) < MIN_PICK:
            raise serializers.ValidationError(f"Pick at least {MIN_PICK}.")
        return picked


class AvatarInput(serializers.Serializer):
    """{asset_id} — a media_assets row the caller owns and has confirmed.
    No URL in the body: the server derives the public URL from the asset
    it can verify, never from something the client asserts (rule 3)."""

    asset_id = serializers.UUIDField()


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    """GET: the caller's own full row. PATCH: the onboarding/save write."""
    if request.method == "GET":
        profile = Profile.objects.filter(pk=request.user.pk).first()
        if profile is None:
            return Response(
                refusal_body("not_found", "No profile on this account yet."),
                status=404,
            )
        # Everybody has a username from their first read (11 Oct 2026).
        services.ensure_username(profile)
        return Response(services.serialize_profile(profile))

    serializer = OnboardingInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    profile = services.save_onboarding(
        request.user.pk, request.user.phone, dict(serializer.validated_data)
    )
    return Response(services.serialize_profile(profile))


@api_view(["GET"])
@permission_classes([AllowAny])  # the 025/007 views' grants cover anon
def public(request, profile_id):
    """The public projection for one profile — name and avatar_url, and
    only when the feed or the marketplace already shows this person.
    A stranger's read of a private profile is a 404: ids do not leak
    existence, and birth details, phone and email are never in this
    shape (001's policies own-row-only, kept)."""
    body = services.public_profile(profile_id)
    if body is None:
        return Response(
            refusal_body("not_found", "That profile is not available."),
            status=404,
        )
    return Response(body)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def avatar(request):
    """The write half of the avatar flow: point the caller's row at a
    READY image asset they own. Owner-scoped like the media app's status
    poll (someone else's asset is a 404, not a 403)."""
    serializer = AvatarInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        url = services.set_avatar(request.user.pk, serializer.validated_data["asset_id"])
    except services.Refusal as refusal:
        return Response(
            refusal_body(refusal.reason, refusal.message), status=refusal.status
        )
    return Response({"ok": True, "avatar_url": url})


# ── usernames (11 Oct 2026, Rahul) ───────────────────────────────────────────


class UsernameInput(serializers.Serializer):
    username = serializers.CharField(max_length=64, trim_whitespace=True)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def username_check(request):
    """?u=<name> -> {username, ok, message}: Settings checks as you type.
    Signed-in only — it says whether a name is taken, which is no business
    of an anonymous script."""
    return Response(services.username_status(request.query_params.get("u", ""), request.user.pk))


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def my_username(request):
    """Choose your username. 400 for a bad one, 409 if taken, 429 inside the
    30 days since your last choice."""
    serializer = UsernameInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        profile = services.set_username(request.user.pk, serializer.validated_data["username"])
    except services.Refusal as refusal:
        return Response(refusal_body(refusal.reason, refusal.message), status=refusal.status)
    return Response(services.serialize_profile(profile))


@api_view(["GET"])
@permission_classes([AllowAny])
def by_username(request, username):
    """1namo.com/<username> asks this which page to open: {id, username,
    is_consultant}. Only for somebody the public surfaces already show; a
    404 otherwise, the same answer as a name nobody has."""
    body = services.resolve_username(username)
    if body is None:
        return Response(refusal_body("not_found", "Nobody by that name."), status=404)
    return Response(body)
