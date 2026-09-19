from unittest.mock import MagicMock

import pytest

from apps.media.models import MediaAsset

from .conftest import OTHER_USER, make_claims

VALID = {"kind": "image", "filename": "photo.jpg", "size_bytes": 1024, "mime": "image/jpeg"}


@pytest.mark.django_db
class TestPresignValidation:
    @pytest.mark.parametrize(
        "body",
        [
            dict(VALID, kind="spreadsheet"),                      # unknown kind
            dict(VALID, mime="application/x-msdownload"),         # mime mismatch
            dict(VALID, mime="video/mp4"),                        # wrong prefix for kind
            dict(VALID, size_bytes=11 * 1024 * 1024),             # over the 10 MB image cap
            dict(VALID, size_bytes=0),                            # non-positive
            dict(VALID, size_bytes=-5),
            dict(VALID, filename="../etc/passwd"),                # path traversal
            dict(VALID, filename=""),
        ],
        ids=["unknown-kind", "bad-mime", "wrong-prefix", "oversize", "zero-size", "negative-size", "traversal", "empty-filename"],
    )
    def test_rejects(self, authed_client, body):
        response = authed_client.post("/v1/media/presign/", data=body, format="json")
        assert response.status_code == 400, body
        body_json = response.json()
        assert body_json["ok"] is False
        assert body_json["reason"] == "invalid"

    @pytest.mark.parametrize(
        "kind,mime,max_ok,max_plus_one",
        [
            ("reel", "video/mp4", 100 * 1024 * 1024, 100 * 1024 * 1024 + 1),
            ("image", "image/webp", 10 * 1024 * 1024, 10 * 1024 * 1024 + 1),
            ("audio", "audio/mpeg", 25 * 1024 * 1024, 25 * 1024 * 1024 + 1),
        ],
    )
    def test_size_gates_per_kind(self, authed_client, kind, mime, max_ok, max_plus_one):
        name = "clip.mp4"
        ok = {"kind": kind, "filename": name, "size_bytes": max_ok, "mime": mime}
        response = authed_client.post("/v1/media/presign/", data=ok, format="json")
        assert response.status_code == 201, response.json()

        big = dict(ok, size_bytes=max_plus_one)
        response = authed_client.post("/v1/media/presign/", data=big, format="json")
        assert response.status_code == 400

    def test_unauthenticated_rejected(self, api_client):
        response = api_client.post("/v1/media/presign/", data=VALID, format="json")
        assert response.status_code == 401

    def test_valid_request_creates_processing_row(self, authed_client):
        response = authed_client.post("/v1/media/presign/", data=VALID, format="json")
        assert response.status_code == 201
        payload = response.json()
        assert payload["upload_url"].startswith("http")
        assert payload["headers"]["Content-Type"] == "image/jpeg"
        asset = MediaAsset.objects.get(id=payload["asset_id"])
        assert asset.status == MediaAsset.Status.PROCESSING
        assert asset.owner == make_claims()["sub"]
        assert asset.bucket_key.startswith("images/")
        assert asset.bucket_key.endswith("/photo.jpg")


@pytest.mark.django_db
class TestLocalProvider:
    def test_dev_url_is_fake_and_offline(self, authed_client, settings):
        settings.MEDIA_PROVIDER = "local"
        settings.MEDIA_PUBLIC_BASE_URL = "https://media.test"
        response = authed_client.post("/v1/media/presign/", data=VALID, format="json")
        assert response.status_code == 201
        assert response.json()["upload_url"].startswith("https://media.test/local-upload/")


@pytest.mark.django_db
class TestR2Provider:
    def test_presign_calls_boto3_with_r2_config(self, authed_client, settings, monkeypatch):
        settings.MEDIA_PROVIDER = "r2"
        settings.R2_ENDPOINT = "https://account-id.r2.cloudflarestorage.com"
        settings.R2_ACCESS_KEY = "r2-access-key"
        settings.R2_SECRET_KEY = "r2-secret-key"
        settings.R2_BUCKET = "namo-media"

        client = MagicMock()
        client.generate_presigned_url.return_value = "https://r2.example/presigned"
        factory = MagicMock(return_value=client)
        monkeypatch.setattr("apps.media.providers.boto3.client", factory)

        response = authed_client.post("/v1/media/presign/", data=VALID, format="json")
        assert response.status_code == 201
        assert response.json()["upload_url"] == "https://r2.example/presigned"

        factory.assert_called_once()
        _, kwargs = factory.call_args
        assert kwargs["endpoint_url"] == "https://account-id.r2.cloudflarestorage.com"
        assert kwargs["aws_access_key_id"] == "r2-access-key"
        assert kwargs["aws_secret_access_key"] == "r2-secret-key"

        client.generate_presigned_url.assert_called_once()
        call_kwargs = client.generate_presigned_url.call_args
        params = call_kwargs.kwargs["Params"] if call_kwargs.kwargs else call_kwargs.args[1]
        assert params["Bucket"] == "namo-media"
        assert params["Key"].startswith("images/")
        assert params["ContentType"] == "image/jpeg"
        assert params["ContentLength"] == 1024


@pytest.mark.django_db
class TestAssetDetail:
    def test_owner_reads_status(self, authed_client):
        created = authed_client.post("/v1/media/presign/", data=VALID, format="json")
        asset_id = created.json()["asset_id"]
        response = authed_client.get(f"/v1/media/{asset_id}/")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "processing"
        assert payload["kind"] == "image"
        assert "bucket_key" not in payload  # server-internal, never echoed

    def test_other_user_gets_404_not_403(self, authed_client, api_client, sign_hs256, hs256_mode):
        created = authed_client.post("/v1/media/presign/", data=VALID, format="json")
        asset_id = created.json()["asset_id"]
        stranger = sign_hs256(claims=make_claims(sub=OTHER_USER))
        response = api_client.get(
            f"/v1/media/{asset_id}/", HTTP_AUTHORIZATION=f"Bearer {stranger}"
        )
        assert response.status_code == 404
        assert response.json()["reason"] == "not_found"

    def test_anonymous_gets_401(self, api_client, authed_client):
        created = authed_client.post("/v1/media/presign/", data=VALID, format="json")
        response = api_client.get(f"/v1/media/{created.json()['asset_id']}/")
        assert response.status_code == 401

    def test_missing_asset_404(self, authed_client):
        response = authed_client.get("/v1/media/00000000-0000-0000-0000-000000000000/")
        assert response.status_code == 404
