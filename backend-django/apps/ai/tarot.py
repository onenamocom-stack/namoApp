"""The tarot reader's prompt.

Namo AI's prompt (`prompt.py`) answers questions about a chart. This one
reads a card that has already been drawn, against a question somebody
typed. Same voice, same refusals, different job — so it is a second prompt
rather than a flag on the first.

The rules it does not get to relax, because they are the product's
(docs/01-PRD.md §4.4): no medical, legal or financial instruction, nothing
about death, disease or pregnancy, and no guarantee. A tarot card is a
mirror for a decision, not permission to make it.

**The card is drawn before this runs** (`tarot_decks.draw`). The model is
told which card came up and may not change it, which is the difference
between a reading and a machine telling somebody what they want to hear.
"""

SYSTEM = """You are the tarot reader inside the Namo app.

A card has already been drawn for this person. It is named below. You did
not choose it and you cannot change it — read the card that came up, even
when it is unwelcome.

WHO IS ASKING
Somebody who typed a real question, usually about work, money, a marriage
or a person. They are not studying tarot. They want the answer, not the
system.

WHAT YOU WRITE

Three parts, each starting on its own line with its label, exactly as
written here and with nothing before the label:

MEANING:
The card read against their question. Open with the answer in their own
words — "Not this month, and not because of you", "Yes, if you ask
directly" — then say what the card means HERE, for this question, not in
general. Four to seven sentences. If they asked about a job, talk about
the job.

CONCLUSION:
Two or three sentences that land it. What this adds up to, and one
sentence on what the card does NOT say — a card speaks to one thing, and
somebody will read a whole life into one draw unless you say where it
stops.

DO:
One action they can take this week. Small, specific, theirs to do: a
conversation to have, a decision to postpone by a named number of days, a
thing to write down, a recitation where the deck has one. Never a
purchase. One or two sentences.

HOW YOU SOUND
Second person, present tense. Plain words. Blunt rather than soothing, and
never cruel. No emoji, no exclamation marks, no "the universe", no
"manifest", no astrology vocabulary they did not use first. Do not open by
restating their question. Do not call them "dear" or "seeker".

WHAT YOU REFUSE
Medical, legal and financial instruction. Anything about death, disease or
pregnancy. Guarantees of any kind, including "definitely" and "certainly".
If the question asks for one of those, say the cards do not answer it and
read what they do answer instead.

If the question is not a question — blank, gibberish, a test — say so in
one line and read the card as the day's card instead. Do not invent a
question on their behalf.

LENGTH
Eight to twelve sentences across all three parts. Shorter is better than
padded, and the labels are not optional.
"""

# The three labels the prompt asks for by name. `split_sections` treats a
# missing one as absent rather than as an error: a reading that came back
# whole is worth showing, and the screen fills a missing part from the
# card's own text where the deck has some.
SECTIONS = ("MEANING", "CONCLUSION", "DO")


def card_block(card, chart_block_text):
    """What the model is told before it reads: the card, then the chart.

    The chart block is `prompt.chart_block()`'s output — the same one Namo
    AI uses, including its "no chart" branch. A tarot reading does not need
    a chart, but when there is one the reading lands on the person rather
    than on a card.
    """
    lines = [
        "CARD DRAWN (already dealt, not yours to change):",
        f"  Deck: {card['deck_name']} ({card['tradition']} tradition)",
        f"  Card: {card['name']}",
    ]
    if card.get("verdict"):
        lines.append(f"  This deck answers a closed question. This card answers: {card['verdict']}")
        lines.append(
            "  That answer is the card's and it is already on the screen. Do not "
            "soften it, argue with it, or turn a No into a maybe — read what it "
            "means for their question."
        )
    # ponytail: the model is told the card's NAME and verdict, not the
    # paragraph the deck sheet writes about it — that text lives in
    # src/data/ and is printed above the reading. Copy the meanings in here
    # if the conclusions ever read as generic; it is 75 lines of duplication
    # and a second thing to keep in step, so not until they do.
    if card.get("virtue"):
        lines.append(f"  The virtue this card carries: {card['virtue']}")
    if card.get("subject"):
        lines.append(f"  What this card governs: {card['subject']}")
    return "\n".join(lines) + "\n\n" + chart_block_text


def split_sections(text):
    """The model's answer as {meaning, conclusion, do}.

    The labels are asked for by name and matched only at the start of a
    line, so a reading that uses the word "conclusion" mid-sentence does
    not split there. A part that never arrives is None rather than
    invented — the screen prefers the card's own words for the last two
    anyway, and an invented conclusion is a sentence nobody wrote.

    A model that ignored the labels entirely still returns its whole answer
    as the meaning, which is the one part that must never be empty.
    """
    text = (text or "").strip()
    if not text:
        return {"meaning": None, "conclusion": None, "do": None}

    found = {}
    current = None
    for line in text.splitlines():
        label = line.strip().rstrip(":").upper()
        if label in SECTIONS and len(line.strip()) <= len(label) + 1:
            current = label            # the label alone on its line
            found.setdefault(current, [])
            continue
        head, sep, rest = line.partition(":")
        if sep and head.strip().upper() in SECTIONS:
            current = head.strip().upper()   # "MEANING: the card says…"
            found.setdefault(current, [])
            if rest.strip():
                found[current].append(rest.strip())
            continue
        if current:
            found[current].append(line)

    if not found:
        return {"meaning": text, "conclusion": None, "do": None}

    parts = {
        key.lower(): "\n".join(found.get(key, [])).strip() or None
        for key in SECTIONS
    }
    # Whatever else is missing, the meaning is the reading: if the model
    # labelled only the later parts, everything above the first label is
    # still what it said about the card.
    if not parts["meaning"]:
        first = min(
            (text.upper().find(k) for k in found if text.upper().find(k) != -1),
            default=-1,
        )
        parts["meaning"] = text[:first].strip() or None if first > 0 else None
    return parts
