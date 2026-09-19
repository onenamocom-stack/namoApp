"""Module 5 — content (docs/07 §6 step 5): the pytest port of
backend/schema/020_content_reviews_check.sql and
025_seekers_publish_check.sql, plus the module's endpoint contract: the exact
shapes src/lib/content.js (and its staged Django rewrite,
cutovers/content.clientlib.js) send and render.

The RLS-equivalent matrix (020/025 policies):
  read feed/reviews/counts  -> anonymous allowed (the views' grants), through
                               the public projections only
  publish                   -> authenticated, author forced server-side;
                               post/article anyone, clip/live_session an
                               approved consultant, admin excepted
  update/remove own content -> author only (admin excepted); never a DELETE
  review insert             -> the anti-fraud gate: the caller's own COMPLETED
                               booking, same consultant, booking_id unique
  rating cache              -> recomputed from live reviews in the same
                               transaction as every review write
  moderation                -> moves status; no client path

profiles/consultants/bookings are raw tables the gateway owns reads of (they
belong to later modules); tests stand them up the way test_astro.py does.
"""

import json
import threading
import uuid
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from apps.content import services
from apps.content.models import Content, Review
from apps.content.services import DUPLICATE_REFUSAL, GATE_REFUSAL, REEL_REFUSAL
from apps.media.models import MediaAsset
from apps.reactions.models import Reaction

from .conftest import OTHER_USER, TEST_USER, make_claims

SEEKER = TEST_USER
SECOND_SEEKER = OTHER_USER
ADMIN = "aaaaaaaa-5555-6666-7777-888888888888"
APPROVED = "bbbbbbbb-5555-6666-7777-888888888888"
PENDING = "cccccccc-5555-6666-7777-888888888888"
BLOCKED = "dddddddd-5555-6666-7777-888888888888"


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def seeker_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=SEEKER))


@pytest.fixture
def second_seeker_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=SECOND_SEEKER))


@pytest.fixture
def admin_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=ADMIN, role="admin"))


@pytest.fixture
def content_tables():
    """The raw tables module 5's gateway reads. In Postgres these belong to
    other modules; on SQLite tests stand them up by hand (test_astro.py's
    pattern)."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute("create table profiles (id text primary key, name text)")
        cursor.execute(
            "create table consultants (profile_id text primary key, status text,"
            " rating_avg_cache real, rating_count_cache integer not null default 0)"
        )
        cursor.execute(
            "create table bookings (id text primary key, seeker_id text,"
            " consultant_id text, status text, starts_at text)"
        )
    yield
    with connection.cursor() as cursor:
        cursor.execute("drop table bookings")
        cursor.execute("drop table consultants")
        cursor.execute("drop table profiles")


def _profile(cursor, pid, name):
    cursor.execute("insert into profiles values (%s, %s)", [str(pid), name])


def _consultant(cursor, pid, status):
    cursor.execute(
        "insert into consultants (profile_id, status) values (%s, %s)", [str(pid), status]
    )


def _booking(cursor, bid, seeker_id, consultant_id, status, starts_at=None):
    cursor.execute(
        "insert into bookings (id, seeker_id, consultant_id, status, starts_at)"
        " values (%s, %s, %s, %s, %s)",
        [str(bid), str(seeker_id), str(consultant_id), status,
         (starts_at or timezone.now()).isoformat()],
    )


@pytest.fixture
def roster(content_tables):
    """Two seekers, an approved / pending / blocked consultant — the 025
    check's cast."""
    from django.db import connection

    with connection.cursor() as cursor:
        _profile(cursor, SEEKER, "Tara Verma")
        _profile(cursor, SECOND_SEEKER, "Arjun Nair")
        _profile(cursor, ADMIN, "Admin Person")
        _profile(cursor, APPROVED, "Pro Consultant")
        _profile(cursor, PENDING, "Wannabe Consultant")
        _profile(cursor, BLOCKED, "Gone Consultant")
        _consultant(cursor, APPROVED, "approved")
        _consultant(cursor, PENDING, "pending")
        _consultant(cursor, BLOCKED, "blocked")
    return content_tables


def _set_consultant_status(pid, status):
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "update consultants set status = %s where profile_id = %s", [status, str(pid)]
        )


def _rating_cache(pid):
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "select rating_avg_cache, rating_count_cache from consultants"
            " where profile_id = %s",
            [str(pid)],
        )
        return cursor.fetchone()


def _complete_booking(seeker_id, consultant_id, **kwargs):
    bid = uuid.uuid4()
    from django.db import connection

    with connection.cursor() as cursor:
        _booking(cursor, bid, seeker_id, consultant_id, "completed", **kwargs)
    return bid


def _publish(client, token, **body):
    return client.post("/v1/content/publish/", data=body, format="json", **auth(token))


# ── the publication permission matrix ────────────────────────────────────────


@pytest.mark.django_db
class TestPublication:
    """025 check points 1-5 + the 020 check's stranger rule, as endpoints."""

    def test_seeker_publishes_photo_post(self, api_client, seeker_token, roster):
        response = _publish(api_client, seeker_token, kind="post", caption="a photo")
        assert response.status_code == 201
        row = Content.objects.get()
        assert str(row.author_id) == SEEKER  # identity from the JWT, not the body
        assert row.status == "live"
        assert row.published_at is not None  # the server's clock, not the client's

    def test_seeker_publishes_article(self, api_client, seeker_token, roster):
        response = _publish(api_client, seeker_token, kind="article", title="t", body="b")
        assert response.status_code == 201

    def test_seeker_reel_is_refused_with_the_interface_sentence(
        self, api_client, seeker_token, roster
    ):
        # 025 check point 2: the one refusal a seeker can earn.
        response = _publish(api_client, seeker_token, kind="clip", caption="a reel")
        assert response.status_code == 403
        assert response.json()["reason"] == "forbidden"
        assert response.json()["message"] == REEL_REFUSAL
        assert Content.objects.count() == 0

    def test_author_is_not_taken_from_the_body(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        # 025 check point 3 (stranger rule): publishing as somebody else is
        # structurally impossible — the body cannot carry an identity (rule 3).
        spoofed = {"kind": "post", "caption": "not mine", "author_id": SECOND_SEEKER}
        response = _publish(api_client, seeker_token, **spoofed)
        assert response.status_code == 201
        assert str(Content.objects.get().author_id) == SEEKER

    def test_pending_consultant_reel_refused(self, api_client, sign_hs256, hs256_mode, roster):
        token = sign_hs256(claims=make_claims(sub=PENDING, role="consultant"))
        response = _publish(api_client, token, kind="clip", caption="a reel")
        assert response.status_code == 403
        assert response.json()["message"] == REEL_REFUSAL

    def test_blocked_consultant_reel_refused_and_posts_invisible(
        self, api_client, sign_hs256, hs256_mode, roster
    ):
        token = sign_hs256(claims=make_claims(sub=BLOCKED, role="consultant"))
        # Policy parity (025): a blocked consultant's post/article INSERT is
        # permitted — the policy only gates the KIND — but nothing they write
        # reaches the feed. Their reel is refused outright.
        reel = _publish(api_client, token, kind="clip", caption="a reel")
        assert reel.status_code == 403
        post = _publish(api_client, token, kind="post", caption="still posting")
        assert post.status_code == 201
        feed = api_client.get("/v1/content/feed/")
        assert all(r["author_id"] != BLOCKED for r in feed.json()["results"])

    def test_admin_publishes_anything(self, api_client, admin_token, roster):
        response = _publish(
            api_client, admin_token, kind="live_session", title="A live room"
        )
        assert response.status_code == 201

    def test_anonymous_publish_refused(self, api_client, roster):
        response = api_client.post(
            "/v1/content/publish/", data={"kind": "post"}, format="json"
        )
        assert response.status_code == 401
        assert response.json()["reason"] == "unauthenticated"

    def test_invalid_kind_refused(self, api_client, seeker_token, roster):
        response = _publish(api_client, seeker_token, kind="wishlist")
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"

    def test_client_published_at_is_ignored(self, api_client, seeker_token, roster):
        long_ago = (timezone.now() - timedelta(days=365)).isoformat()
        _publish(api_client, seeker_token, kind="post", caption="c", published_at=long_ago)
        row = Content.objects.get()
        assert timezone.now() - row.published_at < timedelta(minutes=1)

    def test_view_count_is_never_client_settable(self, api_client, seeker_token, roster):
        _publish(api_client, seeker_token, kind="post", caption="c", view_count=312000)
        assert Content.objects.get().view_count == 0


@pytest.mark.django_db
class TestApprovedConsultantKinds:
    """The approved consultant's half of the matrix, on a roster where the
    consultant role claim exists — the DB, not the claim, is what approves."""

    def test_approved_consultant_publishes_reel_claims_free(
        self, api_client, sign_hs256, hs256_mode, roster
    ):
        # 025 check point 5, exactly as written: the token says nothing about
        # approval; the consultants row does.
        token = sign_hs256(claims=make_claims(sub=APPROVED))
        response = _publish(api_client, token, kind="clip", caption="a real reel")
        assert response.status_code == 201

    def test_consultant_claim_without_a_row_is_refused(
        self, api_client, sign_hs256, hs256_mode, roster
    ):
        # The claims say consultant; the consultants table says no row. The
        # table wins, per docs/05 §7's own rule.
        token = sign_hs256(claims=make_claims(sub=SEEKER, role="consultant"))
        response = _publish(api_client, token, kind="clip", caption="a reel")
        assert response.status_code == 403
        assert response.json()["message"] == REEL_REFUSAL


# ── the draft -> live -> removed state machine ───────────────────────────────


@pytest.mark.django_db
class TestPublicationLifecycle:
    def test_draft_is_invisible_then_published(
        self, api_client, seeker_token, roster
    ):
        # 020 check point 1: a DRAFT never leaks into the public projection.
        draft = _publish(
            api_client, seeker_token, kind="article", title="Not yet", body="b",
            status="draft",
        )
        assert draft.status_code == 201
        cid = draft.json()["id"]
        assert Content.objects.get(pk=cid).published_at is None

        feed = api_client.get("/v1/content/feed/")
        assert all(r["id"] != cid for r in feed.json()["results"])
        detail = api_client.get(f"/v1/content/{cid}/")
        assert detail.status_code == 404  # ids do not leak existence

        live = api_client.post(f"/v1/content/{cid}/publish/", **auth(seeker_token))
        assert live.status_code == 200
        assert live.json()["status"] == "live"
        assert live.json()["published_at"] is not None
        feed = api_client.get("/v1/content/feed/")
        assert any(r["id"] == cid for r in feed.json()["results"])

    def test_somebody_elses_draft_cannot_be_published(
        self, api_client, seeker_token, second_seeker_token, roster
    ):
        draft = _publish(
            api_client, seeker_token, kind="post", caption="mine", status="draft"
        )
        cid = draft.json()["id"]
        response = api_client.post(f"/v1/content/{cid}/publish/", **auth(second_seeker_token))
        assert response.status_code == 403
        assert Content.objects.get(pk=cid).status == "draft"

    def test_removed_content_cannot_be_republished(
        self, api_client, seeker_token, roster
    ):
        cid = _publish(api_client, seeker_token, kind="post", caption="c").json()["id"]
        api_client.post(f"/v1/content/{cid}/remove/", **auth(seeker_token))
        response = api_client.post(f"/v1/content/{cid}/publish/", **auth(seeker_token))
        assert response.status_code == 403
        assert Content.objects.get(pk=cid).status == "removed"

    def test_remove_is_owner_scoped_and_one_way(
        self, api_client, seeker_token, second_seeker_token, admin_token, roster
    ):
        cid = _publish(api_client, seeker_token, kind="post", caption="c").json()["id"]

        stranger = api_client.post(f"/v1/content/{cid}/remove/", **auth(second_seeker_token))
        assert stranger.status_code == 403
        assert Content.objects.get(pk=cid).status == "live"

        admin = api_client.post(f"/v1/content/{cid}/remove/", **auth(admin_token))
        assert admin.status_code == 200  # moderation is the admin's job
        assert Content.objects.get(pk=cid).status == "removed"

        again = api_client.post(f"/v1/content/{cid}/remove/", **auth(admin_token))
        assert again.status_code == 200  # idempotent soft delete
        assert Content.objects.get(pk=cid).status == "removed"

    def test_removed_post_leaves_every_public_read(
        self, api_client, seeker_token, roster
    ):
        cid = _publish(api_client, seeker_token, kind="post", caption="c").json()["id"]
        api_client.post(f"/v1/content/{cid}/remove/", **auth(seeker_token))
        assert api_client.get(f"/v1/content/{cid}/").status_code == 404
        feed = api_client.get("/v1/content/feed/")
        assert all(r["id"] != cid for r in feed.json()["results"])
        by_author = api_client.get(f"/v1/content/by-author/?author_id={SEEKER}")
        assert all(r["id"] != cid for r in by_author.json())


# ── the feed: 020 check points 1-2, ordering, pagination ─────────────────────


@pytest.mark.django_db
class TestFeed:
    def _publish_at(self, author, kind, caption, published_at):
        return Content.objects.create(
            author_id=author, kind=kind, caption=caption, status="live",
            published_at=published_at,
        )

    def test_live_content_public_counts_start_honest(self, api_client, roster):
        # 020 check point 2: a brand-new post reads 0 likes, 0 saves.
        self._publish_at(APPROVED, "post", "hello", timezone.now())
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["like_count"] == 0
        assert row["save_count"] == 0
        assert row["view_count"] == 0

    def test_counts_aggregate_once_exactly(self, api_client, roster):
        # 020 check point 2: one like counted as one; twice is the same row.
        post = self._publish_at(APPROVED, "post", "hello", timezone.now())
        Reaction.objects.create(
            actor_id=SEEKER, target_type="content", target_id=post.id, kind="like"
        )
        Reaction.objects.create(
            actor_id=SECOND_SEEKER, target_type="content", target_id=post.id, kind="like"
        )
        Reaction.objects.create(
            actor_id=SEEKER, target_type="content", target_id=post.id, kind="save"
        )
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["like_count"] == 2
        assert row["save_count"] == 1

    def test_blocked_consultant_leaves_the_feed_with_reapproval(
        self, api_client, sign_hs256, hs256_mode, roster
    ):
        # 020 check point 1, both directions: blocking takes the posts down,
        # re-approving puts them back.
        token = sign_hs256(claims=make_claims(sub=APPROVED))
        cid = _publish(api_client, token, kind="post", caption="up").json()["id"]
        assert any(r["id"] == cid for r in api_client.get("/v1/content/feed/").json()["results"])

        _set_consultant_status(APPROVED, "blocked")
        assert all(r["id"] != cid for r in api_client.get("/v1/content/feed/").json()["results"])

        _set_consultant_status(APPROVED, "approved")
        assert any(r["id"] == cid for r in api_client.get("/v1/content/feed/").json()["results"])

    def test_seeker_post_is_public_and_labelled(
        self, api_client, seeker_token, roster
    ):
        # 025 check point 4: the post is public, and labelled as not a
        # consultant's — the byline routes to /u/:id.
        _publish(api_client, seeker_token, kind="post", caption="a photo")
        row = api_client.get("/v1/content/feed/").json()["results"][0]
        assert row["author_id"] == SEEKER
        assert row["author_name"] == "Tara Verma"
        assert row["author_is_consultant"] is False

    def test_ordering_newest_first_and_pagination_is_keyset_exact(
        self, api_client, roster
    ):
        base = timezone.now()
        made = [
            self._publish_at(APPROVED, "post", f"n{i}", base - timedelta(minutes=i))
            for i in range(7)
        ]
        seen, after = [], None
        while True:
            url = "/v1/content/feed/?limit=3"
            if after:
                url += f"&after={after}"
            body = api_client.get(url).json()
            page = [r["id"] for r in body["results"]]
            assert not set(page) & set(seen)  # no row twice across pages
            seen.extend(page)
            after = body["next_after"]
            if after is None:
                break
        assert seen == [str(r.id) for r in made]  # exact order, exact coverage

    def test_kinds_filter_matches_the_screens(self, api_client, roster):
        self._publish_at(APPROVED, "clip", "reel", timezone.now())
        self._publish_at(APPROVED, "article", "essay", timezone.now())
        self._publish_at(APPROVED, "post", "photo", timezone.now())
        clips = api_client.get("/v1/content/feed/?kinds=clip").json()["results"]
        assert [r["kind"] for r in clips] == ["clip"]

    def test_drafts_and_removed_never_in_by_author(self, api_client, seeker_token, roster):
        _publish(api_client, seeker_token, kind="post", caption="live")
        draft = _publish(api_client, seeker_token, kind="post", caption="d", status="draft")
        removed = _publish(api_client, seeker_token, kind="post", caption="r")
        api_client.post(f"/v1/content/{removed.json()['id']}/remove/", **auth(seeker_token))
        rows = api_client.get(f"/v1/content/by-author/?author_id={SEEKER}").json()
        assert len(rows) == 1
        assert rows[0]["caption"] == "live"
        assert all(r["id"] != draft.json()["id"] for r in rows)


# ── the anti-fraud gate: 020 check point 3, endpoint-shaped ──────────────────


@pytest.mark.django_db
class TestReviewGate:
    def test_review_with_no_booking_refused(self, api_client, seeker_token, roster):
        # 020 check point 3, case one.
        response = api_client.post(
            "/v1/content/reviews/",
            data={"consultant_id": APPROVED, "rating": 5, "body": "Never met them."},
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code == 400  # booking_id is not optional

    def test_review_against_unknown_booking_refused(
        self, api_client, seeker_token, roster
    ):
        response = api_client.post(
            "/v1/content/reviews/",
            data={
                "booking_id": str(uuid.uuid4()),
                "consultant_id": APPROVED,
                "rating": 5,
            },
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code == 403
        assert response.json()["message"] == GATE_REFUSAL

    @pytest.mark.parametrize("status", ["pending", "confirmed", "declined", "cancelled"])
    def test_incomplete_booking_refused(self, api_client, seeker_token, roster, status):
        # 020 check point 3, case two: not pending, not confirmed — completed.
        bid = uuid.uuid4()
        from django.db import connection

        with connection.cursor() as cursor:
            _booking(cursor, bid, SEEKER, APPROVED, status)
        response = api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(bid), "consultant_id": APPROVED, "rating": 5},
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code == 403
        assert response.json()["message"] == GATE_REFUSAL

    def test_somebody_elses_completed_booking_refused(
        self, api_client, seeker_token, roster
    ):
        bid = _complete_booking(SECOND_SEEKER, APPROVED)
        response = api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(bid), "consultant_id": APPROVED, "rating": 5},
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code == 403

    def test_consultant_mismatch_refused(self, api_client, seeker_token, roster):
        bid = _complete_booking(SEEKER, APPROVED)
        response = api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(bid), "consultant_id": PENDING, "rating": 5},
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code == 403

    def test_completed_booking_accepted_and_verified(
        self, api_client, seeker_token, roster
    ):
        # 020 check point 3, case three — the legitimate review goes in.
        bid = _complete_booking(SEEKER, APPROVED)
        response = api_client.post(
            "/v1/content/reviews/",
            data={
                "booking_id": str(bid),
                "consultant_id": APPROVED,
                "rating": 4,
                "body": "Turned a vague panic into a plan.",
            },
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code == 201
        rows = api_client.get(f"/v1/content/reviews/?consultant_id={APPROVED}").json()
        assert len(rows) == 1
        assert rows[0]["verified"] is True
        assert rows[0]["rating"] == 4

    def test_one_booking_buys_one_review(self, api_client, seeker_token, roster):
        # 020 check point 3, case four: the unique index, not a read.
        bid = _complete_booking(SEEKER, APPROVED)
        body = {"booking_id": str(bid), "consultant_id": APPROVED, "rating": 5}
        first = api_client.post("/v1/content/reviews/", data=body, format="json", **auth(seeker_token))
        second = api_client.post("/v1/content/reviews/", data=body, format="json", **auth(seeker_token))
        assert first.status_code == 201
        assert second.status_code == 409
        assert second.json()["reason"] == "duplicate"
        assert second.json()["message"] == DUPLICATE_REFUSAL
        assert Review.objects.count() == 1

    @pytest.mark.parametrize("rating", [0, 6, -1])
    def test_rating_bounds_enforced(self, api_client, seeker_token, roster, rating):
        bid = _complete_booking(SEEKER, APPROVED)
        response = api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(bid), "consultant_id": APPROVED, "rating": rating},
            format="json",
            **auth(seeker_token),
        )
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"

    def test_anonymous_review_refused(self, api_client, roster):
        response = api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(uuid.uuid4()), "consultant_id": APPROVED, "rating": 5},
            format="json",
        )
        assert response.status_code == 401

    def test_reviewable_bookings_lists_only_completed_unreviewed(
        self, api_client, seeker_token, roster
    ):
        old = _complete_booking(SEEKER, APPROVED, starts_at=timezone.now() - timedelta(days=2))
        new = _complete_booking(SEEKER, APPROVED, starts_at=timezone.now() - timedelta(days=1))
        pending = uuid.uuid4()
        from django.db import connection

        with connection.cursor() as cursor:
            _booking(cursor, pending, SEEKER, APPROVED, "pending")
            _booking(cursor, uuid.uuid4(), SECOND_SEEKER, APPROVED, "completed")

        rows = api_client.get("/v1/content/reviews/reviewable/", **auth(seeker_token)).json()
        assert [r["id"] for r in rows] == [str(new), str(old)]  # starts_at desc

        # Reviewing one drops it from the list.
        api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(new), "consultant_id": APPROVED, "rating": 5},
            format="json",
            **auth(seeker_token),
        )
        rows = api_client.get("/v1/content/reviews/reviewable/", **auth(seeker_token)).json()
        assert [r["id"] for r in rows] == [str(old)]


@pytest.mark.django_db(transaction=True)
class TestConcurrentReviews:
    """The gate and the cache under real threads: the unique index and the
    recompute-under-lock are the whole correctness story — assert no drift."""

    def _fire(self, token, body, barrier, results):
        from django.db import connection

        connection.close()
        client = Client()
        barrier.wait(timeout=10)
        response = client.post(
            "/v1/content/reviews/",
            data=json.dumps(body),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        results.append(response)

    def test_same_booking_race_is_one_review(self, hs256_mode, sign_hs256, roster):
        bid = _complete_booking(SEEKER, APPROVED)
        token = sign_hs256(claims=make_claims(sub=SEEKER))
        body = {"booking_id": str(bid), "consultant_id": APPROVED, "rating": 5}
        barrier, results = threading.Barrier(2), []

        threads = [threading.Thread(target=self._fire, args=(token, body, barrier, results)) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)

        assert sorted(r.status_code for r in results) == [201, 409]
        assert Review.objects.count() == 1

    def test_concurrent_reviews_keep_cache_exact(self, hs256_mode, sign_hs256, roster):
        # Four seekers, four completed bookings, four simultaneous reviews:
        # the cache must equal its source when the dust settles.
        tokens, bodies = [], []
        for _ in range(4):
            seeker = str(uuid.uuid4())
            from django.db import connection

            with connection.cursor() as cursor:
                _profile(cursor, seeker, "Reviewer")
            bid = _complete_booking(seeker, APPROVED)
            tokens.append(sign_hs256(claims=make_claims(sub=seeker)))
            bodies.append({"booking_id": str(bid), "consultant_id": APPROVED, "rating": 5})
        barrier, results = threading.Barrier(4), []

        threads = [
            threading.Thread(target=self._fire, args=(token, body, barrier, results))
            for token, body in zip(tokens, bodies)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert all(r.status_code == 201 for r in results)

        assert Review.objects.count() == 4
        # The cache reproduces its source (020 check point 5's invariant).
        assert _rating_cache(APPROVED) == (5.0, 4)


# ── reviews_public and the rating cache: 020 check points 4-5 ────────────────


@pytest.mark.django_db
class TestReviewsPublicAndCache:
    def test_verified_is_derived_never_stored(self, api_client, seeker_token, roster):
        # 020 check point 4: a booking-backed review is verified; a seeded
        # review with no booking is visible but NOT verified.
        bid = _complete_booking(SEEKER, APPROVED)
        api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(bid), "consultant_id": APPROVED, "rating": 4},
            format="json",
            **auth(seeker_token),
        )
        services.seed_review(seeker_id=SECOND_SEEKER, consultant_id=APPROVED, rating=5, body="Seeded.")

        rows = api_client.get(f"/v1/content/reviews/?consultant_id={APPROVED}").json()
        by_verified = {r["verified"] for r in rows}
        assert by_verified == {True, False}
        assert sum(1 for r in rows if r["verified"]) == 1

    def test_reviewer_name_is_first_name_plus_last_initial(self, api_client, seeker_token, roster):
        bid = _complete_booking(SEEKER, APPROVED)
        api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(bid), "consultant_id": APPROVED, "rating": 4},
            format="json",
            **auth(seeker_token),
        )
        (row,) = api_client.get(f"/v1/content/reviews/?consultant_id={APPROVED}").json()
        assert row["reviewer_name"] == "Tara V."

        lone = str(uuid.uuid4())
        from django.db import connection

        with connection.cursor() as cursor:
            _profile(cursor, lone, "Madonna")
        bid2 = _complete_booking(lone, APPROVED)
        services.leave_review(lone, booking_id=bid2, consultant_id=APPROVED, rating=3)
        rows = api_client.get(f"/v1/content/reviews/?consultant_id={APPROVED}").json()
        assert any(r["reviewer_name"] == "Madonna" for r in rows)

    def test_rating_cache_reproduces_its_source_exactly(self, api_client, seeker_token, roster):
        # 020 check point 5, arithmetic verbatim: two reviews, 4 and 5.
        bid4 = _complete_booking(SEEKER, APPROVED)
        api_client.post(
            "/v1/content/reviews/",
            data={"booking_id": str(bid4), "consultant_id": APPROVED, "rating": 4},
            format="json",
            **auth(seeker_token),
        )
        services.seed_review(seeker_id=SECOND_SEEKER, consultant_id=APPROVED, rating=5, body="Seeded.")
        assert _rating_cache(APPROVED) == (4.5, 2)

        # Removing one moves the cache; the count never counts removed rows.
        review = Review.objects.get(booking_id=bid4)
        services.set_review_status(review.id, Review.Status.REMOVED)
        assert _rating_cache(APPROVED) == (5.0, 1)

        # And the removed one leaves the public view.
        rows = api_client.get(f"/v1/content/reviews/?consultant_id={APPROVED}").json()
        assert all(r["id"] != str(review.id) for r in rows)

    def test_rating_rounding_is_postgres_numeric_not_bankers(self, roster):
        # avg(4,4,5) = 4.333.. -> Postgres numeric round says 4.3; Python's
        # banker's rounding of the float would too, but an average landing
        # exactly on x.25 or x.75 is where they disagree (4.25 -> 4.3, not 4.2).
        for rating in (4, 4, 5):
            services.seed_review(
                seeker_id=str(uuid.uuid4()), consultant_id=APPROVED, rating=rating
            )
        assert _rating_cache(APPROVED) == (4.3, 3)

        for review in Review.objects.filter(consultant_id=APPROVED):
            services.set_review_status(review.id, Review.Status.REMOVED)
        # No live reviews: the cache reads NULL/0, exactly the trigger's agg.
        assert _rating_cache(APPROVED) == (None, 0)

    def test_cache_is_empty_until_the_first_review(self, roster):
        assert _rating_cache(APPROVED) == (None, 0)


# ── profile_follow_counts and authors_public: 020 point 6, 025 points 6-6b ───


@pytest.mark.django_db
class TestFollowCountsAndAuthors:
    def test_follow_counts_move_both_directions(self, api_client, seeker_token, roster):
        # 025 check point 6: following a PERSON moves both counts.
        api_client.post(
            "/v1/reactions/",
            data={"target_type": "profile", "target_id": SEEKER, "kind": "follow"},
            format="json",
            **auth(seeker_token),
        )
        # A consultant-kind follow counts too — one audience, not two.
        Reaction.objects.create(
            actor_id=ADMIN, target_type="consultant", target_id=SEEKER, kind="follow"
        )
        counts = api_client.get(f"/v1/content/follow-counts/?profile_id={SEEKER}").json()
        assert counts == {"followers": 2, "following": 1}

    def test_counts_are_public_aggregates(self, api_client, roster):
        # 020 check point 6: the number is public, the rows behind it are not.
        Reaction.objects.create(
            actor_id=SEEKER, target_type="profile", target_id=APPROVED, kind="follow"
        )
        response = api_client.get(f"/v1/content/follow-counts/?profile_id={APPROVED}")
        assert response.status_code == 200
        assert response.json() == {"followers": 1, "following": 0}
        assert "actor" not in json.dumps(response.json())

    def test_authors_public_lists_only_publishers(self, api_client, seeker_token, roster):
        # 025 check point 6b: publishing is what puts a name on a screen.
        unpublished = api_client.get(f"/v1/content/authors/{SEEKER}/")
        assert unpublished.status_code == 404
        assert unpublished.json()["reason"] == "not_found"

        _publish(api_client, seeker_token, kind="post", caption="a photo")
        published = api_client.get(f"/v1/content/authors/{SEEKER}/")
        assert published.status_code == 200
        assert published.json() == {"id": SEEKER, "name": "Tara Verma"}

        # A draft does not make an author.
        draft_author = str(uuid.uuid4())
        from django.db import connection

        with connection.cursor() as cursor:
            _profile(cursor, draft_author, "Quiet Person")
        # publish a draft directly through the service — no live content.
        services.publish_content(draft_author, "authenticated", kind="post",
                                 caption="d", status=Content.Status.DRAFT)
        assert api_client.get(f"/v1/content/authors/{draft_author}/").status_code == 404


# ── media wiring: presign -> PUT -> confirm -> publish ───────────────────────


@pytest.mark.django_db
class TestMediaWiring:
    """The reel-post upload path end to end against the Phase 1 presign flow
    (docs/07 §4): the file's bytes never touch Django; the row flips ready on
    confirm; the content row carries the public URL."""

    def test_reel_post_upload_publish_flow(self, api_client, sign_hs256, hs256_mode, roster):
        token = sign_hs256(claims=make_claims(sub=APPROVED))

        presign = api_client.post(
            "/v1/media/presign/",
            data={
                "kind": "reel",
                "filename": "reel.mp4",
                "size_bytes": 5 * 1024 * 1024,
                "mime": "video/mp4",
            },
            format="json",
            **auth(token),
        )
        assert presign.status_code == 201
        payload = presign.json()
        asset = MediaAsset.objects.get(pk=payload["asset_id"])
        assert asset.status == MediaAsset.Status.PROCESSING
        assert asset.owner == str(APPROVED)
        # 022's mapping, R2-shaped: the public URL is the playback URL the
        # content row will store on media_url.
        assert payload["public_url"].startswith("https://media.example.com/")

        # The client's PUT to the presigned URL happens out of band; Django
        # only learns the outcome when the client confirms.
        confirm = api_client.post(f"/v1/media/{asset.id}/confirm/", **auth(token))
        assert confirm.status_code == 200
        assert confirm.json()["status"] == "ready"
        assert confirm.json()["confirmed"] is True
        assert MediaAsset.objects.get(pk=asset.id).status == MediaAsset.Status.READY

        again = api_client.post(f"/v1/media/{asset.id}/confirm/", **auth(token))
        assert again.status_code == 200
        assert again.json()["confirmed"] is False  # idempotent confirm

        published = _publish(
            api_client, token, kind="clip", caption="a reel", media_url=payload["public_url"]
        )
        assert published.status_code == 201
        (row,) = api_client.get("/v1/content/feed/?kinds=clip").json()["results"]
        assert row["media_url"] == payload["public_url"]

    def test_confirm_is_owner_scoped(self, api_client, seeker_token, second_seeker_token, roster):
        presign = api_client.post(
            "/v1/media/presign/",
            data={"kind": "image", "filename": "p.jpg", "size_bytes": 1000, "mime": "image/jpeg"},
            format="json",
            **auth(seeker_token),
        )
        asset_id = presign.json()["asset_id"]
        stranger = api_client.post(f"/v1/media/{asset_id}/confirm/", **auth(second_seeker_token))
        assert stranger.status_code == 404  # ids do not leak existence
        assert MediaAsset.objects.get(pk=asset_id).status == MediaAsset.Status.PROCESSING


# ── the seed services (service-role only, no URL) ────────────────────────────


@pytest.mark.django_db
class TestSeedServices:
    def test_seed_content_is_idempotent_on_legacy_id(self, roster):
        # content.mjs replays safely: the second run refreshes, never dupes.
        first, created = services.seed_content(
            APPROVED, kind="post", legacy_id="po1", caption="one"
        )
        assert created is True
        second, created = services.seed_content(
            APPROVED, kind="post", legacy_id="po1", caption="two"
        )
        assert created is False
        assert second.id == first.id
        assert Content.objects.count() == 1
        assert Content.objects.get().caption == "two"

    def test_seed_review_visible_but_unverified(self, api_client, roster):
        review = services.seed_review(
            seeker_id=SEEKER, consultant_id=APPROVED, rating=5, body="Seeded."
        )
        assert review.booking_id is None
        rows = api_client.get(f"/v1/content/reviews/?consultant_id={APPROVED}").json()
        assert rows[0]["verified"] is False
        assert _rating_cache(APPROVED) == (5.0, 1)
