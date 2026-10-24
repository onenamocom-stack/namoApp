"""The personal feed, `GET /v1/content/feed/for-you/` (13 Oct 2026, Rahul).

Each test fixes everything but the one signal it is about: same publish
time, same counts, so only that signal can decide the order. The jitter
(at most 0.3) is far below every weight tested here.
"""

import random
from types import SimpleNamespace

import pytest
from django.utils import timezone

from apps.content import ranking
from apps.content.models import Content, ContentView
from apps.reactions.models import Reaction

from .test_content import (  # noqa: F401 — fixtures
    ADMIN,
    APPROVED,
    SECOND_SEEKER,
    SEEKER,
    auth,
    content_tables,
    roster,
    seeker_token,
)

URL = "/v1/content/feed/for-you/"


def _post(author, kind="post", minutes_ago=0):
    return Content.objects.create(
        author_id=author, kind=kind, caption=f"{kind} by {author[:4]}", status="live",
        published_at=timezone.now() - timezone.timedelta(minutes=minutes_ago),
    )


def _react(actor, target_type, target_id, kind):
    Reaction.objects.create(
        actor_id=actor, target_type=target_type, target_id=target_id, kind=kind
    )


def _ids(response):
    return [r["id"] for r in response.json()["results"]]


@pytest.mark.django_db
class TestForYou:
    def test_signed_out_gets_every_live_post_filtered_by_kind(self, api_client, roster):
        post, clip = _post(APPROVED), _post(SECOND_SEEKER, kind="clip")
        assert set(_ids(api_client.get(URL))) == {str(post.id), str(clip.id)}
        assert _ids(api_client.get(URL + "?kinds=clip")) == [str(clip.id)]

    def test_a_followed_author_comes_first(self, api_client, roster, seeker_token):
        followed = _post(ADMIN, minutes_ago=30)  # older, so freshness is against it
        _post(SECOND_SEEKER)
        _react(SEEKER, "profile", ADMIN, "follow")
        assert _ids(api_client.get(URL, **auth(seeker_token)))[0] == str(followed.id)

    def test_the_kind_you_engage_with_comes_first(self, api_client, roster, seeker_token):
        liked = _post(SECOND_SEEKER, kind="clip", minutes_ago=600)
        _react(SEEKER, "content", liked.id, "like")
        post = _post(APPROVED, kind="post")
        clip = _post(ADMIN, kind="clip")
        order = _ids(api_client.get(URL, **auth(seeker_token)))
        assert order.index(str(clip.id)) < order.index(str(post.id))

    def test_a_seen_post_sinks(self, api_client, roster, seeker_token):
        seen = _post(APPROVED)
        other = _post(SECOND_SEEKER, minutes_ago=60)
        ContentView.objects.create(content=seen, viewer_id=SEEKER)
        assert _ids(api_client.get(URL, **auth(seeker_token))) == [str(other.id), str(seen.id)]

    def test_a_seen_post_comes_after_everything_new_even_a_followed_one(self, api_client, roster, seeker_token):
        # 19 Oct 2026 (Rahul): seen goes behind all that is new, not just lower.
        followed = _post(ADMIN)
        _react(SEEKER, "profile", ADMIN, "follow")
        quiet = _post(SECOND_SEEKER, minutes_ago=600)
        ContentView.objects.create(content=followed, viewer_id=SEEKER)
        body = api_client.get(URL, **auth(seeker_token)).json()["results"]
        assert [r["id"] for r in body] == [str(quiet.id), str(followed.id)]
        assert [r["seen"] for r in body] == [False, True]

    def test_popular_beats_quiet_when_nothing_else_differs(self, api_client, roster):
        quiet = _post(APPROVED)
        popular = _post(SECOND_SEEKER)
        for who in (SEEKER, ADMIN):
            _react(who, "content", popular.id, "like")
        order = _ids(api_client.get(URL))
        assert order.index(str(popular.id)) < order.index(str(quiet.id))

    def test_no_author_twice_running_while_another_is_left(self, api_client, roster):
        for minutes in (0, 1, 2):
            _post(APPROVED, minutes_ago=minutes)
        _post(SECOND_SEEKER, minutes_ago=600)
        rows = api_client.get(URL).json()["results"]
        authors = [r["author_id"] for r in rows]
        assert authors[1] == SECOND_SEEKER


class TestArrange:
    def _rows(self, n):
        return [
            (float(n - i), SimpleNamespace(id=i, author_id=f"author-{i}"))
            for i in range(n)
        ]

    def test_every_fifth_slot_is_a_random_pick_and_nothing_is_lost(self):
        scored = self._rows(12)
        out = ranking.arrange(scored, rng=random.Random(7))
        assert [r.id for r in out[:4]] == [0, 1, 2, 3]
        assert sorted(r.id for r in out) == list(range(12))

    def test_the_same_seed_gives_the_same_order(self):
        a = ranking.arrange(self._rows(20), rng=random.Random(1))
        b = ranking.arrange(self._rows(20), rng=random.Random(1))
        assert [r.id for r in a] == [r.id for r in b]


@pytest.mark.django_db
class TestInterests:
    """Phase 15a's done-condition: a new account that picked yoga sees yoga
    posts first, with nothing liked or followed yet."""

    def test_a_new_account_that_picked_yoga_sees_yoga_first(self, api_client, roster, seeker_token):
        from apps.profiles.models import Profile

        Profile.objects.filter(id=SEEKER).update(interests=["yoga", "mantra", "temples"])
        yoga = _post(APPROVED, minutes_ago=300)
        yoga.caption = "Morning #yoga, surya namaskar"
        yoga.save(update_fields=["caption"])
        _post(SECOND_SEEKER)
        _post(ADMIN, minutes_ago=5)
        assert _ids(api_client.get(URL, **auth(seeker_token)))[0] == str(yoga.id)

    def test_interests_are_checked_at_the_door(self, api_client, roster, seeker_token):
        bad = api_client.patch("/v1/profiles/me/", {"interests": ["yoga", "golf", "mantra"]}, format="json", **auth(seeker_token))
        assert bad.status_code == 400
        few = api_client.patch("/v1/profiles/me/", {"interests": ["yoga", "yoga", "mantra"]}, format="json", **auth(seeker_token))
        assert few.status_code == 400
        ok = api_client.patch("/v1/profiles/me/", {"interests": ["yoga", "mantra", "jain"]}, format="json", **auth(seeker_token))
        assert ok.status_code == 200
        assert ok.json()["interests"] == ["yoga", "mantra", "jain"]


@pytest.mark.django_db
class TestYourOwnAndOneAuthor:
    """24 Oct 2026, Rahul: "Mujhe meri he reels dikhti h puri feed pe"."""

    def test_your_own_posts_stay_out_but_a_new_one_leads_for_an_hour(self, api_client, roster, seeker_token):
        old = _post(SEEKER, minutes_ago=120)
        new = _post(SEEKER, minutes_ago=5)
        other = _post(ADMIN)
        order = _ids(api_client.get(URL, **auth(seeker_token)))
        assert order[0] == str(new.id) and str(other.id) in order and str(old.id) not in order

    def test_one_author_has_at_most_two_of_ten_while_others_last(self):
        rng = random.Random(1)
        busy = [(10.0 - i * 0.01, SimpleNamespace(id=f"b{i}", author_id="busy")) for i in range(20)]
        quiet = [(1.0 - i * 0.01, SimpleNamespace(id=f"q{i}", author_id=f"a{i % 8}")) for i in range(16)]
        out = ranking.arrange(busy + quiet, rng=rng)
        first = [r.author_id for r in out[:20]]
        for start in range(0, 11):
            assert first[start:start + 10].count("busy") <= 2
