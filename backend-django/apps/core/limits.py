"""How fast one person may write (14 Oct 2026, docs/06 Phase 15d).

Counted from the person's own rows in the database, not from the cache:
the cache is each Cloud Run instance's own memory, so a limit kept there
would be one limit per instance. A count over the last minute or day of
their comments, posts or messages is the same answer on every instance.

Each rule is (seconds, most allowed, the sentence they read). The first
one broken refuses with 429 and that sentence; nothing is written.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import APIException

MINUTE = 60
HOUR = 60 * MINUTE
DAY = 24 * HOUR

COMMENTS = (
    (MINUTE, 10, "You are commenting too fast. Wait a minute and try again."),
    (DAY, 300, "That is today's limit for comments. Try again tomorrow."),
)
POSTS = (
    (HOUR, 10, "You have posted a lot in the last hour. Try again later."),
    (DAY, 40, "That is today's limit for posts. Try again tomorrow."),
)
MESSAGES = (
    (MINUTE, 30, "You are sending messages too fast. Wait a minute."),
    (DAY, 1000, "That is today's limit for messages. Try again tomorrow."),
)
NEW_CONVERSATIONS = (
    (DAY, 30, "You have started a lot of new conversations today. Try again tomorrow."),
)


class TooFast(APIException):
    status_code = 429
    default_code = "too_fast"
    default_detail = "Too many in a short time. Wait a moment and try again."


def first_broken(rows, rules, now=None):
    """The sentence of the first rule `rows` (a queryset of this person's
    own rows, with `created_at`) has already reached, or None."""
    now = now or timezone.now()
    for seconds, most, sentence in rules:
        if rows.filter(created_at__gte=now - timedelta(seconds=seconds)).count() >= most:
            return sentence
    return None


def check(rows, rules, now=None):
    """Refuse with 429 when the person is over a rule."""
    sentence = first_broken(rows, rules, now)
    if sentence:
        raise TooFast(sentence)
