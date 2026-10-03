"""A consultant's payout details: PAN and where the money goes (payouts P2,
3 Oct 2026).

Collected now so payouts can start once they are built; nothing here moves
money. **The PAN and the account number are encrypted at rest** with
`PAYOUT_ENCRYPTION_KEY` (Fernet). Only the last four characters are kept in
the clear, for display. The app never receives either number back, and the
console shows them in full only to the Finance tier.

**Checked by a person, for now.** There is no penny drop or PAN API yet, so
the consultant uploads a photo of the PAN card and of a cancelled cheque or
passbook page, both to the private bucket, and Finance compares them with
what was typed before marking the details verified. Any change sends the
details back to `submitted`: an account that changes must be checked again
before money goes to it.

No Aadhaar, deliberately: payouts do not need it, and storing Aadhaar
numbers carries its own legal duties.
"""

import re

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.media.models import MediaAsset

from .models import ConsultantStatus, PayoutDetails, PayoutDetailsStatus

PAN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
IFSC = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
ACCOUNT = re.compile(r"^[0-9]{9,18}$")
UPI = re.compile(r"^[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$")


class NotOpen(Exception):
    """The encryption key is not configured, so nothing can be saved."""


class Refused(ValueError):
    """Input the caller can fix. `field` names it; the message is shown."""

    def __init__(self, field, message):
        super().__init__(message)
        self.field = field


def _fernet():
    key = getattr(settings, "PAYOUT_ENCRYPTION_KEY", "")
    if not key:
        raise NotOpen("PAYOUT_ENCRYPTION_KEY is not set")
    return Fernet(key.encode())


def encrypt(value):
    return _fernet().encrypt(value.encode()).decode()


def decrypt(token):
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, NotOpen):
        return None


def _clean(text):
    return " ".join((text or "").split())


def _document(owner_id, asset_id, field, label):
    if not asset_id:
        raise Refused(field, f"Add a photo of your {label}.")
    asset = MediaAsset.objects.filter(
        pk=asset_id, owner=str(owner_id), kind=MediaAsset.Kind.DOCUMENT
    ).first()
    if asset is None or asset.status != MediaAsset.Status.READY:
        raise Refused(field, f"The photo of your {label} did not upload. Add it again.")
    return asset.pk


def shape(details):
    """What the consultant's app may see: no full number, ever."""
    if details is None:
        return {"status": "missing"}
    return {
        "status": details.status,
        "pan_last4": details.pan_last4,
        "pan_name": details.pan_name,
        "account_holder": details.account_holder,
        "account_last4": details.account_last4,
        "ifsc": details.ifsc,
        "upi_id": details.upi_id,
        "has_pan_doc": bool(details.pan_doc_asset_id),
        "has_bank_doc": bool(details.bank_doc_asset_id),
        "review_note": details.review_note,
        "submitted_at": details.submitted_at,
        "reviewed_at": details.reviewed_at,
    }


def read(consultant_id):
    return shape(PayoutDetails.objects.filter(consultant_id=consultant_id).first())


def save(consultant, data):
    """Validate, encrypt and store; the details go (back) to `submitted`."""
    if consultant.status == ConsultantStatus.BLOCKED:
        raise Refused("account", "This practice is blocked. Contact support.")
    _fernet()  # refuse before validating anything if nothing could be stored

    pan = _clean(data.get("pan")).replace(" ", "").upper()
    if not PAN.match(pan):
        raise Refused("pan", "That is not a PAN. It has 10 characters, like ABCDE1234F.")
    pan_name = _clean(data.get("pan_name"))
    if len(pan_name) < 2:
        raise Refused("pan_name", "Enter your name exactly as it is on your PAN card.")

    holder = _clean(data.get("account_holder"))
    if len(holder) < 2:
        raise Refused("account_holder", "Enter the account holder's name as the bank has it.")
    account = _clean(data.get("account_number")).replace(" ", "")
    if not ACCOUNT.match(account):
        raise Refused("account_number", "An account number is 9 to 18 digits.")
    if account != _clean(data.get("account_number_confirm")).replace(" ", ""):
        raise Refused("account_number_confirm", "The two account numbers do not match.")
    ifsc = _clean(data.get("ifsc")).replace(" ", "").upper()
    if not IFSC.match(ifsc):
        raise Refused("ifsc", "That is not an IFSC. It has 11 characters, like HDFC0001234.")
    upi = _clean(data.get("upi_id")).replace(" ", "")
    if upi and not UPI.match(upi):
        raise Refused("upi_id", "That is not a UPI ID. It looks like name@bank.")

    owner = consultant.profile_id
    pan_doc = _document(owner, data.get("pan_doc_asset_id"), "pan_doc", "PAN card")
    bank_doc = _document(
        owner, data.get("bank_doc_asset_id"), "bank_doc", "cancelled cheque or passbook"
    )

    fields = {
        "pan_cipher": encrypt(pan),
        "pan_last4": pan[-4:],
        "pan_name": pan_name,
        "account_holder": holder,
        "account_cipher": encrypt(account),
        "account_last4": account[-4:],
        "ifsc": ifsc,
        "upi_id": upi,
        "pan_doc_asset_id": pan_doc,
        "bank_doc_asset_id": bank_doc,
        "status": PayoutDetailsStatus.SUBMITTED,
        "review_note": "",
        "submitted_at": timezone.now(),
        "reviewed_at": None,
        "reviewed_by": "",
    }
    with transaction.atomic():
        details, _ = PayoutDetails.objects.update_or_create(
            consultant_id=owner, defaults=fields
        )
    return shape(details)
