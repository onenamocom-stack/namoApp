"""Module 9 — profile + avatar (docs/07 §6 step 9): the pytest port of
001_profiles.sql / 002_profiles_email.sql / 027_profile_avatars.sql's rules
as endpoints, plus the seams the other modules' gateways now read through.

There is no `001_profiles_check.sql` — 001/002/027 are small and their
rules ARE the spec, so the suite below is the ported check:

  * the RLS matrix as endpoints: me is own-row-only (identity forced from
    the JWT — there is no id in the URL at all), the public read exposes
    only the 025/007 projection (name + avatar_url, and only for a profile
    the public surfaces already show), birth details / phone / email never
    leave through any shape but the owner's own row
  * the column grant as a serializer allow-list: 001's grant + 002's email
    are writable; admin, phone, legacy_id, id, created_at are not, even on
    the caller's own row; avatar_url is set only through the asset-validated
    avatar endpoint (027's quiet-failure trap made unreachable)
  * 002's shape CHECK at the door (a 400 the interface can show, not a raw
    driver message on the reveal screen) AND at the storage layer
    (profiles_email_shape, executable on SQLite)
  * the onboarding write shape, key for key with what Computing.jsx sends:
    {name, email, birth_date, birth_time, birth_time_known, birth_place,
    birth_lat, birth_lon, birth_zone}, partial-updatable, idempotent, and
    row-creating when the signup trigger has not fired yet
    (handle_new_user as code, with the 'there' fallback)
  * the avatar flow end to end: media presign -> confirm -> profiles row
    referencing the READY asset, owner-scoped at every step (someone else's
    asset is a 404, not a 403, so ids do not leak existence)
  * the races: onboarding double-submit (two threads, one row, one answer),
    Idempotency-Key replay, double avatar set
"""

import threading

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.consultants.models import Consultant
from apps.content.models import Content
from apps.media.models import MediaAsset
from apps.profiles import services
from apps.profiles.models import Profile

from .conftest import OTHER_USER, TEST_USER, make_claims

ME = "/v1/profiles/me/"
AVATAR = "/v1/profiles/me/avatar/"
PRESIGN = "/v1/media/presign/"

# The exact write Computing.jsx makes on the reveal screen — the contract.
ONBOARDING_BODY = {
    "name": "Ananya Sharma",
    "email": "ananya@example.com",
    "birth_date": "1996-11-14",
    "birth_time": "04:35:00",
    "birth_time_known": True,
    "birth_place": "Pune, Maharashtra, India",
    "birth_lat": 18.5204,
    "birth_lon": 73.8567,
    "birth_zone": "Asia/Kolkata",
}


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def clean_profiles():
    Profile.objects.all().delete()
    yield


@pytest.fixture
def other_client(sign_hs256, hs256_mode):
    """A second signed-in user. NOTE: DRF's APIClient lets credentials()
    OVERRIDE per-request headers (kwargs.update(self._credentials)), so a
    client per user is the only honest way to act as two people — passing
    an Authorization header to a credentialed client does nothing."""
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {sign_hs256(claims=make_claims(sub=OTHER_USER))}"
    )
    return client


def make_profile(pid=TEST_USER, name="Tara Verma", phone=None, **fields):
    return Profile.objects.create(id=pid, phone=phone or str(pid), name=name, **fields)


def full_profile(pid=TEST_USER, **overrides):
    fields = dict(
        phone="+919999900001",
        name="Tara Verma",
        email="tara@example.com",
        birth_date="1994-03-12",
        birth_time="07:40:00",
        birth_time_known=True,
        birth_place="Jaipur, Rajasthan, India",
        birth_lat=26.9124,
        birth_lon=75.7873,
        birth_zone="Asia/Kolkata",
    )
    fields.update(overrides)
    return make_profile(pid=pid, **fields)


def presign(client, **overrides):
    body = dict(
        kind="image", filename="face.jpg", size_bytes=2048, mime="image/jpeg"
    )
    body.update(overrides)
    return client.post(PRESIGN, body, format="json")


def confirmed_asset(client, **overrides):
    """presign -> confirm AS THAT CLIENT, returning the READY asset id."""
    created = presign(client, **overrides)
    assert created.status_code == 201, created.content
    asset_id = created.json()["asset_id"]
    confirmed = client.post(f"/v1/media/{asset_id}/confirm/")
    assert confirmed.status_code == 200
    return asset_id


@pytest.mark.django_db
class TestMeRead:
    """profiles_select_own as an endpoint."""

    def test_anonymous_is_401(self, api_client):
        response = api_client.get(ME)
        assert response.status_code == 401
        assert response.json()["reason"] == "unauthenticated"

    def test_self_gets_the_full_row_postgrest_shape(self, authed_client, clean_profiles):
        full_profile()
        response = authed_client.get(ME)
        assert response.status_code == 200
        body = response.json()
        # key for key with select('*') on the real table — store.jsx reads
        # these names verbatim
        assert set(body) == {
            "id", "phone", "name", "email", "birth_date", "birth_time",
            "birth_time_known", "birth_place", "birth_lat", "birth_lon",
            "birth_zone", "admin", "legacy_id", "avatar_url", "created_at",
            # 23 Sep: the two moderation flags. Not PostgREST's select('*')
            # any more, and that is fine — the client stopped reading this
            # through PostgREST at the cutover. They are here because the
            # composer draws a Reel tab off the first and the app tells a
            # blocked person why their posts are refused off the second.
            "video_enabled", "blocked",
        }
        assert body["id"] == TEST_USER
        assert body["phone"] == "+919999900001"
        assert body["birth_date"] == "1994-03-12"
        assert body["birth_time"] == "07:40:00"
        assert body["birth_time_known"] is True
        assert body["birth_lat"] == 26.9124
        assert body["admin"] is False
        assert body["video_enabled"] is False
        assert body["blocked"] is False
        assert body["created_at"]

    def test_no_row_is_404_not_a_blank_row(self, authed_client, clean_profiles):
        # store.jsx's null means not-loaded: a missing row must be a refusal,
        # not a 200 carrying invented nulls
        response = authed_client.get(ME)
        assert response.status_code == 404
        assert response.json()["reason"] == "not_found"

    def test_identity_is_forced_from_the_jwt(self, api_client, sign_hs256,
                                             hs256_mode, clean_profiles):
        # no id anywhere in the URL: the token decides whose row this is,
        # and nobody else's birth details can be asked for (rule 3)
        full_profile(TEST_USER, birth_place="Jaipur")
        full_profile(OTHER_USER, phone="+919999900002", birth_place="Berlin")
        own = api_client.get(ME, **auth(sign_hs256()))
        assert own.status_code == 200
        assert own.json()["birth_place"] == "Jaipur"
        other = api_client.get(
            ME, **auth(sign_hs256(claims=make_claims(sub=OTHER_USER)))
        )
        assert other.status_code == 200
        assert other.json()["birth_place"] == "Berlin"
        assert other.json()["phone"] == "+919999900002"


@pytest.mark.django_db
class TestOnboardingWrite:
    """The 001/002 column grant as code, with Computing.jsx's exact shape."""

    def test_full_onboarding_write_lands(self, authed_client, clean_profiles):
        full_profile(birth_date=None, birth_time=None, birth_place=None,
                     birth_lat=None, birth_lon=None, birth_zone=None, email=None)
        response = authed_client.patch(ME, ONBOARDING_BODY, format="json")
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["name"] == "Ananya Sharma"
        assert body["email"] == "ananya@example.com"
        assert body["birth_date"] == "1996-11-14"
        assert body["birth_time"] == "04:35:00"
        assert body["birth_time_known"] is True
        assert body["birth_place"] == "Pune, Maharashtra, India"
        assert body["birth_lat"] == 18.5204
        assert body["birth_lon"] == 73.8567
        assert body["birth_zone"] == "Asia/Kolkata"
        # and the row itself says the same (the read-back is not the source)
        row = Profile.objects.get(pk=TEST_USER)
        assert row.name == "Ananya Sharma"
        assert str(row.birth_date) == "1996-11-14"
        assert row.birth_time.strftime("%H:%M:%S") == "04:35:00"

    def test_unknown_birth_time_is_stored_as_a_pair(self, authed_client, clean_profiles):
        full_profile()
        response = authed_client.patch(
            ME,
            {"birth_time": None, "birth_time_known": False},
            format="json",
        )
        assert response.status_code == 200
        body = response.json()
        # NULL time and `false` — the same answer said twice, so the screens
        # can withhold the ascendant (05-BACKEND-SCHEMA.md §4.1)
        assert body["birth_time"] is None
        assert body["birth_time_known"] is False

    def test_partial_patch_leaves_the_rest_alone(self, authed_client, clean_profiles):
        full_profile()
        response = authed_client.patch(ME, {"name": "Renamed"}, format="json")
        assert response.status_code == 200
        assert response.json()["name"] == "Renamed"
        row = Profile.objects.get(pk=TEST_USER)
        assert row.birth_place == "Jaipur, Rajasthan, India"
        assert row.email == "tara@example.com"

    def test_empty_email_normalizes_to_null(self, authed_client, clean_profiles):
        full_profile()
        response = authed_client.patch(ME, {"email": None}, format="json")
        assert response.status_code == 200
        assert response.json()["email"] is None

    def test_non_writable_columns_are_dropped_not_applied(self, authed_client,
                                                          clean_profiles):
        # 001's comment as the spec: the policy scopes WHICH ROW, the grant
        # scopes WHICH COLUMNS — admin / phone / legacy_id / id / created_at
        # stay out of client reach even on the caller's own row
        full_profile()
        response = authed_client.patch(
            ME,
            {
                "admin": True,
                "phone": "+919000000000",
                "legacy_id": "seed-1",
                "id": OTHER_USER,
                "created_at": "2000-01-01T00:00:00Z",
                "avatar_url": "https://evil.example/face.jpg",
                "name": "Still Me",
            },
            format="json",
        )
        assert response.status_code == 200
        row = Profile.objects.get(pk=TEST_USER)
        assert row.name == "Still Me"          # the writable field applied
        assert row.admin is False              # nothing else moved
        assert row.phone == "+919999900001"
        assert row.legacy_id is None
        assert row.avatar_url is None
        assert Profile.objects.filter(pk=OTHER_USER).count() == 0

    def test_bad_email_shape_is_a_door_refusal_not_a_driver_message(
        self, authed_client, clean_profiles
    ):
        full_profile()
        response = authed_client.patch(ME, {"email": "not-an-email"}, format="json")
        assert response.status_code == 400
        body = response.json()
        assert body["ok"] is False and body["reason"] == "invalid"
        # Computing.jsx surfaces the server's answer on the reveal screen:
        # the refusal names the field (the message is the standard envelope,
        # the errors carry the detail) — never a raw CHECK violation text
        assert "email" in body["errors"]

    def test_bad_calendar_date_is_400_not_a_crash(self, authed_client, clean_profiles):
        full_profile()
        response = authed_client.patch(
            ME, {"birth_date": "1997-02-31"}, format="json"
        )
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"
        # the row is untouched — a refused shape writes nothing
        assert str(Profile.objects.get(pk=TEST_USER).birth_date) == "1994-03-12"

    def test_geocoder_precision_is_rounded_not_refused(self, authed_client, clean_profiles):
        # The place search returns up to eight decimals (Pune comes back as
        # 18.52322222) and the column holds six. Refusing that reads as
        # "Check the highlighted fields" against a birthplace picked from our
        # own search, with no way for the person to fix it — so it rounds.
        full_profile()
        response = authed_client.patch(
            ME, {"birth_lat": 18.52322222, "birth_lon": 73.87586111}, format="json"
        )
        assert response.status_code == 200, response.content
        assert response.json()["birth_lat"] == 18.523222
        assert response.json()["birth_lon"] == 73.875861
        row = Profile.objects.get(pk=TEST_USER)
        assert str(row.birth_lat) == "18.523222"

    def test_out_of_range_coordinates_are_400(self, authed_client, clean_profiles):
        full_profile()
        response = authed_client.patch(
            ME, {"birth_lat": 1234.5}, format="json"
        )
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"

    def test_patch_creates_the_row_when_the_trigger_has_not_fired(
        self, api_client, sign_hs256, hs256_mode, clean_profiles
    ):
        # fresh database / trigger-not-yet window: the onboarding write is
        # an upsert keyed on the JWT identity, with the phone from the claims
        response = api_client.patch(
            ME, ONBOARDING_BODY, format="json", **auth(sign_hs256())
        )
        assert response.status_code == 200, response.content
        row = Profile.objects.get(pk=TEST_USER)
        assert row.phone == make_claims()["phone"]
        assert row.name == "Ananya Sharma"
        assert str(row.birth_date) == "1996-11-14"

    def test_anonymous_patch_is_401(self, api_client, clean_profiles):
        response = api_client.patch(ME, ONBOARDING_BODY, format="json")
        assert response.status_code == 401


@pytest.mark.django_db
class TestEmailShapeCheck:
    """002's named CHECK, executable at the storage layer."""

    def test_model_check_constraint_is_named_for_the_fake_in(self):
        names = [c.name for c in Profile._meta.constraints]
        assert "profiles_email_shape" in names

    def test_bad_email_refused_by_the_database(self, clean_profiles):
        with pytest.raises(IntegrityError):
            make_profile(email="not-an-email")

    def test_null_email_passes(self, clean_profiles):
        make_profile(email=None)

    def test_shape_is_case_insensitive_like_the_sql_regex(self, clean_profiles):
        # 002's CHECK uses ~* — A@B.CO is as shaped as a@b.co
        make_profile(email="A@B.CO")


@pytest.mark.django_db
class TestPublicRead:
    """The narrow public projection — name + avatar_url, and only for a
    profile the 025/007 views already expose. Own-row-only is not widened:
    a stranger's read of a private profile is a 404 so ids do not leak
    existence, and no shape but the owner's carries birth details."""

    def test_private_profile_is_invisible_to_anonymous(self, api_client,
                                                        clean_profiles):
        full_profile()
        response = api_client.get(f"/v1/profiles/{TEST_USER}/")
        assert response.status_code == 404
        assert response.json()["reason"] == "not_found"

    def test_private_profile_is_invisible_to_a_signed_in_stranger(
        self, authed_client, clean_profiles
    ):
        full_profile()
        response = authed_client.get(f"/v1/profiles/{TEST_USER}/")
        assert response.status_code == 404

    def test_nonexistent_id_is_also_404(self, api_client, clean_profiles):
        response = api_client.get(f"/v1/profiles/{OTHER_USER}/")
        assert response.status_code == 404

    def test_author_with_live_content_is_public_named(self, api_client,
                                                      clean_profiles):
        full_profile(avatar_url="https://media.example/faces/tara.jpg?v=1")
        Content.objects.create(author_id=TEST_USER, kind="post", caption="hello")
        response = api_client.get(f"/v1/profiles/{TEST_USER}/")
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"id", "name", "avatar_url"}  # nothing else, ever
        assert body["id"] == TEST_USER
        assert body["name"] == "Tara Verma"
        assert body["avatar_url"] == "https://media.example/faces/tara.jpg?v=1"

    def test_author_with_only_a_draft_is_not_public(self, api_client,
                                                    clean_profiles):
        full_profile()
        Content.objects.create(author_id=TEST_USER, kind="post",
                               status="draft", caption="quiet")
        assert api_client.get(f"/v1/profiles/{TEST_USER}/").status_code == 404

    def test_approved_consultant_is_public_named(self, api_client, clean_profiles):
        full_profile()
        Consultant.objects.create(profile_id=TEST_USER, category="Astrologer",
                                  status="approved")
        response = api_client.get(f"/v1/profiles/{TEST_USER}/")
        assert response.status_code == 200
        assert response.json()["name"] == "Tara Verma"

    def test_pending_consultant_is_not_public(self, api_client, clean_profiles):
        full_profile()
        Consultant.objects.create(profile_id=TEST_USER, category="Astrologer",
                                  status="pending")
        assert api_client.get(f"/v1/profiles/{TEST_USER}/").status_code == 404

    def test_public_shape_carries_no_birth_details(self, api_client, clean_profiles):
        full_profile()
        Content.objects.create(author_id=TEST_USER, kind="post", caption="hi")
        body = api_client.get(f"/v1/profiles/{TEST_USER}/").json()
        for forbidden in ("birth_date", "birth_time", "birth_time_known",
                          "birth_place", "birth_lat", "birth_lon", "birth_zone",
                          "phone", "email", "admin", "legacy_id", "created_at"):
            assert forbidden not in body


@pytest.mark.django_db
class TestAvatarFlow:
    """027's mapping onto the media spine: presign -> PUT (client->R2) ->
    confirm -> the profiles row references the READY asset. Owner-scoped at
    every step; the stored URL is the public URL plus a ?v= cache-bust,
    byte-compatible with what avatar.js writes today."""

    def test_full_flow_sets_the_avatar(self, authed_client, clean_profiles,
                                       settings):
        settings.MEDIA_PUBLIC_BASE_URL = "https://media.test"
        full_profile()
        asset_id = confirmed_asset(authed_client)
        response = authed_client.post(AVATAR, {"asset_id": asset_id}, format="json")
        assert response.status_code == 200, response.content
        body = response.json()
        assert body["ok"] is True
        asset = MediaAsset.objects.get(id=asset_id)
        assert body["avatar_url"].startswith(
            f"https://media.test/{asset.bucket_key}?v="
        )
        # the row references it, and the owner's own read shows it — what
        # Profile.jsx's AvatarPicker refreshes to prove the upload landed
        assert Profile.objects.get(pk=TEST_USER).avatar_url == body["avatar_url"]
        assert authed_client.get(ME).json()["avatar_url"] == body["avatar_url"]

    def test_unauthenticated_is_401(self, api_client, clean_profiles):
        response = api_client.post(AVATAR, {"asset_id": str(OTHER_USER)},
                                   format="json")
        assert response.status_code == 401

    def test_someone_elses_asset_is_404_not_403(self, authed_client, other_client,
                                                clean_profiles):
        # owner-scoping like the media app's status poll: ids do not leak
        # existence, and 027's grant could never point a row at a file the
        # caller does not own — here it is structural
        full_profile()
        asset_id = confirmed_asset(other_client)
        response = authed_client.post(AVATAR, {"asset_id": asset_id}, format="json")
        assert response.status_code == 404
        assert response.json()["reason"] == "not_found"
        assert Profile.objects.get(pk=TEST_USER).avatar_url is None

    def test_nonexistent_asset_is_404(self, authed_client, clean_profiles):
        full_profile()
        response = authed_client.post(AVATAR, {"asset_id": str(OTHER_USER)},
                                      format="json")
        assert response.status_code == 404

    def test_unconfirmed_asset_is_refused(self, authed_client, clean_profiles):
        # the PUT never landed: the row may only reference a READY asset,
        # never a promise
        full_profile()
        created = presign(authed_client)
        asset_id = created.json()["asset_id"]
        assert MediaAsset.objects.get(id=asset_id).status == "processing"
        response = authed_client.post(AVATAR, {"asset_id": asset_id}, format="json")
        assert response.status_code == 409
        assert response.json()["reason"] == "not_ready"
        assert Profile.objects.get(pk=TEST_USER).avatar_url is None

    def test_non_image_asset_is_refused(self, authed_client, clean_profiles):
        full_profile()
        asset_id = confirmed_asset(
            authed_client,
            kind="reel", filename="clip.mp4", mime="video/mp4",
        )
        response = authed_client.post(AVATAR, {"asset_id": asset_id}, format="json")
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"

    def test_double_set_is_idempotent(self, authed_client, clean_profiles,
                                      settings):
        # a retrying client (pressed twice, flaky network) is harmless: the
        # row points at the same asset either way
        settings.MEDIA_PUBLIC_BASE_URL = "https://media.test"
        full_profile()
        asset_id = confirmed_asset(authed_client)
        first = authed_client.post(AVATAR, {"asset_id": asset_id}, format="json")
        second = authed_client.post(AVATAR, {"asset_id": asset_id}, format="json")
        assert first.status_code == 200 and second.status_code == 200
        assert first.json()["avatar_url"].split("?v=")[0] == (
            second.json()["avatar_url"].split("?v=")[0]
        )

    def test_avatar_url_not_writable_through_the_save_endpoint(
        self, authed_client, clean_profiles
    ):
        # 027 re-issued the column grant so a bare UPDATE could set it — the
        # Django path deliberately routes the write through the asset check
        # instead (the grant's quiet-failure trap made unreachable)
        full_profile()
        response = authed_client.patch(
            ME, {"avatar_url": "https://evil.example/x.jpg?v=1"}, format="json"
        )
        assert response.status_code == 200
        assert Profile.objects.get(pk=TEST_USER).avatar_url is None


@pytest.mark.django_db
class TestSeams:
    """The gateway functions the other modules re-pointed to — the answers
    their suites rely on, asserted at the seam itself."""

    def test_get_birth_details_is_caller_scoped_and_none_when_absent(
        self, clean_profiles
    ):
        full_profile()
        birth = services.get_birth_details(TEST_USER)
        assert birth == {
            "birth_date": "1994-03-12",
            "birth_time": "07:40:00",
            "birth_time_known": True,
            "birth_lat": 26.9124,
            "birth_lon": 75.7873,
            "birth_zone": "Asia/Kolkata",
        }
        assert services.get_birth_details(OTHER_USER) is None

    def test_profile_names_bulk_read_is_canonical(self, clean_profiles):
        make_profile(TEST_USER, "Tara Verma")
        make_profile(OTHER_USER, "Arjun Nair")
        names = services.profile_names([TEST_USER, OTHER_USER])
        assert names[TEST_USER] == "Tara Verma"
        assert names[OTHER_USER] == "Arjun Nair"
        assert services.profile_names([]) == {}

    def test_ensure_profile_is_handle_new_user_as_code(self, clean_profiles):
        profile, created = services.ensure_profile(TEST_USER, phone="+919999900001")
        assert created is True
        assert profile.name == "there"  # the coalesce fallback, verbatim
        again, created_again = services.ensure_profile(
            TEST_USER, phone="+919999900001", name="Ignored"
        )
        assert created_again is False
        assert str(again.pk) == str(profile.pk)
        assert Profile.objects.count() == 1


@pytest.mark.django_db(transaction=True)
class TestRaces:
    """Onboarding double-submits and retries: one row, one answer. Threads
    need their own connections to the same file-backed database, so these
    run transactional (no wrapping atomic on the main connection — the
    wallet race tests' pattern)."""

    def test_concurrent_first_writes_make_one_row(self, clean_profiles):
        # The onboarding double-submit at the service seam (the wallet race
        # tests' pattern: one connection per thread, barrier-released).
        # Two PATCHes landing before the signup trigger fired must collapse
        # to one row — the insert IS the check, the loser reads the winner.
        barrier = threading.Barrier(2)
        results = []

        def submit():
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            try:
                results.append(
                    services.save_onboarding(
                        TEST_USER, make_claims()["phone"], dict(ONBOARDING_BODY)
                    )
                )
            finally:
                connection.close()

        threads = [threading.Thread(target=submit) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert len(results) == 2
        # the create raced: the unique primary key collapsed it to one row
        assert Profile.objects.count() == 1
        row = Profile.objects.get()
        assert row.name == "Ananya Sharma"
        assert str(row.birth_date) == "1996-11-14"
        assert str(row.id) == TEST_USER

    def test_idempotency_key_replays_the_onboarding_write(self, authed_client,
                                                          clean_profiles):
        full_profile()
        first = authed_client.patch(
            ME, {"name": "First"}, format="json", HTTP_IDEMPOTENCY_KEY="onboard-1"
        )
        second = authed_client.patch(
            ME, {"name": "First"}, format="json", HTTP_IDEMPOTENCY_KEY="onboard-1"
        )
        assert first.status_code == 200 and second.status_code == 200
        # the replay did not re-execute: the stored response is the answer
        assert second.json() == first.json()
        assert Profile.objects.get(pk=TEST_USER).name == "First"

    def test_repeated_onboarding_write_is_a_noop(self, authed_client, clean_profiles):
        # the client's written.current guard is the first line; the server
        # is idempotent anyway — same payload twice, same row, no drift
        full_profile()
        for _ in range(2):
            response = authed_client.patch(ME, ONBOARDING_BODY, format="json")
            assert response.status_code == 200
        row = Profile.objects.get(pk=TEST_USER)
        assert row.name == "Ananya Sharma"
        assert row.email == "ananya@example.com"
