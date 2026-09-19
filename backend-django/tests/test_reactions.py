"""Module 2 — reactions (docs/07 §6 step 2): the pytest port of the
reactions halves of backend/schema/020_content_reviews_check.sql (points 2
and 6) and 025_seekers_publish_check.sql (point 6), plus the module's
endpoint contract: the exact shapes src/lib/reactions.js (and its staged
Django rewrite, cutovers/reactions.clientlib.js) send and render.

The RLS-equivalent matrix (policy `reactions_own`, 020 §RLS):
  read rows     -> authenticated, own rows only (a stranger reads 0 rows)
  insert        -> authenticated, actor forced server-side to the caller
  delete        -> authenticated, own rows only; somebody else's row -> 403
  read counts   -> anonymous allowed, aggregates only (the count views' grant)
"""

import json
import threading
import uuid

import pytest
from django.db import connection
from django.test import Client

from apps.reactions.models import Reaction

from .conftest import OTHER_USER, TEST_USER, make_claims

CONTENT_TARGET = "aaaaaaaa-1111-2222-3333-444444444444"
CONSULTANT_TARGET = "bbbbbbbb-1111-2222-3333-444444444444"
PROFILE_TARGET = "cccccccc-1111-2222-3333-444444444444"

LIKE_BODY = {"target_type": "content", "target_id": CONTENT_TARGET, "kind": "like"}
FOLLOW_BODY = {"target_type": "consultant", "target_id": CONSULTANT_TARGET, "kind": "follow"}
FOLLOW_PERSON_BODY = {"target_type": "profile", "target_id": PROFILE_TARGET, "kind": "follow"}


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def user_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


@pytest.fixture
def other_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=OTHER_USER))


@pytest.mark.django_db
class TestMine:
    """GET /v1/reactions/ — what fetchMine reads, scoped to own rows only."""

    def test_returns_own_rows_as_kind_target_pairs(self, api_client, user_token):
        Reaction.objects.create(actor_id=TEST_USER, **LIKE_BODY)
        Reaction.objects.create(actor_id=TEST_USER, **FOLLOW_BODY)

        response = api_client.get("/v1/reactions/", **auth(user_token))

        assert response.status_code == 200
        rows = response.json()
        assert {f"{r['kind']}:{r['target_id']}" for r in rows} == {
            f"like:{CONTENT_TARGET}",
            f"follow:{CONSULTANT_TARGET}",
        }

    def test_own_rows_only_a_stranger_reads_zero(
        self, api_client, user_token, other_token
    ):
        # 020 check point 6: who follows whom is nobody's business.
        Reaction.objects.create(actor_id=OTHER_USER, **FOLLOW_BODY)

        own = api_client.get("/v1/reactions/", **auth(user_token))
        assert own.status_code == 200
        assert own.json() == []

        theirs = api_client.get("/v1/reactions/", **auth(other_token))
        assert {r["target_id"] for r in theirs.json()} == {CONSULTANT_TARGET}

    def test_anonymous_read_refused(self, api_client):
        response = api_client.get("/v1/reactions/")
        assert response.status_code == 401
        assert response.json()["reason"] == "unauthenticated"


@pytest.mark.django_db
class TestSetReaction:
    """POST /v1/reactions/ — the toggle-on write, idempotent by constraint."""

    def test_creates_with_server_side_actor(self, api_client, user_token):
        response = api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))

        assert response.status_code == 201
        assert response.json() == {"created": True, **LIKE_BODY}
        row = Reaction.objects.get()
        assert str(row.actor_id) == TEST_USER  # identity came from the JWT, not the body

    def test_actor_is_not_taken_from_the_body(self, api_client, user_token):
        # Rule 3: the client never sends an identity. An actor_id in the body
        # (here: somebody else's) must be ignored, not honoured.
        spoofed = dict(LIKE_BODY, actor_id=OTHER_USER)
        response = api_client.post("/v1/reactions/", data=spoofed, format="json", **auth(user_token))

        assert response.status_code == 201
        assert str(Reaction.objects.get().actor_id) == TEST_USER

    def test_double_react_is_one_row_and_same_shape(self, api_client, user_token):
        # 020 check point 2: reacting twice is the same row, not two.
        first = api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))
        second = api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))

        assert first.status_code == 201
        assert second.status_code == 200  # the desired state is already true
        assert second.json() == {"created": False, **LIKE_BODY}
        assert Reaction.objects.count() == 1

    def test_same_target_different_kind_is_a_second_row(self, api_client, user_token):
        # The unique key is the 4-tuple: like + save on one post are two rows.
        api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))
        save = dict(LIKE_BODY, kind="save")
        response = api_client.post("/v1/reactions/", data=save, format="json", **auth(user_token))

        assert response.status_code == 201
        assert Reaction.objects.count() == 2

    def test_profile_target_type_accepted(self, api_client, user_token):
        # 025 check point 6: following a PERSON is a first-class target_type.
        response = api_client.post(
            "/v1/reactions/", data=FOLLOW_PERSON_BODY, format="json", **auth(user_token)
        )
        assert response.status_code == 201

    def test_anonymous_write_refused(self, api_client):
        response = api_client.post("/v1/reactions/", data=LIKE_BODY, format="json")
        assert response.status_code == 401
        assert Reaction.objects.count() == 0

    @pytest.mark.parametrize(
        "field,value",
        [
            ("target_type", "wishlist"),  # not a target_type the check allows
            ("kind", "block"),  # not a kind the check allows
            ("target_id", "not-a-uuid"),
        ],
    )
    def test_invalid_field_refused_with_reason_invalid(
        self, api_client, user_token, field, value
    ):
        body = dict(LIKE_BODY, **{field: value})
        response = api_client.post("/v1/reactions/", data=body, format="json", **auth(user_token))

        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"
        assert Reaction.objects.count() == 0


@pytest.mark.django_db
class TestUnsetReaction:
    """DELETE /v1/reactions/ — the toggle-off write, owner-scoped."""

    def test_delete_removes_own_row(self, api_client, user_token):
        Reaction.objects.create(actor_id=TEST_USER, **LIKE_BODY)

        response = api_client.delete("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))

        assert response.status_code == 200
        assert response.json() == {"deleted": True}
        assert Reaction.objects.count() == 0

    def test_delete_when_already_off_is_a_noop(self, api_client, user_token):
        # The optimistic client can race itself; off-when-off must not error.
        response = api_client.delete("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))

        assert response.status_code == 200
        assert response.json() == {"deleted": False}

    def test_delete_of_someone_elses_row_is_forbidden(
        self, api_client, user_token, other_token
    ):
        # Owner-scoped delete per the `reactions_own` policy: a row that
        # exists under another actor is a refusal, not a silent miss.
        Reaction.objects.create(actor_id=OTHER_USER, **LIKE_BODY)

        response = api_client.delete("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))

        assert response.status_code == 403
        assert response.json()["reason"] == "forbidden"
        assert Reaction.objects.count() == 1  # untouched

    def test_anonymous_delete_refused(self, api_client):
        Reaction.objects.create(actor_id=TEST_USER, **LIKE_BODY)

        response = api_client.delete("/v1/reactions/", data=LIKE_BODY, format="json")

        assert response.status_code == 401
        assert Reaction.objects.count() == 1


@pytest.mark.django_db
class TestIdempotentReplay:
    """Idempotency-Key on POST: the middleware replays the stored response;
    the unique constraint means the replay is also the only row."""

    def test_replay_returns_stored_response_without_second_write(
        self, api_client, user_token
    ):
        headers = dict(auth(user_token), HTTP_IDEMPOTENCY_KEY="react-key-1")
        first = api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **headers)
        second = api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **headers)

        assert first.status_code == 201
        assert second.status_code == 201
        assert second.json() == first.json()
        assert second["Idempotency-Replayed"] == "true"
        assert Reaction.objects.count() == 1  # the view did not run again


@pytest.mark.django_db
class TestCounts:
    """GET /v1/reactions/counts/ — the public aggregate read (the count
    views' grant to anon): exact numbers, never an actor id."""

    def test_counts_exact_and_anonymous(self, api_client, user_token, other_token):
        # 020 check point 2: one like counts as one; 025 point 6: one follow
        # moves the follower count.
        api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))
        api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **auth(other_token))
        api_client.post("/v1/reactions/", data=FOLLOW_BODY, format="json", **auth(user_token))

        # No Authorization header at all — anon can read the number.
        response = api_client.get(
            f"/v1/reactions/counts/?target_type=content&target_id={CONTENT_TARGET}"
        )

        assert response.status_code == 200
        body = response.json()
        assert body["counts"] == {"like": 2}
        assert "actor" not in json.dumps(body)

    def test_counts_start_honest(self, api_client):
        # 020 check point 2: a brand-new target reports zero, by absence —
        # there is no counter column that could ship pre-inflated.
        response = api_client.get(
            f"/v1/reactions/counts/?target_type=content&target_id={CONTENT_TARGET}"
        )
        assert response.status_code == 200
        assert response.json()["counts"] == {}

    def test_counts_per_target_not_global(self, api_client, user_token):
        other_target = str(uuid.uuid4())
        api_client.post("/v1/reactions/", data=LIKE_BODY, format="json", **auth(user_token))

        response = api_client.get(
            f"/v1/reactions/counts/?target_type=content&target_id={other_target}"
        )
        assert response.json()["counts"] == {}

    def test_counts_invalid_params_refused(self, api_client):
        response = api_client.get("/v1/reactions/counts/?target_type=wishlist&target_id=nope")
        assert response.status_code == 400
        assert response.json()["reason"] == "invalid"


@pytest.mark.django_db(transaction=True)
class TestConcurrentReacts:
    """Real threads, one database file: the unique constraint and the
    COUNT-based reads are the whole correctness story — assert no drift."""

    def _fire(self, token, body, barrier, results):
        connection.close()  # each thread gets its own connection
        client = Client()
        barrier.wait(timeout=10)
        response = client.post(
            "/v1/reactions/",
            data=json.dumps(body),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        results.append(response)

    def test_two_users_react_concurrently_exact_counts(self, hs256_mode, sign_hs256):
        token_a = sign_hs256(claims=make_claims())
        token_b = sign_hs256(claims=make_claims(sub=OTHER_USER))
        barrier = threading.Barrier(2)
        results = []

        threads = [
            threading.Thread(target=self._fire, args=(token, LIKE_BODY, barrier, results))
            for token in (token_a, token_b)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)

        assert sorted(r.status_code for r in results) == [201, 201]
        # One row per user and the count query agrees with the rows — there
        # is no denormalized counter that could have drifted.
        assert Reaction.objects.count() == 2

        client = Client()
        response = client.get(
            f"/v1/reactions/counts/?target_type=content&target_id={CONTENT_TARGET}"
        )
        assert response.json()["counts"] == {"like": 2}

    def test_same_user_double_react_race_is_one_row(self, hs256_mode, sign_hs256):
        # The optimistic client's worst case: two toggle-ons in flight.
        token = sign_hs256(claims=make_claims())
        barrier = threading.Barrier(2)
        results = []

        threads = [
            threading.Thread(target=self._fire, args=(token, LIKE_BODY, barrier, results))
            for _ in range(2)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)

        assert all(r.status_code in (200, 201) for r in results)
        assert Reaction.objects.count() == 1
