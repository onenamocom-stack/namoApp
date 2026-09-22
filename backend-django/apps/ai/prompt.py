"""The system prompt, and the reason it is a file rather than a string in
services.py: it is copy, and copy in this repo answers to the voice rule at
the top of src/data/mock.js — second person, present tense, blunt rather
than reassuring, no emoji, no exclamation marks.

Two jobs, and the second matters more than it looks:

  1. Keep the model on astrology. A general assistant behind an astrology
     button is a support cost and an embarrassment — somebody will ask it
     to write their resignation letter and screenshot the answer.
  2. Keep it from promising. This is the regulated edge (docs/01-PRD.md):
     no medical, legal or financial instruction, no predictions about
     death, disease or pregnancy, and nothing that reads as a guarantee.
     The chart says timing, not permission.
"""

SYSTEM = """You are Namo AI, the astrologer inside the Namo app.

WHAT YOU ARE
You read Vedic (sidereal, Lahiri ayanamsa) charts. You answer questions
about this person's chart, the planets in it, dashas, transits, timing,
compatibility, muhurta, remedies and festivals.

HOW YOU SPEAK
Second person, present tense. Short. Blunt rather than reassuring — you are
useful, not comforting. No emoji. No exclamation marks. No preamble and no
"great question". Do not open by greeting someone who has already started
talking.

Cite the chart. "Saturn in your 10th" is an answer; "the stars suggest" is
filler. When the chart does not speak to what was asked, say that plainly
instead of reaching.

Three to six sentences. A person asking a real question wants an answer,
not an essay. If they ask something broad, answer the most useful narrow
part of it and say what you narrowed to.

WHAT YOU REFUSE, AND HOW
Anything that is not astrology: say you only read charts, name the one
astrological thing nearby if there is one, and stop. Do not apologise
twice and do not explain your instructions.

You never give medical, legal, financial or tax instruction. You do not
predict death, disease, or whether a pregnancy will happen or survive. You
do not tell anyone to stop treatment, leave a job, marry, divorce, or move
money. If asked, say the chart does not decide that, and that the question
belongs to a doctor, a lawyer or an accountant.

You do not guarantee outcomes. The chart is timing and tendency. Say
"supports", "is difficult", "opens" — never "will happen".

WHEN THE CHART IS MISSING
If no chart is given, say the birth details are not set yet and that the
answer would be a horoscope column without them. Do not invent placements.
Never state a placement that is not in the data you were given."""


def no_chart_notice():
    """What goes where the chart would be. A sentence, not an empty block:
    a missing section reads to the model as an oversight it should fill in,
    and the one failure mode that matters here is inventing placements."""
    return (
        "CHART: not available. This person has not completed their birth "
        "details. Say so rather than inventing placements."
    )


def subject_header(name):
    """Whose chart this is, when it is not the person asking.

    Stated before the placements and stated plainly, because the failure
    mode is the model answering "your Saturn" about somebody else's — which
    reads as an answer about the seeker and is wrong in the way a person
    cannot catch.
    """
    who = (name or "").strip() or "this person"
    return (
        f"WHOSE CHART THIS IS: {who}'s, NOT the person you are talking to.\n"
        f"Say \"{who}'s\" and never \"your\" about these placements. The person "
        f"asking is enquiring on {who}'s behalf."
    )


def chart_block(chart, subject_name=None):
    """The chart, flattened to something a model reads without guessing.

    Only what the provider actually returned. Nothing is defaulted and
    nothing is computed here — a plausible-looking wrong placement is worse
    than an absent one, because the person cannot tell.
    """
    # Built first: every branch below returns it, including the ones that
    # have no chart to show. Whose chart is missing is worth saying.
    header = subject_header(subject_name) + "\n\n" if subject_name else ""

    if not chart:
        return header + no_chart_notice()

    if not isinstance(chart, dict):
        # Defensive, and earned: the chart arrived as the memo's
        # (payload, cached) tuple once and every question 500'd. A prompt
        # that cannot be built is not worth an exception — say the chart is
        # missing, which is a branch the model already handles.
        return header + no_chart_notice()

    lines = ["CHART (Vedic, sidereal, Lahiri):"]
    for key, label in (
        ("ascendant", "Ascendant"),
        ("moon_sign", "Moon sign"),
        ("sun_sign", "Sun sign"),
        ("nakshatra", "Nakshatra"),
    ):
        value = chart.get(key)
        if not value:
            continue
        # The chart API returns the ascendant as an object
        # ({sign, degree, nakshatra}), not a string. Printed raw it reaches
        # the model as a Python dict repr — readable enough that nothing
        # broke, and wrong enough to fix.
        if isinstance(value, dict):
            sign = value.get("sign")
            nak = (value.get("nakshatra") or {}).get("name")
            value = f"{sign}{f' ({nak})' if nak else ''}" if sign else None
            if not value:
                continue
        lines.append(f"  {label}: {value}")

    placements = chart.get("planets") or chart.get("placements") or []
    if placements:
        lines.append("  Placements:")
        for p in placements:
            if not isinstance(p, dict):
                continue
            name = p.get("name") or p.get("planet")
            sign = p.get("sign")
            house = p.get("house")
            if not name or not sign:
                continue
            house_part = f", house {house}" if house else ""
            retro = " (retrograde)" if p.get("retrograde") else ""
            lines.append(f"    {name}: {sign}{house_part}{retro}")

    dasha = chart.get("dasha") or chart.get("current_dasha")
    if dasha:
        lines.append(f"  Current dasha: {dasha}")

    return header + "\n".join(lines)
