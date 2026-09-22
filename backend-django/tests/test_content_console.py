"""Reels and posts from the console (stage 3).

One rule is load-bearing and the rest is form validation: **the file goes
to R2 and the database holds a pointer.** That is what the migration was
run to establish — 202 MB of video came out of Postgres and onto object
storage (HANDOFF §14) — and an admin upload that wrote bytes back into a
column would undo it quietly, one reel at a time.
"""

import io
import uuid

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from django.urls import reverse

from apps.console.models import AdminAction, AdminUser, Tier
from apps.content.admin import ContentForm
from apps.content.models import Content, ContentKind, ContentStatus
from apps.media.models import MediaAsset
from apps.profiles.models import Profile


@pytest.fixture(autouse=True)
def local_media(settings):
    """The LocalProvider fabricates the URL and writes no bytes — enough to
    prove the row shape without a bucket."""
    settings.MEDIA_PROVIDER = "local"
    settings.MEDIA_PUBLIC_BASE_URL = "https://media.test"


def _admin(tier=Tier.FULFILMENT):
    profile_id = uuid.uuid4()
    Profile.objects.create(id=profile_id, phone=str(profile_id)[:15], name="Operator")
    user = User.objects.create_user(username=f"op{profile_id.hex[:8]}", is_staff=True)
    AdminUser.objects.create(profile_id=profile_id, tier=tier, active=True, operator=user)
    client = Client()
    client.force_login(user)
    return client, profile_id


def _video(name="reel.mp4", size=2048):
    return SimpleUploadedFile(name, b"x" * size, content_type="video/mp4")


@pytest.mark.django_db
class TestUpload:
    def test_the_file_goes_to_storage_and_the_row_holds_a_pointer(self):
        client, admin_id = _admin()
        client.post(reverse("namo:content_content_add"), {
            "kind": ContentKind.CLIP, "status": ContentStatus.LIVE,
            "caption": "A reel", "title": "", "body": "", "media_url": "",
            "upload": _video(),
        }, follow=True)

        row = Content.objects.get()
        assert row.media_url.startswith("https://media.test/")
        # A pointer, not the bytes.
        assert len(row.media_url) < 300
        assert "reels/" in row.media_url

        asset = MediaAsset.objects.get()
        assert asset.bucket_key in row.media_url
        assert asset.size_bytes == 2048
        assert asset.status == "ready"

    def test_the_upload_is_audited_with_the_key_and_the_size(self):
        client, admin_id = _admin()
        client.post(reverse("namo:content_content_add"), {
            "kind": ContentKind.CLIP, "status": ContentStatus.DRAFT,
            "caption": "x", "title": "", "body": "", "media_url": "",
            "upload": _video(size=4096),
        }, follow=True)
        entry = AdminAction.objects.get(action="content.upload")
        assert entry.admin_id == admin_id
        assert entry.detail["size_bytes"] == 4096
        assert entry.detail["mime"] == "video/mp4"

    def test_an_admin_post_is_authored_by_that_admin(self):
        """The feed joins to `profiles` for a name. Content with no real
        author renders blank."""
        client, admin_id = _admin()
        client.post(reverse("namo:content_content_add"), {
            "kind": ContentKind.POST, "status": ContentStatus.LIVE,
            "body": "A note", "title": "", "caption": "", "media_url": "",
        }, follow=True)
        assert Content.objects.get().author_id == admin_id

    def test_publishing_stamps_published_at(self):
        """The feed orders by published_at. A live row without one sorts
        last forever — invisible in a different way from unpublished."""
        client, _ = _admin()
        client.post(reverse("namo:content_content_add"), {
            "kind": ContentKind.POST, "status": ContentStatus.LIVE,
            "body": "Now", "title": "", "caption": "", "media_url": "",
        }, follow=True)
        assert Content.objects.get().published_at is not None


@pytest.mark.django_db
class TestForm:
    def test_a_clip_with_no_video_is_refused(self):
        form = ContentForm(data={
            "kind": ContentKind.CLIP, "status": ContentStatus.LIVE,
            "caption": "empty", "media_url": "",
        })
        assert not form.is_valid()
        assert "upload" in form.errors

    def test_a_pdf_is_not_a_reel(self):
        form = ContentForm(
            data={"kind": ContentKind.CLIP, "status": ContentStatus.DRAFT, "media_url": ""},
            files={"upload": SimpleUploadedFile("x.pdf", b"%PDF", content_type="application/pdf")},
        )
        assert not form.is_valid()
        assert "upload" in form.errors

    def test_an_oversized_video_is_refused_with_the_seeker_paths_limit(self):
        big = SimpleUploadedFile("huge.mp4", b"x" * 16, content_type="video/mp4")
        big.size = 200 * 1024 * 1024  # 200 MB, past the 100 MB cap
        form = ContentForm(
            data={"kind": ContentKind.CLIP, "status": ContentStatus.DRAFT, "media_url": ""},
            files={"upload": big},
        )
        assert not form.is_valid()
        assert "100 MB" in str(form.errors["upload"])


@pytest.mark.django_db
class TestModeration:
    def test_removing_keeps_the_row(self):
        """PRD §6 capability 6: soft delete only — a removed post in a
        dispute is evidence."""
        client, _ = _admin()
        row = Content.objects.create(
            author_id=uuid.uuid4(), kind=ContentKind.POST, body="bad",
            status=ContentStatus.LIVE,
        )
        client.post(reverse("namo:content_content_changelist"),
                    {"action": "remove", "_selected_action": [str(row.pk)]}, follow=True)
        row.refresh_from_db()
        assert row.status == ContentStatus.REMOVED
        assert Content.objects.filter(pk=row.pk).exists()

    def test_delete_is_refused_at_every_tier(self):
        client, _ = _admin(Tier.SUPERADMIN)
        row = Content.objects.create(
            author_id=uuid.uuid4(), kind=ContentKind.POST, body="keep",
            status=ContentStatus.LIVE,
        )
        client.post(reverse("namo:content_content_delete", args=[row.pk]),
                    {"post": "yes"}, follow=True)
        assert Content.objects.filter(pk=row.pk).exists()

    def test_support_cannot_publish(self):
        client, _ = _admin(Tier.SUPPORT)
        row = Content.objects.create(
            author_id=uuid.uuid4(), kind=ContentKind.POST, body="x",
            status=ContentStatus.DRAFT,
        )
        client.post(reverse("namo:content_content_changelist"),
                    {"action": "publish", "_selected_action": [str(row.pk)]}, follow=True)
        row.refresh_from_db()
        assert row.status == ContentStatus.DRAFT
