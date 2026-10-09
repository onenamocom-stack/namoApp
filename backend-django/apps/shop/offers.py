"""What a product gives back on a first order through an astrologer's code.

9 Oct 2026, owner. A buyer brought by an astrologer's link used to get 10%
of the order back in the wallet. Now each product can carry its own rule,
set in the console: a flat amount per item (₹500 back on a ₹700 item), a
percentage, a percentage capped per item, or nothing. The shop pays through
Razorpay, not the wallet, so cashback is spent on consultations, Namo AI and
the app's other paid extras — which is the point: it brings the buyer to an
astrologer.

The rule is one of four kinds; a product left on DEFAULT behaves exactly as
before (the platform's REFERRAL_CASHBACK_BPS on the whole order, capped by
REFERRAL_CASHBACK_CAP_PAISE). Everything that turns a rule into paise lives
here, so the next kind of offer is added in one place.

The split, per product line, is decided in referrals.services.cashback_split:
the buyer gets the rule's amount on a PREPAID order and nothing on cash on
delivery; the astrologer gets the platform rate on what is left after the
buyer's share (₹700 − ₹500 → 10% of ₹200 = ₹20).
"""

import re

from django.db import models


class CashbackKind(models.TextChoices):
    DEFAULT = "default", "Platform default (10% of the order)"
    NONE = "none", "No cashback"
    FLAT = "flat", "Flat amount per item"
    PERCENT = "percent", "Percent of the price, optionally capped per item"


def buyer_cashback(product, unit_price_paise, qty):
    """Paise back to the buyer for one product line, or None when the
    product is on DEFAULT (the platform rate applies to the whole order and
    is worked out there). Never more than the line cost."""
    kind = product.referral_cashback_kind or CashbackKind.DEFAULT
    line = unit_price_paise * qty
    value = product.referral_cashback_value or 0
    if kind == CashbackKind.NONE:
        return 0
    if kind == CashbackKind.FLAT:
        return min(value * qty, line)
    if kind == CashbackKind.PERCENT:
        each = unit_price_paise * value // 10_000
        cap = product.referral_cashback_cap_paise
        if cap:
            each = min(each, cap)
        return min(each * qty, line)
    return None


def describe(product):
    """The rule as one short phrase — the console list and the sheet column.
    Blank is DEFAULT, so an untouched sheet cell keeps the platform rate."""
    kind = product.referral_cashback_kind or CashbackKind.DEFAULT
    value = product.referral_cashback_value or 0
    if kind == CashbackKind.NONE:
        return "none"
    if kind == CashbackKind.FLAT:
        return f"flat {_rupees(value)}"
    if kind == CashbackKind.PERCENT:
        text = f"{_percent(value)}%"
        cap = product.referral_cashback_cap_paise
        return f"{text} upto {_rupees(cap)}" if cap else text
    return ""


_FLAT = re.compile(r"^(?:flat\s*)?(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)$")
_PERCENT = re.compile(r"^(\d+(?:\.\d{1,2})?)\s*%(?:\s*(?:upto|up to|max)\s*(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?))?$")


def parse(text):
    """The sheet's phrase back to (kind, value, cap). Accepts: blank or
    "default", "none", "flat 500" or "500" (rupees), "10%", "10% upto 100".
    Raises ValueError with the sentence the upload shows."""
    t = re.sub(r"\s+", " ", str(text or "").strip().lower())
    if t in ("", "default"):
        return CashbackKind.DEFAULT, None, None
    if t in ("none", "no", "0"):
        return CashbackKind.NONE, None, None
    m = _PERCENT.match(t)
    if m:
        bps = round(float(m.group(1)) * 100)
        if not 0 < bps <= 10_000:
            raise ValueError("A cashback percent is between 0 and 100.")
        cap = round(float(m.group(2)) * 100) if m.group(2) else None
        return CashbackKind.PERCENT, bps, cap
    m = _FLAT.match(t)
    if m:
        paise = round(float(m.group(1)) * 100)
        if paise <= 0:
            raise ValueError("A flat cashback is more than ₹0.")
        return CashbackKind.FLAT, paise, None
    raise ValueError('Cashback reads like "flat 500", "10%", "10% upto 100", "none", or blank for the default.')


def _rupees(paise):
    r = (paise or 0) / 100
    return f"{r:g}"


def _percent(bps):
    return f"{(bps or 0) / 100:g}"
