"""Editing your own post, reel or blog (6 Oct 2026, Rahul: "edit button in
blog and all posts"). Owner-only, admin excepted; the kind never changes; a
removed post stays removed; tags are replaced under the publishing rules."""

import pytest

from apps.content.models import Content, ContentProduct

from .test_content import (  # noqa: F401 — fixtures are used by name
    _publish,
    admin_token,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)
from .test_content_products import consultant_token, products  # noqa: F401


def _edit(client, token, content_id, **fields):
    return client.post(f"/v1/content/{content_id}/edit/", fields, format="json", **auth(token))


@pytest.mark.django_db
class TestEdit:
    def test_the_author_edits_a_blog(self, api_client, seeker_token, roster):
        row_id = _publish(api_client, seeker_token, kind="article", title="Old", body="Old body").json()["id"]
        response = _edit(api_client, seeker_token, row_id, title="New title",
                         media_url="https://cdn.example/cover.png")
        assert response.status_code == 200
        row = Content.objects.get(pk=row_id)
        assert (row.title, row.body, row.media_url) == ("New title", "Old body", "https://cdn.example/cover.png")
        assert api_client.get(f"/v1/content/{row_id}/").json()["title"] == "New title"

    def test_somebody_else_cannot(self, api_client, seeker_token, second_seeker_token, roster):
        row_id = _publish(api_client, seeker_token, kind="post", caption="mine",
                          media_url="https://x/p.jpg").json()["id"]
        assert _edit(api_client, second_seeker_token, row_id, caption="hijacked").status_code == 403
        assert Content.objects.get(pk=row_id).caption == "mine"

    def test_an_admin_can(self, api_client, seeker_token, admin_token, roster):
        row_id = _publish(api_client, seeker_token, kind="post", caption="typo",
                          media_url="https://x/p.jpg").json()["id"]
        assert _edit(api_client, admin_token, row_id, caption="fixed").status_code == 200

    def test_a_blog_keeps_a_title_and_body(self, api_client, seeker_token, roster):
        row_id = _publish(api_client, seeker_token, kind="article", title="T", body="B").json()["id"]
        assert _edit(api_client, seeker_token, row_id, body="  ").status_code == 400
        assert Content.objects.get(pk=row_id).body == "B"

    def test_a_removed_post_cannot_be_edited(self, api_client, seeker_token, roster):
        row_id = _publish(api_client, seeker_token, kind="post", caption="x",
                          media_url="https://x/p.jpg").json()["id"]
        api_client.post(f"/v1/content/{row_id}/remove/", **auth(seeker_token))
        assert _edit(api_client, seeker_token, row_id, caption="back").status_code == 404

    def test_tags_are_replaced(self, api_client, consultant_token, roster, products):
        p = products
        row_id = _publish(api_client, consultant_token, kind="article", title="T", body="B",
                          product_ids=[str(p["ruby"].id)]).json()["id"]
        assert _edit(api_client, consultant_token, row_id,
                     product_ids=[str(p["maala"].id), str(p["sapphire"].id)]).status_code == 200
        tags = [t.product.name for t in ContentProduct.objects.filter(content_id=row_id).order_by("sort")]
        assert tags == ["Tulsi Maala", "Blue Sapphire"]
        # Leaving product_ids out leaves the tags alone.
        _edit(api_client, consultant_token, row_id, title="T2")
        assert ContentProduct.objects.filter(content_id=row_id).count() == 2

    def test_a_seeker_cannot_add_tags_by_editing(self, api_client, seeker_token, roster, products):
        row_id = _publish(api_client, seeker_token, kind="article", title="T", body="B").json()["id"]
        assert _edit(api_client, seeker_token, row_id,
                     product_ids=[str(products["ruby"].id)]).status_code == 403
