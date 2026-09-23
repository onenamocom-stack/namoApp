"""The model, behind an interface — same shape as apps/astro/providers.py,
and for the same reason: the key is money and must never reach a browser
(docs/02-TRD.md), and dev and tests must run without spending quota or
needing a network.

`AI_PROVIDER=gemini` in production, `mock` everywhere else.
"""

import abc
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

from .prompt import SYSTEM
from .tarot import SYSTEM as TAROT_SYSTEM

logger = logging.getLogger("apps.ai")


class UpstreamError(Exception):
    """The model did not answer. Never carries the provider's raw text: it
    can contain the key in an auth error and the URL in a transport one."""


class Provider(abc.ABC):
    @abc.abstractmethod
    def answer(self, system, history, question):
        """-> {"text": str, "tokens_in": int|None, "tokens_out": int|None}"""


class GeminiProvider(Provider):
    """Gemini Flash over the REST API. No SDK on purpose — one POST with a
    JSON body is the whole integration, and a dependency that ships its own
    transport, retries and auth is a larger surface than the thing it
    wraps."""

    def answer(self, system, history, question):
        key = settings.GEMINI_API_KEY
        if not key:
            raise UpstreamError("GEMINI_API_KEY is not set")

        contents = [
            {"role": m["role"], "parts": [{"text": m["body"]}]} for m in history
        ]
        contents.append({"role": "user", "parts": [{"text": question}]})

        body = json.dumps({
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": {
                # The prompt asks for three to six sentences. This is the
                # ceiling that makes a runaway answer a truncation rather
                # than a bill.
                "maxOutputTokens": settings.AI_MAX_OUTPUT_TOKENS,
                "temperature": 0.7,
                # Gemini 3.x reasons before it answers, and those thinking
                # tokens come out of maxOutputTokens AND bill at the output
                # rate. Left on, a 400-token ceiling was spending 385 on
                # thinking and 11 on the answer: every reply came back
                # mid-sentence with finishReason MAX_TOKENS, and cost about
                # five times what it should. Nothing here needs deliberation
                # — the chart arrives structured and the answer is six
                # sentences of it.
                "thinkingConfig": {"thinkingBudget": settings.AI_THINKING_BUDGET},
            },
            # Astrology talks about marriage, death and illness in ways a
            # general safety filter reads as harm. The prompt refuses those
            # itself, in the product's own words; leaving the filters at
            # their defaults means a legitimate dasha question comes back
            # empty with no sentence anyone can show a seeker.
            "safetySettings": [
                {"category": c, "threshold": "BLOCK_ONLY_HIGH"}
                for c in (
                    "HARM_CATEGORY_HARASSMENT",
                    "HARM_CATEGORY_HATE_SPEECH",
                    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "HARM_CATEGORY_DANGEROUS_CONTENT",
                )
            ],
        }).encode("utf-8")

        url = (
            f"{settings.GEMINI_BASE_URL}/v1beta/models/"
            f"{settings.GEMINI_MODEL}:generateContent"
        )
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(
                request, timeout=settings.AI_TIMEOUT_SECONDS
            ) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # Status only. The body of a 400 from Gemini echoes the request.
            logger.error("[ai] gemini HTTP %s", exc.code)
            raise UpstreamError(f"gemini http {exc.code}") from None
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            logger.error("[ai] gemini transport: %s", type(exc).__name__)
            raise UpstreamError("gemini unreachable") from None

        candidates = payload.get("candidates") or []
        if not candidates:
            # A prompt the filters refused outright answers with no
            # candidate at all, not with an error.
            reason = (payload.get("promptFeedback") or {}).get("blockReason")
            logger.error("[ai] gemini returned no candidate (%s)", reason)
            raise UpstreamError("gemini returned nothing")

        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts).strip()
        if not text:
            logger.error(
                "[ai] gemini candidate was empty (finish=%s)",
                candidates[0].get("finishReason"),
            )
            raise UpstreamError("gemini returned nothing")

        usage = payload.get("usageMetadata") or {}
        return {
            "text": text,
            "tokens_in": usage.get("promptTokenCount"),
            "tokens_out": usage.get("candidatesTokenCount"),
        }


class MockProvider(Provider):
    """Deterministic, offline, and deliberately in the house voice so a dev
    screen reads like the real thing. It does NOT pretend to read the
    chart — an invented placement in a mock is how a wrong one reaches a
    screenshot."""

    REPLIES = (
        "The chart supports the timing, not the decision. Those are "
        "different questions and you are asking the easier one.",
        "Saturn's placement makes this slow rather than blocked. Slow is "
        "not a verdict. Give it the quarter.",
        "Nothing in the chart speaks to that directly. Ask about the "
        "period you actually care about and it will.",
        "You already know the answer and are shopping for a second "
        "opinion. The chart does not give permission.",
    )

    # A tarot reading has a shape the four replies above do not: an answer,
    # the card read against the question, and a Remedy line the service
    # splits off. A mock that returned prose with no marker would let a
    # broken split pass every test.
    TAROT_REPLY = (
        "Not yet, and the card is specific about why.\n\n"
        "The card that came up speaks to timing rather than to whether the "
        "thing is right. What you are asking about is moving, but it is "
        "moving on somebody else's calendar, and pushing it this week costs "
        "you the position you already hold. What it does not say is whether "
        "the person you are waiting on is worth the wait.\n\n"
        "Remedy: Write down the date you will ask again, and do not ask "
        "before it."
    )

    def answer(self, system, history, question):
        # Stable per conversation rather than random: the same transcript
        # replays the same way, which is what makes a test worth writing.
        if "CARD DRAWN" in system:
            return {"text": self.TAROT_REPLY, "tokens_in": None, "tokens_out": None}
        index = len([m for m in history if m["role"] == "user"]) % len(self.REPLIES)
        return {"text": self.REPLIES[index], "tokens_in": None, "tokens_out": None}


PROVIDERS = {"gemini": GeminiProvider, "mock": MockProvider}


def get_provider():
    name = getattr(settings, "AI_PROVIDER", "mock")
    provider = PROVIDERS.get(name)
    if provider is None:
        raise UpstreamError(f"unknown AI_PROVIDER {name!r}")
    return provider()


def ask(history, question, chart_block):
    """One turn. `history` is oldest-first [{role, body}]."""
    return get_provider().answer(f"{SYSTEM}\n\n{chart_block}", history, question)


def read_card(card_block, question):
    """One tarot reading. No history: a pull is a closed question about one
    card, and carrying the chat transcript into it would let a previous
    conversation steer what the card says."""
    return get_provider().answer(f"{TAROT_SYSTEM}\n\n{card_block}", [], question)
