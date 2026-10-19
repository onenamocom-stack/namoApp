"""The video pipeline's moderation rule (part E, 17 Oct 2026; docs/06
Phase 19). The worker sends SafeSearch's worst likelihood per category
over the video's sheets (a frame every 10 seconds, nine to a sheet);
this decides what happens:

  violation  adult or violence VERY_LIKELY → `rejected`, files deleted
  doubt      adult POSSIBLE or more, violence or racy LIKELY or more, or
             no verdict at all (Vision failed, moderation off) → the
             console's review queue (`in_review`)
  clear      → `live`, for everybody. Until 19 Oct 2026 anybody but an
             approved Pro or a Creator had their first 3 videos wait in
             the queue; Rahul: "approval ke baad live hoti hai. Wo hata do"

SafeSearch sees frames only: it does not hear audio or read hate speech,
and nothing between two frames. Reports cover that.
"""

LEVELS = ("UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY")

CLEAR, DOUBT, VIOLATION = "clear", "doubt", "violation"


def _at_least(verdict, category, level):
    seen = verdict.get(category)
    return seen in LEVELS and LEVELS.index(seen) >= LEVELS.index(level)


def judge(verdict):
    """SafeSearch's answer (or nothing) to clear, doubt or violation."""
    if not isinstance(verdict, dict) or verdict.get("error") or not verdict.get("images"):
        return DOUBT
    if _at_least(verdict, "adult", "VERY_LIKELY") or _at_least(verdict, "violence", "VERY_LIKELY"):
        return VIOLATION
    if (_at_least(verdict, "adult", "POSSIBLE") or _at_least(verdict, "violence", "LIKELY")
            or _at_least(verdict, "racy", "LIKELY")):
        return DOUBT
    return CLEAR


def status_for(video, outcome):
    """Where one row goes, given the file's outcome and its owner."""
    from .models import VideoStatus

    if outcome == VIOLATION:
        return VideoStatus.REJECTED
    if outcome == DOUBT:
        return VideoStatus.IN_REVIEW
    return VideoStatus.LIVE
