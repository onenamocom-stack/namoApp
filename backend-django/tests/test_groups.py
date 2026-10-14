"""Groups (14 Oct 2026, Phase 15c). The done-condition: a removed member can
no longer post to the group. Group posts reach the group and its members'
feeds, not everybody's; a blocked group leaves the app with its posts."""

import pytest

from apps.content.models import Content
from apps.groups.models import Group

from .test_content import (  # noqa: F401 — fixtures are used by name
    SECOND_SEEKER,
    SEEKER,
    _publish,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)

G = "/v1/groups/"


def _make(c, token, name="Shirdi Sai Bhakt", **extra):
    return c.post(G, {"name": name, "kind": "mandir", "city": "Pune", **extra}, format="json", **auth(token))


def _post(c, token, gid, caption="Om Sai Ram"):
    return _publish(c, token, kind="post", caption=caption, group_id=gid)


@pytest.mark.django_db
class TestGroups:
    def test_make_join_and_post(self, api_client, seeker_token, second_seeker_token, roster):
        made = _make(api_client, seeker_token)
        assert made.status_code == 201
        gid = made.json()["id"]
        assert made.json()["me"] == {"status": "active", "role": "admin"}
        assert made.json()["member_count"] == 1

        # Not a member: refused.
        refused = _post(api_client, second_seeker_token, gid)
        assert refused.status_code == 403 and "Join the group" in refused.json()["message"]

        joined = api_client.post(f"{G}{gid}/join/", **auth(second_seeker_token)).json()
        assert joined["member_count"] == 2 and joined["me"]["role"] == "member"
        assert _post(api_client, second_seeker_token, gid).status_code == 201

        page = api_client.get(f"{G}{gid}/posts/", **auth(seeker_token)).json()["results"]
        assert len(page) == 1 and page[0]["group"] == {"id": gid, "name": "Shirdi Sai Bhakt"}

    def test_a_removed_member_cannot_post_or_rejoin(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        gid = _make(api_client, seeker_token).json()["id"]
        api_client.post(f"{G}{gid}/join/", **auth(second_seeker_token))
        removed = api_client.post(f"{G}{gid}/members/remove/", {"profile_id": SECOND_SEEKER},
                                  format="json", **auth(seeker_token))
        assert removed.status_code == 200
        refused = _post(api_client, second_seeker_token, gid)
        assert refused.status_code == 403 and "removed you" in refused.json()["message"]
        again = api_client.post(f"{G}{gid}/join/", **auth(second_seeker_token))
        assert again.status_code == 403
        # Leaving and joining is not a way back either.
        api_client.post(f"{G}{gid}/leave/", **auth(second_seeker_token))
        assert _post(api_client, second_seeker_token, gid).status_code == 403

    def test_only_an_admin_removes_or_promotes(self, api_client, seeker_token, second_seeker_token, roster):
        gid = _make(api_client, seeker_token).json()["id"]
        api_client.post(f"{G}{gid}/join/", **auth(second_seeker_token))
        nope = api_client.post(f"{G}{gid}/members/remove/", {"profile_id": SEEKER},
                               format="json", **auth(second_seeker_token))
        assert nope.status_code == 403
        made = api_client.post(f"{G}{gid}/members/admin/", {"profile_id": SECOND_SEEKER},
                               format="json", **auth(seeker_token))
        assert made.status_code == 200
        roles = {m["profile_id"]: m["role"] for m in api_client.get(f"{G}{gid}/members/", **auth(seeker_token)).json()["items"]}
        assert roles[SECOND_SEEKER] == "admin"

    def test_group_posts_reach_members_not_the_open_feed(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        gid = _make(api_client, seeker_token).json()["id"]
        pid = _post(api_client, seeker_token, gid, caption="in the group").json()["id"]
        _publish(api_client, seeker_token, kind="post", caption="for everyone")

        open_feed = [r["id"] for r in api_client.get("/v1/content/feed/").json()["results"]]
        assert pid not in open_feed
        mine = [r["id"] for r in api_client.get("/v1/content/feed/for-you/", **auth(seeker_token)).json()["results"]]
        assert pid in mine
        theirs = [r["id"] for r in api_client.get("/v1/content/feed/for-you/", **auth(second_seeker_token)).json()["results"]]
        assert pid not in theirs

    def test_an_admin_takes_a_post_out(self, api_client, seeker_token, second_seeker_token, roster):
        gid = _make(api_client, seeker_token).json()["id"]
        api_client.post(f"{G}{gid}/join/", **auth(second_seeker_token))
        pid = _post(api_client, second_seeker_token, gid).json()["id"]
        out = api_client.post(f"{G}{gid}/posts/remove/", {"content_id": pid}, format="json", **auth(seeker_token))
        assert out.status_code == 200
        assert Content.objects.get(pk=pid).status == "removed"

    def test_a_blocked_group_and_its_posts_leave_the_app(self, api_client, seeker_token, roster):
        gid = _make(api_client, seeker_token).json()["id"]
        pid = _post(api_client, seeker_token, gid).json()["id"]
        Group.objects.filter(pk=gid).update(status="blocked")
        assert api_client.get(f"{G}{gid}/", **auth(seeker_token)).status_code == 404
        assert api_client.get(f"/v1/content/{pid}/").status_code == 404
        found = api_client.get(f"{G}?q=Shirdi", **auth(seeker_token)).json()["items"]
        assert found == []

    def test_find_and_mine(self, api_client, seeker_token, second_seeker_token, roster):
        _make(api_client, seeker_token, name="Pune Jain Sangh")
        found = api_client.get(f"{G}?q=pune", **auth(second_seeker_token)).json()["items"]
        assert [g["name"] for g in found] == ["Pune Jain Sangh"] and found[0]["me"] is None
        assert api_client.get(f"{G}?mine=1", **auth(second_seeker_token)).json()["items"] == []
        assert len(api_client.get(f"{G}?mine=1", **auth(seeker_token)).json()["items"]) == 1

    def test_three_new_groups_a_day(self, api_client, seeker_token, roster):
        codes = [_make(api_client, seeker_token, name=f"Group {i}").status_code for i in range(4)]
        assert codes == [201, 201, 201, 429]

    def test_the_last_admin_cannot_walk_out_on_members(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        gid = _make(api_client, seeker_token).json()["id"]
        api_client.post(f"{G}{gid}/join/", **auth(second_seeker_token))
        out = api_client.post(f"{G}{gid}/leave/", **auth(seeker_token))
        assert out.status_code == 400 and "admin" in out.json()["message"]


@pytest.mark.django_db
class TestGroupsForYou:
    def test_suggests_groups_you_are_not_in_busiest_first(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        quiet = _make(api_client, seeker_token, name="Quiet Group").json()["id"]
        busy = _make(api_client, seeker_token, name="Busy Group").json()["id"]
        api_client.post(f"{G}{busy}/join/", **auth(second_seeker_token))
        theirs = _make(api_client, second_seeker_token, name="Their Own").json()["id"]
        got = [g["id"] for g in api_client.get(f"{G}?suggest=1", **auth(second_seeker_token)).json()["items"]]
        assert got == [quiet]  # not Busy (a member), not Their Own
        mine = [g["id"] for g in api_client.get(f"{G}?suggest=1", **auth(seeker_token)).json()["items"]]
        assert mine == [theirs]
