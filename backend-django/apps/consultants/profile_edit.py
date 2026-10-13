"""A consultant editing their own profile (13 Oct 2026, Rahul).

Two kinds of field, and the split is the point:

  Direct — specialization, bio, experience, languages, tags. What the
    consultant says about themselves; saved on the spot.
  Reviewed — category, credentials, degree and its scan. These were checked
    when the consultant was approved, so a change waits in `profile_reviews`
    until an operator approves it in the console. Until then seekers see the
    old values.
"""

from django.db import transaction
from django.utils import timezone

from .models import Consultant, ProfileReview, ProfileReviewStatus

MAX_BIO = 1000
MAX_SPECIALIZATION = 200
MAX_LIST = 20


class BadEdit(Exception):
    """A profile edit that cannot be saved. `status` is the HTTP answer."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def _clean_list(values):
    out = []
    for v in values or []:
        v = str(v).strip()
        if v and v not in out:
            out.append(v)
    if len(out) > MAX_LIST:
        raise BadEdit(400, f"At most {MAX_LIST} entries.")
    return out


def update_profile(profile_id, data):
    """Save the direct fields present in `data`; the rest stay. Returns the
    consultant row."""
    consultant = Consultant.objects.filter(profile_id=profile_id).first()
    if consultant is None:
        raise BadEdit(404, "No practice on this account.")
    changed = []
    if "specialization" in data:
        text = (data["specialization"] or "").strip()
        if not text:
            raise BadEdit(400, "Write what you specialise in.")
        if len(text) > MAX_SPECIALIZATION:
            raise BadEdit(400, f"Specialization is at most {MAX_SPECIALIZATION} characters.")
        consultant.specialization = text
        changed.append("specialization")
    if "bio" in data:
        text = (data["bio"] or "").strip()
        if len(text) > MAX_BIO:
            raise BadEdit(400, f"About is at most {MAX_BIO} characters.")
        consultant.bio = text or None
        changed.append("bio")
    if "experience_yrs" in data:
        yrs = data["experience_yrs"]
        if yrs is not None and not 0 <= yrs <= 80:
            raise BadEdit(400, "Years of practice is a number from 0 to 80.")
        consultant.experience_yrs = yrs
        changed.append("experience_yrs")
    if "languages" in data:
        consultant.languages = _clean_list(data["languages"])
        changed.append("languages")
    if "tags" in data:
        consultant.tags = _clean_list(data["tags"])
        changed.append("tags")
    if changed:
        consultant.save(update_fields=changed)
    return consultant


def review_of(profile_id):
    return ProfileReview.objects.filter(consultant_id=profile_id).first()


def request_review(profile_id, *, category, credentials, degree, degree_asset_id=None):
    """Send category, credentials and degree for a check. Replaces any
    earlier request, whatever its state, and sets it pending. A request
    that changes nothing is refused rather than queued."""
    from apps.media.models import MediaAsset

    consultant = Consultant.objects.filter(profile_id=profile_id).first()
    if consultant is None:
        raise BadEdit(404, "No practice on this account.")
    category = ", ".join(_clean_list(str(category or "").split(",")))
    if not category:
        raise BadEdit(400, "Pick at least one practice.")
    credentials = _clean_list(credentials)
    degree = (degree or "").strip()
    if degree_asset_id is not None:
        asset = MediaAsset.objects.filter(pk=degree_asset_id).first()
        if asset is None or str(asset.owner).replace("-", "") != str(profile_id).replace("-", ""):
            raise BadEdit(404, "That upload does not exist.")
        if asset.kind != MediaAsset.Kind.DOCUMENT:
            raise BadEdit(400, "The certificate must be uploaded as a document.")
    same = (
        category == (consultant.category or "")
        and credentials == list(consultant.credentials or [])
        and degree == (consultant.degree or "")
        and degree_asset_id is None
    )
    if same:
        raise BadEdit(400, "Nothing changed. Edit the practice, credentials or degree first.")
    review, _ = ProfileReview.objects.update_or_create(
        consultant_id=profile_id,
        defaults={
            "category": category,
            "credentials": credentials,
            "degree": degree,
            "degree_asset_id": degree_asset_id,
            "status": ProfileReviewStatus.PENDING,
            "review_note": "",
            "submitted_at": timezone.now(),
            "reviewed_at": None,
            "reviewed_by": "",
        },
    )
    return review


def decide(review, approve, reviewer, note=""):
    """Approve — copy the request onto the consultants row — or reject with
    the note. One transaction, so an approval never half-applies. Only a
    pending request moves; returns True when it did."""
    with transaction.atomic():
        locked = ProfileReview.objects.select_for_update().filter(
            pk=review.pk, status=ProfileReviewStatus.PENDING
        ).first()
        if locked is None:
            return False
        if approve:
            fields = {
                "category": locked.category,
                "credentials": list(locked.credentials or []),
                "degree": locked.degree or None,
            }
            if locked.degree_asset_id is not None:
                fields["degree_asset_id"] = locked.degree_asset_id
            Consultant.objects.filter(profile_id=locked.consultant_id).update(**fields)
        ProfileReview.objects.filter(pk=locked.pk).update(
            status=ProfileReviewStatus.APPROVED if approve else ProfileReviewStatus.REJECTED,
            review_note=note if not approve else locked.review_note,
            reviewed_at=timezone.now(),
            reviewed_by=str(reviewer),
        )
    return True


def review_row(review):
    if review is None:
        return {"status": "none"}
    return {
        "status": review.status,
        "category": review.category,
        "credentials": list(review.credentials or []),
        "degree": review.degree,
        "new_certificate": review.degree_asset_id is not None,
        "review_note": review.review_note if review.status == ProfileReviewStatus.REJECTED else "",
        "submitted_at": review.submitted_at,
        "reviewed_at": review.reviewed_at,
    }
