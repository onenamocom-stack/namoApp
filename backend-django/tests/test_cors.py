import pytest

ALLOWED = "https://namo-astro.github.io"
OTHER = "https://evil.example.com"


@pytest.fixture
def cors(settings):
    settings.CORS_ALLOWED_ORIGINS = [ALLOWED]
    return settings


@pytest.mark.django_db
class TestCors:
    def test_listed_origin_gets_echo_vary_and_headers(self, api_client, cors):
        response = api_client.get("/v1/health/", HTTP_ORIGIN=ALLOWED)
        assert response.status_code == 200
        assert response["Access-Control-Allow-Origin"] == ALLOWED
        vary = [part.strip() for part in response.headers["Vary"].split(",")]
        assert "Origin" in vary
        assert response["Access-Control-Allow-Headers"] == (
            "Authorization, Content-Type, Idempotency-Key, X-Request-Id"
        )
        assert response["Access-Control-Allow-Methods"] == "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        assert response["Access-Control-Max-Age"] == "600"

    def test_credentials_header_is_deliberately_absent(self, api_client, cors):
        # Auth rides the Authorization header, not cookies, so
        # Access-Control-Allow-Credentials must not be sent: with it, browsers
        # reject the response the moment Allow-Origin is an echo, not '*'.
        response = api_client.get("/v1/health/", HTTP_ORIGIN=ALLOWED)
        assert "Access-Control-Allow-Credentials" not in response

    def test_non_listed_origin_gets_nothing(self, api_client, cors):
        response = api_client.get("/v1/health/", HTTP_ORIGIN=OTHER)
        assert response.status_code == 200
        assert "Access-Control-Allow-Origin" not in response
        assert "Access-Control-Allow-Methods" not in response

    def test_missing_origin_gets_nothing(self, api_client, cors):
        response = api_client.get("/v1/health/")
        assert response.status_code == 200
        assert "Access-Control-Allow-Origin" not in response

    def test_preflight_short_circuits_before_auth(self, api_client, cors):
        # GET /v1/me/ unauthenticated is a 401; a 200 here proves the OPTIONS
        # preflight never reached the view or the auth layer.
        response = api_client.options(
            "/v1/me/",
            HTTP_ORIGIN=ALLOWED,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        )
        assert response.status_code == 200
        assert response.content == b""
        assert response["Access-Control-Allow-Origin"] == ALLOWED
        assert response["Access-Control-Allow-Methods"] == "GET, POST, PATCH, PUT, DELETE, OPTIONS"

    def test_preflight_without_matching_origin_is_not_short_circuited(self, api_client, cors):
        # OPTIONS from a stranger must not be answered as a CORS preflight; it
        # falls through to the app untouched.
        response = api_client.options(
            "/v1/me/",
            HTTP_ORIGIN=OTHER,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        )
        assert response.status_code != 200 or "Access-Control-Allow-Origin" not in response
