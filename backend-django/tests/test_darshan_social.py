"""Like, comment, reshare and share on a Darshan murti (24 Oct 2026, Rahul:
"Put like comment repost and share button on each deity in darshan"). Each
murti has one hidden catalogue row, kind `darshan`, made and kept in step by
the darshan endpoint; it never shows on a shelf."""

import pytest

from apps.bhakti.models import BhaktiAsset, DarshanDeity, DarshanImage

from .test_bhakti_social import auth, me  # noqa: F401 — fixture by name


@pytest.fixture
def murti(db):
    deity = DarshanDeity.objects.create(name="Padmavati", name_hi="पद्मावती माता", sort=1)
    return DarshanImage.objects.create(deity=deity, temple="Hombuja Padmavati Basadi", location="Humcha",
                                       image_url="/darshan/temples/humcha-padmavati.webp", sort=10)


def _row(api_client, murti):
    deity = next(d for d in api_client.get("/v1/bhakti/darshan/").json() if d["name"] == murti.deity.name)
    return next(i for i in deity["images"] if i["id"] == str(murti.id))


@pytest.mark.django_db
class TestDarshanSocial:
    def test_each_murti_gets_its_row_once(self, api_client, murti):
        first = _row(api_client, murti)["asset"]
        assert first == {"id": first["id"], "likes": 0, "comments": 0, "reposts": 0}
        assert _row(api_client, murti)["asset"]["id"] == first["id"]
        asset = BhaktiAsset.objects.get(legacy_id=f"darshan:{murti.id}")
        assert (asset.kind, asset.title, asset.deity, asset.media_url) == (
            "darshan", "Hombuja Padmavati Basadi", "Padmavati", "/darshan/temples/humcha-padmavati.webp")

    def test_never_on_a_shelf(self, api_client, murti):
        _row(api_client, murti)
        assert api_client.get("/v1/bhakti/assets/").json() == []

    def test_like_comment_and_reshare_count_on_the_murti(self, api_client, murti, me):
        asset_id = _row(api_client, murti)["asset"]["id"]
        for kind in ("like", "repost"):
            r = api_client.post("/v1/reactions/", {"target_type": "bhakti", "target_id": asset_id, "kind": kind},
                                format="json", **auth(me))
            assert r.status_code in (200, 201), r.content
        made = api_client.post(f"/v1/bhakti/assets/{asset_id}/comments/", {"body": "Jai Mata Di"},
                               format="json", **auth(me))
        assert made.status_code == 201
        assert _row(api_client, murti)["asset"] == {"id": asset_id, "likes": 1, "comments": 1, "reposts": 1}
        reshared = api_client.get("/v1/bhakti/reposts/").json()
        assert reshared[0]["asset"]["kind"] == "darshan" and reshared[0]["asset"]["darshan_id"] == str(murti.id)

    def test_the_console_s_changes_follow(self, api_client, murti):
        asset_id = _row(api_client, murti)["asset"]["id"]
        DarshanImage.objects.filter(pk=murti.pk).update(temple="", image_url="/darshan/temples/x.webp")
        _row(api_client, murti)
        asset = BhaktiAsset.objects.get(pk=asset_id)
        assert (asset.title, asset.media_url) == ("Shri Padmavati Ji Mandir", "/darshan/temples/x.webp")
        DarshanImage.objects.filter(pk=murti.pk).update(active=False)
        api_client.get("/v1/bhakti/darshan/")
        assert not BhaktiAsset.objects.get(pk=asset_id).active

    def test_the_share_link_previews_the_murti(self, api_client, murti):
        from apps.content import share

        asset_id = _row(api_client, murti)["asset"]["id"]
        html = share.bhakti_page(None, asset_id).content.decode()
        assert "Hombuja Padmavati Basadi" in html and "Darshan of Padmavati Ji on NAMO." in html
        assert f"/og/bhakti/{asset_id}.jpg" in html


def test_ji_once():
    from apps.bhakti.services import with_ji

    assert [with_ji(n) for n in ("Hanuman", "Balaji", "Shrinathji", "Mata", "")] == [
        "Hanuman Ji", "Balaji", "Shrinathji", "Mata Ji", ""]
