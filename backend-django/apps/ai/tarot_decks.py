"""The three decks, and the draw.

**The server draws the card, not the client** (backend/INSTRUCTIONS.md rule 3).
Three reasons, in order of how much they matter:

  1. A client-side draw is a claim about randomness, not randomness. Nothing
     stops a seeker pulling until a flattering card appears, and nothing
     stops us being accused of it either.
  2. The reading is charged. Whatever decides what was paid for belongs on
     the side of the wall that also takes the money.
  3. No card text crosses the boundary into a model prompt. The client sends
     a deck name and a question; everything the prompt says about the card
     comes from this file.

The catalogue is ids and names only. The art, the shlokas and the English
renderings stay in `src/data/` — the client already ships them and the model
does not need them. `tools/verify-tarot-decks.mjs` fails if the two lists
drift.
"""

import random

# The draw. SystemRandom rather than `random`, because the module-level
# Mersenne generator is seeded per process: two workers that start in the
# same second deal the same card, and that is exactly the thing somebody
# would notice and screenshot.
_draw = random.SystemRandom()

BHAKTAMAR = [
    ("j01", "The Divine Refuge", "Humility"),
    ("j02", "The First Jina's Glory", "Reverence"),
    ("j03", "The Courage to Begin", "Faith"),
    ("j04", "Ocean of Infinite Virtues", "Humility"),
    ("j05", "The Power of Devotion", "Devotion"),
    ("j06", "Voice of Devotion", "Wisdom"),
    ("j07", "The Light that Dispels Darkness", "Inner Purity"),
    ("j08", "The Pearl of Pure Consciousness", "Clarity"),
    ("j09", "The Fragrance of Divine Praise", "Devotion"),
    ("j10", "The Ornament of the Three Worlds", "Excellence"),
    ("j11", "The Divine Vision", "Contentment"),
    ("j12", "The Incomparable One", "Self-Realization"),
    ("j13", "The Moon Before Which All Others Fade", "Purity"),
    ("j14", "The Infinite Radiance", "Grace"),
    ("j15", "The Unshaken Mountain", "Equanimity"),
    ("j16", "The Eternal Lamp", "Wisdom"),
    ("j17", "The Eternal Sun", "Awareness"),
    ("j18", "The Lotus Moon Face", "Peace"),
    ("j19", "The Rain of Compassion", "Trust"),
    ("j20", "The Jewel of True Knowledge", "Wisdom"),
    ("j21", "The Heart Finds Its Home", "Contentment"),
    ("j22", "The Divine Legacy", "Responsibility"),
    ("j23", "The Path to Liberation", "Liberation"),
    ("j24", "The Infinite Consciousness", "Awareness"),
    ("j25", "The Supreme Among All", "Excellence"),
    ("j26", "The Destroyer of Worldly Sorrow", "Surrender"),
    ("j27", "Humility Beyond All Faults", "Humility"),
    ("j28", "The Rising Sun of Truth", "Clarity"),
    ("j29", "The Golden Throne", "Dignity"),
    ("j30", "The Sacred Chamar", "Reverence"),
    ("j31", "The Three Divine Umbrellas", "Sovereignty"),
    ("j32", "The Drum of Dharma", "Expression"),
    ("j33", "The Shower of Heavenly Flowers", "Grace"),
    ("j34", "The Circle of Divine Light", "Radiance"),
    ("j35", "The Divine Voice", "Expression"),
    ("j36", "The Lotus Footsteps", "Progress"),
    ("j37", "The Sun of Dharma", "Service"),
    ("j38", "Fearless Under Divine Protection", "Fearlessness"),
    ("j39", "The Lion That Stops the Elephant", "Courage"),
    ("j40", "The Rain That Extinguishes the Fire", "Relief"),
    ("j41", "The Serpent Becomes Harmless", "Purity"),
    ("j42", "The Light That Dispels Armies", "Victory"),
    ("j43", "The Lotus of Victory", "Courage"),
    ("j44", "Crossing the Ocean Without Fear", "Trust"),
    ("j45", "The Nectar of Healing", "Renewal"),
    ("j46", "The Broken Chains", "Freedom"),
    ("j47", "The Shield of Bhaktamar", "Fearlessness"),
    ("j48", "The Garland of Bhakti", "Completion"),
]

# The six-card Vedic Kipper deck — NOT IN `DECKS`, so nothing can deal it
# yet. The faces are being drawn (24 Sep 2026); add the key back to DECKS
# and the deck back to src/data/mock.js on the day they land, and the
# verifier will start checking this list again.
HINDU = [
    ("v1", "Dashami, the Tenth", "Work and standing"),
    ("v2", "Chandra, the Moon", "Mood and the mind"),
    ("v3", "Ketu, the Tail", "What is ending"),
    ("v4", "Guru, the Teacher", "Advice and growth"),
    ("v5", "Shukra, the Bright", "Ease, love and money"),
    ("v6", "Shani, the Slow", "Time, delay and discipline"),
]

# Twenty-two cards that answer a closed question. The verdicts are the
# traditional ones, not ours to improvise: this deck exists to say yes or
# no, and a deck that says "maybe" to everything is a horoscope.
YESNO = [
    ("y01", "The Fool", "Yes"),
    ("y02", "The Magician", "Yes"),
    ("y03", "The High Priestess", "Maybe"),
    ("y04", "The Empress", "Yes"),
    ("y05", "The Emperor", "Yes"),
    ("y06", "The Hierophant", "Yes"),
    ("y07", "The Lovers", "Yes"),
    ("y08", "The Chariot", "Yes"),
    ("y09", "Strength", "Yes"),
    ("y10", "The Hermit", "No"),
    ("y11", "Wheel of Fortune", "Yes"),
    ("y12", "Justice", "Maybe"),
    ("y13", "The Hanged Man", "No"),
    ("y14", "Death", "No"),
    ("y15", "Temperance", "Maybe"),
    ("y16", "The Devil", "No"),
    ("y17", "The Tower", "No"),
    ("y18", "The Star", "Yes"),
    ("y19", "The Moon", "No"),
    ("y20", "The Sun", "Yes"),
    ("y21", "Judgement", "Yes"),
    ("y22", "The World", "Yes"),
]

DECKS = {
    "bhaktamar": {
        "name": "Bhaktamar",
        "tradition": "Jain",
        "reads": "virtue",      # third field is the card's virtue
        "cards": BHAKTAMAR,
    },
    "yesno": {
        "name": "Yes or No",
        "tradition": "Classical",
        "reads": "verdict",     # third field is Yes / No / Maybe
        "cards": YESNO,
    },
}


def draw(deck_key):
    """One card from a deck, as {id, name, deck, verdict|virtue|subject}.

    Raises KeyError for a deck that does not exist; the view turns that into
    a 400 rather than letting an unknown name pick the first deck, which
    would answer a question nobody asked.
    """
    deck = DECKS[deck_key]
    card_id, name, third = _draw.choice(deck["cards"])
    return {
        "id": card_id,
        "name": name,
        "deck": deck_key,
        "deck_name": deck["name"],
        "tradition": deck["tradition"],
        deck["reads"]: third,
    }
