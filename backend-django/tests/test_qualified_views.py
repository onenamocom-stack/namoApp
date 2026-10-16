"""Qualified views and content earnings (16 Oct 2026, Rahul).

  what qualifies -> a reel watched 30 seconds, a blog read 30 seconds, a like,
                    comment or reshare on a post; nothing else on each kind
  how often      -> once per person per post per IST day; never the author
  the claim      -> a reel's or a blog's needs the person's first view today
                    to be 25 seconds old
  the money      -> qualified views at the rate each was counted at (₹20 per
                    1,000 by default, the console's), plus link and tag
                    commission, as one figure
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.consultants.models import EarningsLedger
from apps.content import services
from apps.content.models import ContentPaySettings, ContentView, QualifiedView

from .conftest import make_claims
from .test_content import (  # noqa: F401 — fixtures are used by name
    APPROVED,
    SECOND_SEEKER,
    SEEKER,
    _publish,
    auth,
    content_tables,
    roster,
    second_seeker_token,
    seeker_token,
)


@pytest.fixture
def consultant_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=APPROVED))


def _post(api_client, token, kind, **extra):
    body = {"kind": kind, "caption": "x", **extra}
    if kind == "clip":
        body["media_url"] = "https://x/reel.mp4"
    if kind == "article":
        body.update(title="A blog", body="Words " * 50)
    return _publish(api_client, token, **body).json()["id"]


def _seen(cid, viewer, seconds_ago):
    ContentView.objects.update_or_create(
        content_id=cid, viewer_id=viewer, day=services.ist_today(),
        defaults={"created_at": timezone.now() - timedelta(seconds=seconds_ago)})


@pytest.mark.django_db
class TestWhatQualifies:
    def test_a_reel_after_thirty_seconds_once_a_day(self, api_client, consultant_token, seeker_token, roster):
        cid = _post(api_client, consultant_token, "clip")
        claim = lambda: api_client.post(f"/v1/content/{cid}/qualify/", {"reason": "watch"},  # noqa: E731
                                        format="json", **auth(seeker_token)).json()
        assert claim() == {"counted": False}          # never opened today
        _seen(cid, SEEKER, 5)
        assert claim() == {"counted": False}          # five seconds in
        _seen(cid, SEEKER, 40)
        assert claim() == {"counted": True}
        assert claim() == {"counted": False}          # once a day
        assert QualifiedView.objects.get().paise_per_thousand == 2000

    def test_a_blog_reads_and_a_reel_does_not(self, api_client, consultant_token, roster):
        blog = _post(api_client, consultant_token, "article")
        reel = _post(api_client, consultant_token, "clip")
        _seen(blog, SEEKER, 40)
        _seen(reel, SEEKER, 40)
        assert services.qualify(blog, SEEKER, "read") is True
        assert services.qualify(reel, SEEKER, "read") is False
        assert services.qualify(blog, SECOND_SEEKER, "watch") is False

    def test_a_post_from_a_like_a_comment_or_a_reshare(self, api_client, consultant_token, seeker_token,
                                                       second_seeker_token, roster):
        cid = _post(api_client, consultant_token, "post")
        api_client.post("/v1/reactions/", {"target_type": "content", "target_id": cid, "kind": "like"},
                        format="json", **auth(seeker_token))
        api_client.post(f"/v1/content/{cid}/comments/", {"body": "Jai ho"}, format="json", **auth(seeker_token))
        api_client.post(f"/v1/content/{cid}/comments/", {"body": "Sundar"}, format="json",
                        **auth(second_seeker_token))
        rows = list(QualifiedView.objects.order_by("created_at").values_list("viewer_id", "reason"))
        assert [str(v) for v, _ in rows] == [SEEKER, SECOND_SEEKER] and rows[0][1] == "like"
        assert services.qualify(cid, SEEKER, "watch") is False  # a post is not watched

    def test_never_the_author(self, api_client, consultant_token, roster):
        cid = _post(api_client, consultant_token, "clip")
        _seen(cid, APPROVED, 40)
        assert services.qualify(cid, APPROVED, "watch") is False

    def test_a_bad_reason_is_refused(self, api_client, consultant_token, seeker_token, roster):
        cid = _post(api_client, consultant_token, "clip")
        got = api_client.post(f"/v1/content/{cid}/qualify/", {"reason": "like"}, format="json", **auth(seeker_token))
        assert got.status_code == 400


@pytest.mark.django_db
class TestContentEarnings:
    def test_views_at_their_rate_plus_tags_as_one_figure(self, api_client, consultant_token, seeker_token, roster):
        cid = _post(api_client, consultant_token, "clip")
        api_client.post(f"/v1/content/{cid}/view/", **auth(seeker_token))
        api_client.post(f"/v1/content/{cid}/view/", **auth(seeker_token))
        # 1,500 qualified views at ₹20, then 500 at ₹40 after a console change.
        rows = [QualifiedView(content_id=cid, author_id=APPROVED, viewer_id=f"00000000-0000-4000-8000-{i:012d}",
                              reason="watch", paise_per_thousand=2000) for i in range(1500)]
        QualifiedView.objects.bulk_create(rows)
        ContentPaySettings.objects.update_or_create(pk=1, defaults={"paise_per_thousand": 4000})
        QualifiedView.objects.bulk_create([
            QualifiedView(content_id=cid, author_id=APPROVED, viewer_id=f"00000000-0000-4000-9000-{i:012d}",
                          reason="watch", paise_per_thousand=services.pay_rate()) for i in range(500)])
        EarningsLedger.objects.create(consultant_id=APPROVED, gross_paise=600, fee_bps=0, fee_paise=0,
                                      net_paise=600, kind="Referral · Market · A book")
        EarningsLedger.objects.create(consultant_id=APPROVED, gross_paise=41000, fee_bps=3000, fee_paise=12300,
                                      net_paise=28700, kind="Anita · 20 min chat")

        got = api_client.get("/v1/content/me/earnings/?range=this_month", **auth(consultant_token)).json()
        assert got["earnings_paise"] == 3000 + 2000 + 600      # ₹30 + ₹20 + the tag; never the chat
        # Views count up to yesterday; today's show tomorrow.
        assert got["qualified_views"] == 2000 and got["views"] == 0 and got["views_all_time"] == 2
        ContentView.objects.filter(content_id=cid).update(day=services.ist_today() - timedelta(days=1))
        if services.ist_today().day > 1:
            assert api_client.get("/v1/content/me/earnings/?range=this_month",
                                  **auth(consultant_token)).json()["views"] == 2
        last = api_client.get("/v1/content/me/earnings/?range=last_month", **auth(consultant_token)).json()
        assert last["views"] == 0 and last["views_all_time"] == 2
        assert got["posts"][0]["id"] == cid and got["posts"][0]["qualified_views"] == 2000
        assert (got["posts"][0]["likes"], got["posts"][0]["comments"], got["posts"][0]["reposts"]) == (0, 0, 0)
        assert "views_paise" not in got                        # one figure (Rahul)

    def test_needs_a_session_and_a_range(self, api_client, consultant_token, roster):
        assert api_client.get("/v1/content/me/earnings/").status_code == 401
        got = api_client.get("/v1/content/me/earnings/?range=week", **auth(consultant_token))
        assert got.status_code == 400
