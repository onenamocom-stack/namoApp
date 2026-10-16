"""The three modules (docs/06 Phase 18, Rahul 16 Oct 2026).

A person holds any of them, each granted by approval, no exceptions:

  creator -> `profiles.influencer`: posting video, tags, links and the A
             code; content earnings
  pro     -> an approved `consultants` row: bookable consulting (its request
             is the consultant application, apps/consultants)
  seller  -> `profiles.seller`: listing on the Market

Here: what a person holds and has asked for, asking for the Creator or the
Seller module, and the console's decision on such a request, which tells
the person either way.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import ModuleRequest, Profile

MODULES = ("creator", "pro", "seller")

# What each request asks (Rahul, 16 Oct 2026). Every answer is text; the
# first three of a Creator's and the first two of a Seller's are needed.
QUESTIONS = {
    "creator": [("topic", "What you post about", True), ("link", "Your Instagram or YouTube", True),
                ("followers", "How many follow you there", True), ("why", "Why Namo, in a line", False)],
    "seller": [("what", "What you will sell", True), ("sample", "A sample or a link to your work", True),
               ("why", "Anything else, in a line", False)],
}
MAX_ANSWER = 300


class Refused(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def holds(profile_id):
    """{'creator': bool, 'pro': bool, 'seller': bool}."""
    from apps.consultants import services as consultants

    row = Profile.objects.filter(pk=profile_id).values("influencer", "seller").first() or {}
    return {
        "creator": bool(row.get("influencer")),
        "pro": consultants.is_approved(profile_id),
        "seller": bool(row.get("seller")),
    }


def is_seller(profile_id):
    return Profile.objects.filter(pk=profile_id, seller=True, blocked_at__isnull=True).exists()


def status(profile_id):
    """Each module: held, or the latest request (pending, or rejected with
    its note), or nothing. The Pro module reads the consultant row."""
    from apps.consultants.models import Consultant

    have = holds(profile_id)
    out = {}
    for module in MODULES:
        entry = {"held": have[module], "request": None}
        if module == "pro":
            row = Consultant.objects.filter(profile_id=profile_id).values("status").first()
            if row and not have["pro"]:
                entry["request"] = {"status": "pending" if row["status"] == "pending" else "rejected",
                                    "note": ""}
        elif not have[module]:
            last = ModuleRequest.objects.filter(profile_id=profile_id, module=module).order_by("-submitted_at").first()
            if last and last.status != ModuleRequest.Status.APPROVED:
                entry["request"] = {"status": last.status, "note": last.review_note,
                                    "submitted_at": last.submitted_at.isoformat()}
        out[module] = entry
    return {"modules": out, "questions": {k: [{"key": a, "label": b, "required": c} for a, b, c in v]
                                          for k, v in QUESTIONS.items()}}


def ask(profile_id, module, answers):
    """Send a request for the Creator or the Seller module."""
    if module not in QUESTIONS:
        raise Refused("Ask for creator or seller here. A Pro applies with the consultant form.")
    profile = Profile.objects.filter(pk=profile_id).first()
    if profile is None or profile.blocked_at is not None:
        raise Refused("This account cannot ask for a module.", 403)
    if holds(profile_id)[module]:
        raise Refused("You have this already.", 409)
    clean = {}
    for key, label, needed in QUESTIONS[module]:
        value = str((answers or {}).get(key) or "").strip()[:MAX_ANSWER]
        if needed and not value:
            raise Refused(f"Fill in: {label}.")
        clean[key] = value
    try:
        with transaction.atomic():
            row = ModuleRequest.objects.create(profile_id=profile_id, module=module, answers=clean)
    except IntegrityError:
        raise Refused("Your request is already waiting for approval.", 409) from None
    return row


def decide(request, approve, who, note=""):
    """The console's decision: approving switches the module on. A
    rejection needs a note, which the person sees. Either way they hear."""
    from apps.notifications import services as notify

    if request.status != ModuleRequest.Status.PENDING:
        raise Refused("This request was decided already.")
    note = (note or "").strip()
    if not approve and not note:
        raise Refused("Write the reason in the review note and save before rejecting.")
    name = request.get_module_display()
    with transaction.atomic():
        if approve:
            field = "influencer" if request.module == ModuleRequest.Module.CREATOR else "seller"
            Profile.objects.filter(pk=request.profile_id).update(**{field: True})
        request.status = ModuleRequest.Status.APPROVED if approve else ModuleRequest.Status.REJECTED
        request.review_note = note
        request.reviewed_at = timezone.now()
        request.reviewed_by = who or ""
        request.save(update_fields=["status", "review_note", "reviewed_at", "reviewed_by"])
    if approve:
        notify.push(request.profile_id, kind=f"module.{request.module}.approved", title=f"You are a {name} now",
                    body=_opens(request.module), ref_type="module", ref_id=str(request.id))
    else:
        notify.push(request.profile_id, kind=f"module.{request.module}.rejected",
                    title=f"Your {name} request was not approved", body=note[:140],
                    ref_type="module", ref_id=str(request.id))
    return request


def _opens(module):
    return {
        "creator": "Post reels, tag products and earn on your views. Open Dashboard to start.",
        "seller": "List downloads, courses, events and products on the Market. Open Dashboard to start.",
    }[module]
