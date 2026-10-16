"""The admin console (docs/01-PRD.md §6, docs/02-TRD.md §7 as revised).

Two things are worth testing here and the rest is Django's:

  WHO GETS IN. Not `is_staff` — an ACTIVE row in `admin_users`. A login
  that works is not the same as an admin who is still an admin, and
  revoking access must be one flag in one table.

  WHAT GETS WRITTEN DOWN. PRD §6 requires every action of every tier to be
  audited, for a reason the tests should preserve: it is what makes an
  appeal answerable. A consultant told they are blocked can be shown when,
  by whom, and what the status was before.

The isolation claim is tested too — a Supabase JWT, which is every
credential the phone app has, opens nothing here.
"""

import re
import uuid

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.urls import reverse

from apps.console.models import AdminAction, AdminUser, Tier
from apps.consultants.models import Consultant
from apps.profiles.models import Profile

CONSOLE = "/console/"


def _admin(tier, *, active=True, password="pw-for-a-test"):
    """A console operator: a profile, an admin row, and a Django login."""
    profile_id = uuid.uuid4()
    Profile.objects.create(id=profile_id, phone=str(profile_id)[:15], name=f"{tier} person")
    user = User.objects.create_user(
        username=f"op-{profile_id.hex[:8]}", password=password, is_staff=True
    )
    AdminUser.objects.create(
        profile_id=profile_id, tier=tier, active=active, operator=user
    )
    client = Client()
    client.force_login(user)
    return client, profile_id


def _pending_consultant():
    profile_id = uuid.uuid4()
    Profile.objects.create(id=profile_id, phone=str(profile_id)[:15], name="Applicant")
    return Consultant.objects.create(
        profile_id=profile_id, category="Vedic", languages=["Hindi"],
        credentials=[], status=Consultant.Status.PENDING,
    )


@pytest.mark.django_db
class TestWhoGetsIn:
    def test_a_signed_out_visitor_is_sent_to_the_login(self):
        response = Client().get(CONSOLE, follow=False)
        assert response.status_code in (301, 302)
        assert "login" in response["Location"]

    def test_a_django_user_without_an_admin_row_is_refused(self):
        user = User.objects.create_user(username="nobody", password="pw", is_staff=True)
        client = Client()
        client.force_login(user)
        response = client.get(CONSOLE, follow=False)
        # Not a 200 with an empty menu — refused outright.
        assert response.status_code in (301, 302)

    def test_a_deactivated_admin_loses_the_console_without_a_password_change(self):
        client, profile_id = _admin(Tier.SUPPORT)
        assert client.get(CONSOLE).status_code == 200

        AdminUser.objects.filter(profile_id=profile_id).update(active=False)
        assert client.get(CONSOLE, follow=False).status_code in (301, 302)

    def test_a_supabase_jwt_opens_nothing(self, sign_hs256, hs256_mode):
        """The isolation claim, stated as a test. The phone app's only
        credential is a Supabase JWT; the console takes a session cookie
        against auth_user. One is not convertible into the other."""
        token = sign_hs256()
        response = Client().get(CONSOLE, HTTP_AUTHORIZATION=f"Bearer {token}", follow=False)
        assert response.status_code in (301, 302)


@pytest.mark.django_db
class TestTheMenu:
    """Every page an operator needs must be REACHABLE, not merely
    registered. Django falls back to its own model permissions when a
    ModelAdmin does not override `has_module_permission`, and a console
    operator has none of those — they are staff by way of `admin_users`,
    not by way of `auth_permission`. The approval queue and the audit trail
    were both invisible on the first deploy for exactly this reason, while
    every test passed.
    """

    @pytest.mark.parametrize("url_name", [
        "namo:consultants_consultant_changelist",
        "namo:console_adminaction_changelist",
        "namo:shop_product_changelist",
        "namo:content_content_changelist",
    ])
    def test_a_support_operator_can_open_the_pages_they_need(self, url_name):
        client, _ = _admin(Tier.SUPPORT)
        assert client.get(reverse(url_name)).status_code == 200, url_name

    def test_the_dashboard_is_linked_from_the_front_page(self):
        """It was built and then left reachable only by typing its URL,
        which is the same as not existing. Django's index lists MODELS and
        the dashboard is not one, so nothing was going to link it on its
        own."""
        client, _ = _admin(Tier.SUPPORT)
        body = client.get(CONSOLE).content.decode()
        assert reverse("namo:analytics_dashboard") in body

    @pytest.mark.parametrize("page", [
        "namo:shop_product_changelist",
        "namo:content_content_changelist",
        "namo:console_adminaction_changelist",
        "namo:analytics_dashboard",
    ])
    def test_the_nav_is_on_every_page_not_just_the_front_one(self, page):
        """The tiles fixed the first click and not the second: from inside
        a product list there was no way to reach the dashboard except by
        going Home first. Django's admin has breadcrumbs, which go UP, and
        no lateral navigation at all."""
        client, _ = _admin(Tier.SUPERADMIN)
        body = client.get(reverse(page)).content.decode()
        assert "console-nav" in body, page
        assert reverse("namo:analytics_dashboard") in body, page

    def test_the_front_page_links_the_jobs_somebody_opens_it_for(self):
        client, _ = _admin(Tier.FULFILMENT)
        body = client.get(CONSOLE).content.decode()
        # By module since 16 Oct 2026 (Rahul): the queues on top, then a card each.
        for fragment in ("Waiting for somebody", "Pros applying", "Creator and Seller requests",
                         "To pay on the 7th", "Parcels to send", "Reels and posts", "Qualified views",
                         "Payout statements", "Audit trail"):
            assert fragment in body, fragment

    @pytest.mark.parametrize("url_name", [
        "namo:consultants_payoutstatement_changelist",
        "namo:content_qualifiedview_changelist",
        "namo:profiles_modulerequest_changelist",
        "namo:referrals_cashback_changelist",
    ])
    def test_the_pages_added_on_16_oct_open(self, url_name):
        client, _ = _admin(Tier.SUPERADMIN)
        assert client.get(reverse(url_name)).status_code == 200, url_name

    def test_the_index_lists_the_approval_queue(self):
        client, _ = _admin(Tier.SUPPORT)
        body = client.get(CONSOLE).content.decode()
        assert "consultant" in body.lower()
        assert "adminaction" in body.lower()


@pytest.mark.django_db
class TestApproval:
    def test_support_can_approve_and_it_is_audited(self):
        client, admin_id = _admin(Tier.SUPPORT)
        consultant = _pending_consultant()

        client.post(
            reverse("namo:consultants_consultant_changelist"),
            {"action": "approve", "_selected_action": [str(consultant.pk)]},
            follow=True,
        )
        consultant.refresh_from_db()
        assert consultant.status == Consultant.Status.APPROVED

        entry = AdminAction.objects.get(action="consultant.approve")
        assert entry.admin_id == admin_id
        assert entry.target_id == consultant.profile_id
        # The PREVIOUS state, which is the half an appeal actually needs.
        assert entry.detail["was"] == "pending"
        assert entry.detail["now"] == "approved"

    def test_the_queue_shows_the_rates_the_consultant_typed(self):
        """10 Oct 2026: a consultant sets four rates; the console shows them
        and cannot change them."""
        from apps.consultants import services as consultant_services

        client, _ = _admin(Tier.SUPPORT)
        consultant = _pending_consultant()
        consultant_services.set_rates(
            consultant.profile_id, {"chat": 10, "video": 30, "audio": 20, "booking": 25}
        )
        listing = client.get(reverse("namo:consultants_consultant_changelist")).content.decode()
        assert "Chat ₹10 · Video ₹30 · Audio ₹20" in listing
        assert "Booking ₹25 (₹500 a slot)" in listing
        page = client.get(
            reverse("namo:consultants_consultant_change", args=[consultant.pk])
        ).content.decode()
        assert "Chat ₹10 · Video ₹30 · Audio ₹20" in page
        assert 'name="rates"' not in page

    def test_support_cannot_block(self):
        """Tiers are not a ladder. Support reads and approves; blocking
        somebody's livelihood is Fulfilment's."""
        client, _ = _admin(Tier.SUPPORT)
        consultant = _pending_consultant()
        Consultant.objects.filter(pk=consultant.pk).update(
            status=Consultant.Status.APPROVED
        )

        client.post(
            reverse("namo:consultants_consultant_changelist"),
            {"action": "block", "_selected_action": [str(consultant.pk)]},
            follow=True,
        )
        consultant.refresh_from_db()
        assert consultant.status == Consultant.Status.APPROVED
        assert not AdminAction.objects.filter(action="consultant.block").exists()

    def test_a_consultant_can_never_be_deleted_from_the_console(self):
        """PRD §6 capability 6: soft delete only. A removed record in a
        dispute is evidence."""
        client, _ = _admin(Tier.SUPERADMIN)
        consultant = _pending_consultant()
        client.post(
            reverse("namo:consultants_consultant_delete", args=[consultant.pk]),
            {"post": "yes"}, follow=True,
        )
        assert Consultant.objects.filter(pk=consultant.pk).exists()


@pytest.mark.django_db
class TestAuditTrail:
    def test_the_trail_cannot_be_edited_or_deleted_by_anyone(self):
        """Including superadmin. An append-only log with an edit button is
        a log nobody can rely on."""
        client, admin_id = _admin(Tier.SUPERADMIN)
        entry = AdminAction.objects.create(
            admin_id=admin_id, action="test.thing", target_type="thing"
        )
        assert client.post(
            reverse("namo:console_adminaction_delete", args=[entry.pk]),
            {"post": "yes"}, follow=True,
        ).status_code in (403, 200)
        assert AdminAction.objects.filter(pk=entry.pk).exists()

    def test_only_superadmin_manages_admins(self):
        for tier in (Tier.SUPPORT, Tier.FULFILMENT, Tier.FINANCE):
            client, _ = _admin(tier)
            response = client.get(reverse("namo:console_adminuser_changelist"))
            assert response.status_code == 403, tier
        client, _ = _admin(Tier.SUPERADMIN)
        assert client.get(reverse("namo:console_adminuser_changelist")).status_code == 200


@pytest.mark.django_db
class TestProfileReview:
    """13 Oct 2026, Rahul: a consultant's change of practice, credentials or
    degree waits here; Approve puts it on the profile."""

    def _request(self, consultant, category="Tarot, Numerology"):
        from apps.consultants.models import ProfileReview

        return ProfileReview.objects.create(
            consultant_id=consultant.profile_id, category=category,
            credentials=["Jyotish Visharad"], degree="",
        )

    def test_support_opens_the_queue_and_approves(self):
        client, _ = _admin(Tier.SUPPORT)
        consultant = _pending_consultant()
        review = self._request(consultant)
        listing = client.get(reverse("namo:consultants_profilereview_changelist"))
        assert listing.status_code == 200
        assert "practice, credentials" in listing.content.decode()
        assert client.get(
            reverse("namo:consultants_profilereview_change", args=[review.pk])
        ).status_code == 200

        client.post(
            reverse("namo:consultants_profilereview_changelist"),
            {"action": "approve", "_selected_action": [str(review.pk)]},
            follow=True,
        )
        consultant.refresh_from_db()
        assert consultant.category == "Tarot, Numerology"
        assert consultant.credentials == ["Jyotish Visharad"]
        assert AdminAction.objects.filter(action="profile_review.approved").exists()

    def test_reject_needs_a_reason(self):
        client, _ = _admin(Tier.SUPPORT)
        consultant = _pending_consultant()
        before = consultant.category
        review = self._request(consultant)
        client.post(
            reverse("namo:consultants_profilereview_changelist"),
            {"action": "reject", "_selected_action": [str(review.pk)]},
            follow=True,
        )
        review.refresh_from_db()
        assert review.status == "pending"
        consultant.refresh_from_db()
        assert consultant.category == before


@pytest.mark.django_db
class TestProfilePage:
    def test_ticking_influencer_on_a_profile_with_no_gender_saves(self):
        """14 Oct 2026, Rahul: the change page sent '' for an empty gender
        and `profiles_gender_check` refused the whole save."""
        client, _ = _admin(Tier.FULFILMENT)
        person = Profile.objects.create(id=uuid.uuid4(), phone="919000000123", name="Rudra")
        url = reverse("namo:profiles_profile_change", args=[person.pk])
        form = client.get(url).context["adminform"].form
        data = {k: ("" if v is None else v) for k, v in form.initial.items() if k in form.fields}
        data.update({"influencer": "on", "gender": "", "bio": "", "username": "", "interests": ""})
        data = {k: v for k, v in data.items() if v is not False}
        response = client.post(url, data)
        assert response.status_code == 302, response.context["adminform"].form.errors
        person.refresh_from_db()
        assert person.influencer is True
        assert person.gender is None and person.username is None
        assert AdminAction.objects.filter(action="profile.creator on", target_id=person.pk).exists()

    def test_the_console_says_creator_not_influencer(self):
        """14 Oct 2026, Rahul: "Influencer word ko full change karke creator"."""
        client, _ = _admin(Tier.FULFILMENT)
        person = Profile.objects.create(id=uuid.uuid4(), phone="919000000124", name="Rudra", influencer=True)
        listing = client.get(reverse("namo:profiles_profile_changelist")).content.decode()
        page = client.get(reverse("namo:profiles_profile_change", args=[person.pk])).content.decode()
        # What a person reads: the text between tags, not names and values.
        words = lambda html: re.sub(r"<[^>]*>", " ", re.sub(r"<script.*?</script>", " ", html, flags=re.S))  # noqa: E731
        assert "nfluencer" not in words(listing) and "nfluencer" not in words(page)
        assert "Creator" in page
        only = client.get(reverse("namo:profiles_profile_changelist") + "?creator=yes").content.decode()
        assert "Rudra" in only


@pytest.mark.django_db
def test_every_link_on_the_front_page_opens():
    """Each queue and module link resolves to a page that opens, not to the
    admin's "unknown filter" bounce (16 Oct 2026)."""
    client, _ = _admin(Tier.SUPERADMIN)
    body = client.get(CONSOLE).content.decode()
    links = sorted(set(re.findall(r'href="(/console/[^"#]*)"', body)))
    assert len(links) > 30
    for link in links:
        got = client.get(link.replace("&amp;", "&"))
        assert got.status_code == 200 and "?e=1" not in got.get("Location", ""), link
