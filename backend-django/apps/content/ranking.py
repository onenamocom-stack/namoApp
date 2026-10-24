"""The personal feed (13 Oct 2026, Rahul: "personalise the feeds").

Home and Reels used to deal the newest 200 posts at random, the same deck
for everyone. Now each post gets a score for the person reading, and the
feed is that order, with three rules laid over it. Rules, not a model:
every number below is a weight somebody can read and change.

The score:
  * follow      — you follow the author (consultant or person).
  * author      — you liked, saved, reshared or commented on their posts.
  * kind        — the share of your likes, saves, reshares and comments
                  that went to this kind (reel, photo, blog).
  * fresh       — halves every two days since publishing.
  * interest    — the post's words carry one of the reader's sign-up
                  interests (`profiles/interests.py`); the term that works
                  for an account with nothing liked or followed yet.
  * popular     — likes, saves, comments, reshares and views, on a log
                  scale, against the most popular post in the deck.
A small random jitter keeps two loads from being identical.

The order:
  * everything you have not seen first; a post you watched in the last
    two weeks comes after all of them, in its own ranked order, so it
    sinks below the new rather than vanishing (19 Oct 2026, Rahul: "jo
    reel ya post hamne dekh li wo peeche chali jaani chahiye"; until
    then a seen post only kept a third of its score). Each row carries
    `_seen`, for the app's "you are all caught up" line;
  * your own posts are not in your feed (24 Oct 2026, Rahul: "Mujhe meri
    he reels dikhti h puri feed pe"), except one published in the last
    hour, which leads it, as on Instagram;
  * no author twice in a row, and at most two of any ten slots, while
    another author is left (24 Oct 2026; it was only "not twice in a
    row", so once the others ran out one author filled the feed);
  * every fifth slot is a post drawn at random from the rest, so new and
    quiet authors are seen;
  * signed out, or with nothing liked or followed yet, the follow, author
    and kind terms are zero and the feed is interests, fresh and popular.

Posts carry no rashi or language, so the feed cannot match either yet.
"""

import math
import random
from collections import Counter
from datetime import timedelta

from django.utils import timezone

from apps.reactions.models import Reaction

from .models import Comment, Content, ContentView, ist_today

CANDIDATES = 400  # the newest live posts the ranking chooses from

W_FOLLOW = 4.0
W_AUTHOR = 0.6  # per engagement with the author, capped at AUTHOR_CAP
AUTHOR_CAP = 5
W_KIND = 2.0
W_INTEREST = 2.5
W_FRESH = 3.0
FRESH_HALF_LIFE_HOURS = 48
W_POPULAR = 1.5
SEEN_DAYS = 14
JITTER = 0.3
EXPLORE_EVERY = 5  # slots 5, 10, 15 … are a random pick
AUTHOR_WINDOW, AUTHOR_MAX = 10, 2  # at most two of any ten slots per author
OWN_FRESH_HOURS = 1  # your own post leads your feed for its first hour

# How much one action says about what you like.
ENGAGEMENT = {"like": 1, "save": 2, "repost": 2}
COMMENT_WEIGHT = 2


def viewer_signals(viewer_id):
    """What the reader has done: who they follow, whose posts and which
    kinds they engaged with, and what they watched lately. Empty for a
    signed-out reader."""
    if viewer_id is None:
        return {"follows": set(), "authors": Counter(), "kinds": Counter(), "seen": set(), "words": []}

    follows = set(
        str(t)
        for t in Reaction.objects.filter(
            actor_id=viewer_id,
            kind=Reaction.Kind.FOLLOW,
            target_type__in=[Reaction.TargetType.CONSULTANT, Reaction.TargetType.PROFILE],
        ).values_list("target_id", flat=True)
    )

    weights = Counter()
    for target_id, kind in Reaction.objects.filter(
        actor_id=viewer_id,
        target_type=Reaction.TargetType.CONTENT,
        kind__in=list(ENGAGEMENT),
    ).values_list("target_id", "kind"):
        weights[str(target_id)] += ENGAGEMENT[kind]
    for content_id in Comment.objects.filter(author_id=viewer_id).values_list(
        "content_id", flat=True
    ):
        weights[str(content_id)] += COMMENT_WEIGHT

    authors, kinds = Counter(), Counter()
    if weights:
        for cid, author_id, kind in Content.objects.filter(pk__in=list(weights)).values_list(
            "id", "author_id", "kind"
        ):
            if str(author_id) == str(viewer_id):
                continue  # your own posts say nothing about your taste
            authors[str(author_id)] += weights[str(cid)]
            kinds[kind] += weights[str(cid)]

    since = ist_today() - timedelta(days=SEEN_DAYS)
    seen = set(
        str(c)
        for c in ContentView.objects.filter(viewer_id=viewer_id, day__gte=since).values_list(
            "content_id", flat=True
        )
    )
    from apps.profiles.interests import INTERESTS
    from apps.profiles.models import Profile

    picked = Profile.objects.filter(pk=viewer_id).values_list("interests", flat=True).first() or []
    words = [w.lower() for key in picked for w in INTERESTS.get(key, [])]
    return {"follows": follows, "authors": authors, "kinds": kinds, "seen": seen, "words": words}


def _popularity(row):
    return (
        row.like_count
        + 2 * row.save_count
        + 2 * row.comment_count
        + 2 * row.repost_count
        + (row.view_count or 0) / 10
    )


def score(row, signals, *, now, top_popularity, rng):
    author = str(row.author_id)
    s = 0.0
    if author in signals["follows"]:
        s += W_FOLLOW
    s += W_AUTHOR * min(signals["authors"][author], AUTHOR_CAP)
    if signals["words"]:
        text = " ".join(t for t in (row.caption, row.body, row.title) if t).lower()
        if any(w in text for w in signals["words"]):
            s += W_INTEREST
    total_kinds = sum(signals["kinds"].values())
    if total_kinds:
        s += W_KIND * signals["kinds"][row.kind] / total_kinds
    if row.published_at:
        hours = max((now - row.published_at).total_seconds() / 3600, 0)
        s += W_FRESH * 0.5 ** (hours / FRESH_HALF_LIFE_HOURS)
    if top_popularity > 0:
        s += W_POPULAR * math.log1p(_popularity(row)) / math.log1p(top_popularity)
    s += rng.uniform(0, JITTER)
    return s


def arrange(scored, *, rng):
    """Best first; never the same author twice running, nor more than
    AUTHOR_MAX in any AUTHOR_WINDOW slots, while another author is left;
    every EXPLORE_EVERY-th slot a random pick from the rest."""
    pool = [row for _, row in sorted(scored, key=lambda pair: pair[0], reverse=True)]
    out = []

    def fits(r):
        author = str(r.author_id)
        recent = [str(x.author_id) for x in out[-(AUTHOR_WINDOW - 1):]]
        return (not out or str(out[-1].author_id) != author) and recent.count(author) < AUTHOR_MAX

    while pool:
        last = str(out[-1].author_id) if out else None
        if (len(out) + 1) % EXPLORE_EVERY == 0 and len(pool) > 1:
            choices = ([r for r in pool[1:] if fits(r)] or [r for r in pool[1:] if str(r.author_id) != last]
                       or pool[1:])
            pick = rng.choice(choices)
        else:
            pick = (next((r for r in pool if fits(r)), None)
                    or next((r for r in pool if str(r.author_id) != last), pool[0]))
        pool.remove(pick)
        out.append(pick)
    return out


def for_you(qs, viewer_id, *, limit, rng=None):
    """The reader's feed from a public_content() queryset."""
    rng = rng or random.Random()
    rows = list(qs.order_by("-published_at", "-id")[:CANDIDATES])
    if not rows:
        return []
    signals = viewer_signals(viewer_id)
    now = timezone.now()
    me = str(viewer_id) if viewer_id is not None else None
    just_posted = [r for r in rows if me and str(r.author_id) == me and r.published_at
                   and now - r.published_at <= timedelta(hours=OWN_FRESH_HOURS)]
    rows = [r for r in rows if not (me and str(r.author_id) == me)]
    for r in just_posted:
        r._seen = False
    if not rows:
        return just_posted[:limit]
    top = max(_popularity(r) for r in rows)
    fresh, seen = [], []
    for r in rows:
        r._seen = str(r.id) in signals["seen"]
        (seen if r._seen else fresh).append((score(r, signals, now=now, top_popularity=top, rng=rng), r))
    return (just_posted + arrange(fresh, rng=rng) + arrange(seen, rng=rng))[:limit]
