"""The three modules (docs/06 Phase 18, Rahul 16 Oct 2026).

A person holds any of them, each granted by approval, no exceptions:

  referrer -> `profiles.referrer`, Content step 1 (Rahul, 17 Oct 2026):
             tags, product links and the A code with their earnings, the
             sign-up money, insights. Granted on its own when the
             conditions in milestones.py are met, no console
  creator -> `profiles.influencer`, Content step 2: step 1 and pay on
             views. Asked for only once step 2's conditions are met; the
             console approves
  pro     -> an approved `consultants` row: bookable consulting (its request
             is the consultant application, apps/consultants)
  seller  -> `profiles.seller`: listing on the Market

Here: what a person holds and has asked for, asking for a module, and the
console's decision on such a request, which tells the person either way.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import ModuleRequest, Profile

MODULES = ("referrer", "creator", "pro", "seller")

# What each request asks (Rahul, 16 Oct 2026). Every answer is text; the
# first three of a Creator's and the first two of a Seller's are needed.
QUESTIONS = {
    "referrer": [],
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
    """{'referrer': bool, 'creator': bool, 'pro': bool, 'seller': bool}.
    Step 2 includes step 1."""
    from apps.consultants import services as consultants

    row = Profile.objects.filter(pk=profile_id).values("referrer", "influencer", "seller").first() or {}
    return {
        "referrer": bool(row.get("referrer") or row.get("influencer")),
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
    from . import milestones

    return {"modules": out, "progress": milestones.progress(profile_id),
            "questions": {k: [{"key": a, "label": b, "required": c} for a, b, c in v]
                          for k, v in QUESTIONS.items()}}


def _not_yet(step):
    left = [f"{r['label'].lower()} {r['have']:,} of {r['need']:,}" for r in step["conditions"] if not r["done"]]
    return "Not yet: " + "; ".join(left) + "."


def ask(profile_id, module, answers):
    """Ask for a module. Content step 1 is granted here and now when its
    conditions are met; step 2 can be asked for only once its own are."""
    from . import milestones

    if module not in QUESTIONS:
        raise Refused("Ask for content or seller here. A Pro applies with the consultant form.")
    profile = Profile.objects.filter(pk=profile_id).first()
    if profile is None or profile.blocked_at is not None:
        raise Refused("This account cannot ask for a module.", 403)
    have = holds(profile_id)
    if have[module]:
        raise Refused("You have this already.", 409)
    if module == "referrer":
        step = milestones.progress(profile_id)["step1"]
        if not step["met"]:
            raise Refused(_not_yet(step), 409)
        return _grant_step1(profile_id)
    if module == "creator":
        if not have["referrer"]:
            raise Refused("Finish step 1 first.", 409)
        step = milestones.progress(profile_id)["step2"]
        if not step["met"]:
            raise Refused(_not_yet(step), 409)
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


def _grant_step1(profile_id):
    """Step 1 needs no console: the conditions are the approval. Recorded
    as an approved request so the history shows when and why."""
    from apps.notifications import services as notify

    now = timezone.now()
    with transaction.atomic():
        Profile.objects.filter(pk=profile_id).update(referrer=True)
        row = ModuleRequest.objects.create(profile_id=profile_id, module="referrer", answers={},
                                           status=ModuleRequest.Status.APPROVED, reviewed_at=now,
                                           reviewed_by="automatic: step 1 conditions met")
    notify.push(profile_id, kind="module.referrer.approved", title="Content step 1 is yours",
                body=_opens("referrer"), ref_type="module", ref_id=str(row.id))
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
        "referrer": "Tag products, share product links and your invite code, and earn on them. Open Studio to start.",
        "creator": "You earn on your views now, with a blue tick. Open Studio to start.",
        "seller": "List downloads, courses, events and products on the Market. Open Studio to start.",
    }[module]
