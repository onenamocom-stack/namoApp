"""What a username may be (11 Oct 2026, Rahul) — the rules alone, with no
model import, so the model field, the console form and the API all check
the same thing.

A username is the readable half of a shared profile link:
1namo.com/<username>. The app routes one-segment paths it does not know to
a username lookup, so a username must never be the name of a page — the
RESERVED words below are the app's top-level routes, plus the words that
would let somebody pass as Namo itself.

  * 8 to 30 characters (Rahul's minimum of 8; 30 keeps a link short)
  * lowercase letters, digits, dot and dash — stored lowercase, so
    RahulJain and rahuljain are the same name
  * starts and ends with a letter or digit; no two of . and - together
  * at least one letter, so a phone number cannot be a username
"""

import re

from django.core.exceptions import ValidationError

MIN_LEN = 8
MAX_LEN = 30
SHAPE = re.compile(r"^[a-z0-9]+(?:[.-][a-z0-9]+)*$")
LETTER = re.compile(r"[a-z]")

# The app's top-level paths (src/App.jsx) and the words of its own name.
# Most are shorter than eight and could never be taken; they are listed so
# lowering the minimum later cannot open a page's address to a stranger.
RESERVED = frozenset(
    """
    academy admin ask bhakti call chart connect consult consultant
    consultants darshan help home horoscope match muhurat namo notifications
    onboarding orders people premium pro profile read reels reports search
    settings shop support tarot u wallet api static assets
    """.split()
)

# Never inside a username, wherever it sits: these pass as staff or as the
# company to somebody reading a WhatsApp link.
BANNED_PARTS = ("1namo", "onenamo", "official", "admin", "moderator", "support")


def normalize(raw):
    return (raw or "").strip().lower()


def problem(raw):
    """None when `raw` (already normalized) is a valid username, else the
    sentence to show. Availability is not checked here — that needs the
    table, and lives in services."""
    name = raw
    if len(name) < MIN_LEN:
        return f"Use at least {MIN_LEN} characters."
    if len(name) > MAX_LEN:
        return f"Use at most {MAX_LEN} characters."
    if not SHAPE.match(name):
        return (
            "Use letters, numbers, dot and dash only. Start and end with a "
            "letter or number, and never put two of . and - together."
        )
    if not LETTER.search(name):
        return "Use at least one letter."
    if name in RESERVED or any(part in name for part in BANNED_PARTS):
        return "That name is reserved. Try another."
    return None


def validate_username(value):
    """The model field's validator, which is also what the console's form
    runs when an admin edits a username."""
    if value != normalize(value):
        raise ValidationError("Use lowercase letters, with no spaces at either end.")
    message = problem(value)
    if message:
        raise ValidationError(message)
