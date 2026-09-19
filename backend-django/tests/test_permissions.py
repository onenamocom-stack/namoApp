import pytest

from .conftest import OTHER_USER, make_claims

PROBE_URLCONF = "tests.probe_urls"


@pytest.fixture
def probe_urls(settings):
    settings.ROOT_URLCONF = PROBE_URLCONF


@pytest.mark.django_db
@pytest.mark.usefixtures("probe_urls")
class TestRoleMatrix:
    """Seeker/consultant/admin claims -> 200/403, mirroring docs/05 §7.

    Auth is HS256 in these tests — the permission layer reads claims, not
    the verification mode.
    """

    def test_anonymous_is_401_everywhere(self, api_client, hs256_mode):
        for path in ("/probe/seeker/", "/probe/consultant/", "/probe/admin/"):
            response = api_client.get(path)
            assert response.status_code == 401, path
            assert response.json()["reason"] == "unauthenticated"

    def test_seeker_token(self, api_client, hs256_mode, sign_hs256, auth_headers):
        headers = auth_headers(sign_hs256(claims=make_claims(role="authenticated")))
        assert api_client.get("/probe/seeker/", **headers).status_code == 200
        for path in ("/probe/consultant/", "/probe/admin/"):
            response = api_client.get(path, **headers)
            assert response.status_code == 403, path
            assert response.json()["reason"] == "forbidden"

    def test_consultant_is_also_a_seeker(self, api_client, hs256_mode, sign_hs256, auth_headers):
        # docs/02 §5: a consultant is also a seeker — they have a wallet.
        headers = auth_headers(sign_hs256(claims=make_claims(role="consultant")))
        assert api_client.get("/probe/seeker/", **headers).status_code == 200
        assert api_client.get("/probe/consultant/", **headers).status_code == 200
        assert api_client.get("/probe/admin/", **headers).status_code == 403

    def test_admin_token(self, api_client, hs256_mode, sign_hs256, auth_headers):
        # Admin passes the admin probe, and IsSeeker too — every signed-in
        # user is a seeker; only the consultant claim is exclusive.
        headers = auth_headers(sign_hs256(claims=make_claims(role="admin")))
        assert api_client.get("/probe/admin/", **headers).status_code == 200
        assert api_client.get("/probe/seeker/", **headers).status_code == 200
        assert api_client.get("/probe/consultant/", **headers).status_code == 403

    def test_role_via_app_metadata(self, api_client, hs256_mode, sign_hs256, auth_headers):
        # Some Supabase setups carry role only in app_metadata; the policies
        # key on either (docs/05 §7 predicate reads auth.uid(), role claims
        # come from the token either way).
        claims = make_claims(role="authenticated", app_metadata={"role": "consultant"})
        headers = auth_headers(sign_hs256(claims=claims))
        assert api_client.get("/probe/consultant/", **headers).status_code == 200

    def test_role_is_per_user_not_per_key(self, api_client, hs256_mode, sign_hs256, auth_headers):
        # A second user's token with the same role claim scopes separately —
        # the permission classes read only the caller's own claims.
        headers = auth_headers(sign_hs256(claims=make_claims(sub=OTHER_USER, role="admin")))
        assert api_client.get("/probe/admin/", **headers).status_code == 200
