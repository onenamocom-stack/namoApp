"""The reel poster (12 Oct 2026): ten reels a day from a Drive folder, from
folder 3 on, for Rahul Jain's account, at times that differ every day."""

from datetime import date, datetime, timedelta

import pytest

from apps.consultants.models import Consultant
from apps.content import drive_reels
from apps.content.models import Content, DriveReel
from apps.profiles.models import Profile

AUTHOR = "483214f1-f7fc-407a-9d9d-e4c437d64d18"
FOLDER = drive_reels.FOLDER

TREE = {
    "root": [
        {"id": "f1", "name": "Folder 1", "mimeType": FOLDER},
        {"id": "f2", "name": "Folder 2", "mimeType": FOLDER},
        {"id": "f10", "name": "Folder 10", "mimeType": FOLDER},
        {"id": "f3", "name": "Folder 3", "mimeType": FOLDER},
        {"id": "notes", "name": "notes.txt", "mimeType": "text/plain"},
    ],
    "f1": [{"id": "old1", "name": "a.mp4", "mimeType": "video/mp4", "size": "10"}],
    "f2": [{"id": "old2", "name": "a.mp4", "mimeType": "video/mp4", "size": "10"}],
    "f3": [
        {"id": "v3b", "name": "clip 10.mp4", "mimeType": "video/mp4", "size": "10"},
        {"id": "v3a", "name": "clip 2.mp4", "mimeType": "video/mp4", "size": "10",
         "description": "Om Namah Shivaya"},
        {"id": "pic", "name": "cover.jpg", "mimeType": "image/jpeg", "size": "10"},
    ],
    "f10": [{"id": "v10", "name": "x.mp4", "mimeType": "video/mp4", "size": "10"}],
}


@pytest.fixture
def drive(monkeypatch, settings):
    settings.DRIVE_REELS_FOLDER_ID = "root"
    settings.DRIVE_REELS_AUTHOR_ID = AUTHOR
    monkeypatch.setattr(drive_reels, "_token", lambda: "tok")
    monkeypatch.setattr(drive_reels, "_list", lambda parent, token: list(TREE.get(parent, [])))
    monkeypatch.setattr(drive_reels, "_download", lambda fid, token, into: (into.write(b"video"), into.seek(0)))
    Profile.objects.create(id=AUTHOR, phone="rahul", name="Rahul Jain")
    Consultant.objects.create(profile_id=AUTHOR, category="Astrologer", status="approved")


class TestThePlan:
    def test_ten_a_day_inside_the_window_one_per_slice(self):
        times = drive_reels.plan_for(date(2026, 10, 12))
        assert len(times) == 10 and times == sorted(times)
        assert times[0].strftime("%H:%M") >= "06:00" and times[-1].strftime("%H:%M") <= "23:30"
        assert all(b - a > timedelta(minutes=10) for a, b in zip(times, times[1:]))

    def test_the_same_day_gives_the_same_times_and_days_differ(self):
        d = date(2026, 10, 12)
        assert drive_reels.plan_for(d) == drive_reels.plan_for(d)
        assert [t.time() for t in drive_reels.plan_for(d)] != [
            t.time() for t in drive_reels.plan_for(d + timedelta(days=1))]

    def test_due_counts_the_times_passed(self):
        d = date(2026, 10, 12)
        times = drive_reels.plan_for(d)
        assert drive_reels.due_now(times[3] + timedelta(seconds=1)) == 4
        assert drive_reels.due_now(datetime(2026, 10, 12, 5, 0, tzinfo=drive_reels.IST)) == 0


@pytest.mark.django_db
class TestTheQueue:
    def test_from_folder_3_in_number_order_videos_only_files_by_name(self, drive):
        names = [(folder, f["name"]) for folder, f in drive_reels.queue()]
        assert names == [("Folder 3", "clip 2.mp4"), ("Folder 3", "clip 10.mp4"), ("Folder 10", "x.mp4")]

    def test_posts_one_as_the_author_with_the_drive_description(self, drive):
        out = drive_reels.post_one()
        assert out["posted"] == "clip 2.mp4"
        reel = Content.objects.get()
        assert reel.kind == "clip" and str(reel.author_id) == AUTHOR and reel.caption == "Om Namah Shivaya"
        assert DriveReel.objects.get(drive_file_id="v3a").content_id == reel.id

    def test_never_the_same_file_twice(self, drive):
        drive_reels.post_one()
        drive_reels.post_one()
        assert list(DriveReel.objects.order_by("created_at").values_list("drive_file_id", flat=True)) == ["v3a", "v3b"]

    def test_too_large_is_skipped_not_stuck(self, drive, settings):
        settings.DRIVE_REELS_MAX_BYTES = 5
        assert drive_reels.post_one() == {"skipped": "clip 2.mp4"}
        assert DriveReel.objects.get().skipped_reason
        assert Content.objects.count() == 0

    def test_an_empty_queue_posts_nothing(self, drive, monkeypatch):
        monkeypatch.setattr(drive_reels, "queue", lambda token=None: [])
        assert drive_reels.post_one() is None


@pytest.mark.django_db
class TestTheTick:
    def test_one_per_run_and_only_when_due(self, drive):
        times = drive_reels.plan_for(date(2026, 10, 12))
        before = times[0] - timedelta(minutes=1)
        assert drive_reels.tick(before)["action"] is None
        # Three are due and none posted: one now, not three.
        late = times[2] + timedelta(minutes=1)
        out = drive_reels.tick(late)
        assert out["due"] == 3 and out["action"]["posted"]
        assert DriveReel.objects.exclude(posted_at=None).count() == 1


@pytest.mark.django_db
def test_a_video_already_on_the_app_is_never_posted_again(drive):
    """The 48 seeded clips are named seed-<instagram id>….mp4; the Drive
    files are <instagram id>.mp4. The same id is the same video."""
    TREE["f3"].append({"id": "dup", "name": "2948672073683508325.mp4", "mimeType": "video/mp4", "size": "10"})
    try:
        Content.objects.create(author_id=AUTHOR, kind="clip", status="live",
                               media_url="https://cdn.example/clips/x/seed-2948672073683508325_66520811081.mp4")
        names = [f["name"] for _, f in drive_reels.queue()]
        assert "2948672073683508325.mp4" not in names and "clip 2.mp4" in names
    finally:
        TREE["f3"].pop()
