"""Likes and comments on a Bhakti picture (12 Oct 2026, Rahul)."""

import pytest

from apps.bhakti.models import BhaktiComment

from .conftest import OTHER_USER, make_claims
from .test_bhakti import make_asset


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def me(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


@pytest.fixture
def other(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=OTHER_USER))


@pytest.mark.django_db
class TestBhaktiSocial:
    def test_a_like_counts_on_the_picture(self, api_client, me):
        asset = make_asset(kind="status", title="S")
        response = api_client.post(
            "/v1/reactions/",
            {"target_type": "bhakti", "target_id": str(asset.id), "kind": "like"},
            format="json", **auth(me),
        )
        assert response.status_code in (200, 201), response.content
        row = api_client.get("/v1/bhakti/assets/").json()[0]
        assert row["likes"] == 1 and row["comments"] == 0
        mine = api_client.get("/v1/reactions/", **auth(me)).json()
        assert {"target_type": "bhakti", "target_id": str(asset.id), "kind": "like"}.items() <= mine[0].items()

    def test_comment_read_and_remove(self, api_client, me, other):
        asset = make_asset(kind="status", title="S")
        url = f"/v1/bhakti/assets/{asset.id}/comments/"
        assert api_client.post(url, {"body": "Jai"}, format="json").status_code == 401
        made = api_client.post(url, {"body": " Jai Ganesh "}, format="json", **auth(me))
        assert made.status_code == 201
        assert made.json()["body"] == "Jai Ganesh"
        assert api_client.post(url, {"body": "  "}, format="json", **auth(me)).status_code == 400
        assert [c["body"] for c in api_client.get(url).json()] == ["Jai Ganesh"]
        assert api_client.get("/v1/bhakti/assets/").json()[0]["comments"] == 1

        remove = f"/v1/bhakti/comments/{made.json()['id']}/remove/"
        assert api_client.post(remove, **auth(other)).status_code == 403
        assert api_client.post(remove, **auth(me)).status_code == 200
        assert api_client.get(url).json() == []
        assert BhaktiComment.objects.get().status == "removed"

    def test_a_withdrawn_picture_takes_no_comments(self, api_client, me):
        asset = make_asset(kind="status", title="S", active=False)
        url = f"/v1/bhakti/assets/{asset.id}/comments/"
        assert api_client.get(url).status_code == 404
        assert api_client.post(url, {"body": "x"}, format="json", **auth(me)).status_code == 404
