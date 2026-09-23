#!/usr/bin/env python3
"""Does Namo AI sound like a person or like a textbook?

    python tools/ai_voice_check.py

Asks the live model a fixed set of ordinary questions and counts the
jyotish terms that come back. Not a unit test — the thing being measured
is the model's behaviour, and a mock cannot tell you whether a prompt
works.

WHY IT EXISTS. 22 Sep, from the team: *"our chatbot is giving too
technical answers… lots of jargon and astro-tech terms"*. And it was:
twenty-five terms across four answers, opening with lines like "Your 7th
house in Pisces holds the Moon, Saturn, Ketu, and receives aspect from
Rahu in your 1st house." A person asking whether to change jobs does not
know what any of that means.

The rewrite took it to zero. This is what keeps it there — a prompt is
easy to loosen by accident, and the loosening is invisible until somebody
reads an answer.

WHAT A FAILURE LOOKS LIKE: any count above zero. The terms below are
banned in the prompt unless the person used them first, so a hit is
either a regression or a question that asked for them.
"""

import argparse
import os
import pathlib
import re
import sys
import textwrap

import requests

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

# What a person who has never studied jyotish will not understand.
JARGON = re.compile(
    r"\b(\d+(?:st|nd|rd|th)\s+house|house\s+lord|lord\s+of|exalted|debilitat\w*|"
    r"aspect\w*|dasha|mahadasha|antardasha|conjunct\w*|retrograde|"
    r"nakshatra|ascendant|lagna|rashi|navamsa|kendra|trikona|"
    r"malefic|benefic|Rahu|Ketu)\b", re.I)

# Ordinary worries, in the words somebody would actually type. None of
# them asks for astrology's vocabulary, so none of the answers may use it.
QUESTIONS = (
    "Should I change jobs? I have an offer but it means moving cities.",
    "When will I get married?",
    "Is this a good time to buy a house?",
    "My mother is unwell and I am worried. What does my chart say?",
    "Things have been hard for two years. Does it get better?",
)

# A question that DOES ask in the vocabulary. The prompt allows matching
# it — answering "what is my moon sign" without saying moon sign would be
# a different kind of failure.
MIRRORED = "Which dasha am I running, and where is my moon sign?"

# 23 Sep, from the team: *"we need more detailed answer… People love to
# read about themselves"* and *"It only replying in english"*. Both are
# prompt rules now, and a prompt rule is a hope until it is measured.
#
# A four-line answer to "when will I get married" is not worth ₹9. The
# floor is deliberately below the prompt's 150-word target — this catches
# the answer that collapsed to two sentences, not the one that came in at
# 140 words.
MIN_WORDS = 110

# Asked in Hindi, in Hinglish, and in Devanagari-free Roman Hindi, which
# is how most people in this market actually type.
LANGUAGES = (
    ("Hindi", "मेरी शादी कब होगी?", lambda t: _devanagari(t) > 20),
    ("Hinglish", "Meri job change karni chahiye ya nahi?",
     lambda t: _devanagari(t) > 20 or _hinglish(t)),
)

HINGLISH = re.compile(
    r"\b(hai|hain|ho|hoga|hogi|karna|karni|aap|aapka|aapki|abhi|lekin|"
    r"par|kyunki|samay|waqt|thoda|zyada|nahi|chahiye)\b", re.I)


def _devanagari(text):
    return sum("\u0900" <= c <= "\u097f" for c in text)


def _hinglish(text):
    return len(set(m.group(0).lower() for m in HINGLISH.finditer(text))) >= 4

CHART = {
    "ascendant": {"sign": "Virgo", "nakshatra": {"name": "Uttara Phalguni"}},
    "planets": [
        {"name": "Sun", "sign": "Cancer", "house": 11},
        {"name": "Moon", "sign": "Pisces", "house": 7},
        {"name": "Mars", "sign": "Libra", "house": 2},
        {"name": "Mercury", "sign": "Scorpio", "house": 3},
        {"name": "Jupiter", "sign": "Leo", "house": 12},
        {"name": "Venus", "sign": "Gemini", "house": 10},
        {"name": "Saturn", "sign": "Pisces", "house": 7},
        {"name": "Rahu", "sign": "Virgo", "house": 1},
        {"name": "Ketu", "sign": "Pisces", "house": 7},
    ],
}

GREEN, RED, DIM, OFF = "\033[32m", "\033[31m", "\033[2m", "\033[0m"


def system_prompt():
    import django

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
    django.setup()
    from apps.ai import prompt

    return f"{prompt.SYSTEM}\n\n{prompt.chart_block(CHART)}"


def ask(system, question, key, model, max_tokens=1200):
    response = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": question}]}],
            # The SAME ceiling the server uses. It was a hardcoded 500
            # while the server ran at 1200, so this tool truncated answers
            # the product does not truncate — and a length check measured
            # against a truncated answer measures nothing.
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7,
                                 "thinkingConfig": {"thinkingBudget": 0}},
        },
        timeout=45,
    )
    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        return None
    return "".join(
        p.get("text", "") for p in (candidates[0].get("content") or {}).get("parts") or []
    ).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", default=os.environ.get("GEMINI_API_KEY"))
    parser.add_argument("--model", default=os.environ.get("GEMINI_MODEL", "gemini-3.6-flash"))
    parser.add_argument("--max-tokens", type=int,
                        default=int(os.environ.get("AI_MAX_OUTPUT_TOKENS", "1200")))
    args = parser.parse_args()
    if not args.key:
        sys.exit("Set GEMINI_API_KEY or pass --key.")

    system = system_prompt()
    total = 0

    for question in QUESTIONS:
        answer = ask(system, question, args.key, args.model, args.max_tokens)
        if answer is None:
            print(f"{RED}no answer{OFF} for {question!r}")
            total += 1
            continue
        hits = sorted({m.group(0).lower() for m in JARGON.finditer(answer)})
        words = len(answer.split())
        total += len(hits)
        mark = f"{GREEN}plain{OFF}" if not hits else f"{RED}technical{OFF}"
        if words < MIN_WORDS:
            total += 1
            mark += f"  {RED}thin at {words} words{OFF}"
        else:
            mark += f"  {DIM}{words} words{OFF}"
        print(f"\n{DIM}Q  {question}{OFF}")
        print(textwrap.fill(f"A  {answer}", 92, subsequent_indent="   "))
        print(f"   {mark}" + (f"  {hits}" if hits else ""))

    answer = ask(system, MIRRORED, args.key, args.model, args.max_tokens)
    mirrors = bool(answer and JARGON.search(answer))
    print(f"\n{DIM}Q  {MIRRORED}{OFF}")
    print(textwrap.fill(f"A  {answer or '(none)'}", 92, subsequent_indent="   "))
    print(f"   {GREEN}mirrors the question{OFF}" if mirrors
          else f"   {RED}should answer in the same vocabulary it was asked in{OFF}")
    if not mirrors:
        total += 1

    for label, question, passes in LANGUAGES:
        answer = ask(system, question, args.key, args.model, args.max_tokens)
        good = bool(answer) and passes(answer)
        total += 0 if good else 1
        print(f"\n{DIM}Q  {question}{OFF}")
        print(textwrap.fill(f"A  {answer or '(none)'}", 92, subsequent_indent="   "))
        print(f"   {GREEN}answered in {label}{OFF}" if good
              else f"   {RED}answered in English — it was asked in {label}{OFF}")

    print()
    if total == 0:
        print(f"{GREEN}plain, long enough, in the language it was asked in"
              f" — and still technical when asked to be{OFF}\n")
        return
    print(f"{RED}{total} problem(s): jargon, thin answers, or English where"
          f" it was not asked for{OFF}\n")
    sys.exit(1)


if __name__ == "__main__":
    main()
