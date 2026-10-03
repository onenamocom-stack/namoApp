"""Payouts P2: PAN and bank details, encrypted at rest; and the paid-session
count the milestone badges read (3 Oct 2026)."""

import uuid

import pytest
from django.utils import timezone

from apps.chat.models import Session
from apps.consultants import payout_details
from apps.consultants.models import PayoutDetails
from apps.media.models import MediaAsset

from .test_consultants import (  # noqa: F401 — fixtures are used by name
    PRO,
    SEEKER,
    auth,
    catalogue,
    money_tables,
    pro_token,
    roster,
    seeker_token,
)

URL = "/v1/consultants/me/payout-details/"


def document(owner=PRO, status=MediaAsset.Status.READY, kind=MediaAsset.Kind.DOCUMENT):
    return MediaAsset.objects.create(
        owner=str(owner), kind=kind, bucket_key=f"docs/{uuid.uuid4()}.jpg",
        mime="image/jpeg", size_bytes=1000, status=status,
    )


@pytest.fixture
def docs(roster):
    return document(), document()


def form(docs, **over):
    pan_doc, bank_doc = docs
    data = {
        "pan": "abcde1234f",
        "pan_name": "Ritu  Kashyap",
        "account_holder": "Ritu Kashyap",
        "account_number": "50100123456789",
        "account_number_confirm": "50100123456789",
        "ifsc": "hdfc0001234",
        "upi_id": "",
        "pan_doc_asset_id": str(pan_doc.pk),
        "bank_doc_asset_id": str(bank_doc.pk),
    }
    data.update(over)
    return data


@pytest.mark.django_db
class TestPayoutDetails:
    def test_missing_until_saved(self, api_client, pro_token, roster):
        assert api_client.get(URL, **auth(pro_token)).json() == {"status": "missing"}

    def test_saved_encrypted_and_never_returned_in_full(self, api_client, pro_token, docs):
        body = api_client.put(URL, form(docs), format="json", **auth(pro_token)).json()
        assert body["status"] == "submitted"
        assert body["pan_last4"] == "234F"
        assert body["account_last4"] == "6789"
        assert body["ifsc"] == "HDFC0001234"
        assert body["pan_name"] == "Ritu Kashyap"
        assert "50100123456789" not in str(body) and "ABCDE1234F" not in str(body)

        row = PayoutDetails.objects.get(consultant_id=PRO)
        assert "50100123456789" not in row.account_cipher
        assert "ABCDE1234F" not in row.pan_cipher
        assert payout_details.decrypt(row.account_cipher) == "50100123456789"
        assert payout_details.decrypt(row.pan_cipher) == "ABCDE1234F"

        again = api_client.get(URL, **auth(pro_token)).json()
        assert again == body

    @pytest.mark.parametrize(
        "field,value",
        [
            ("pan", "ABCD1234F"),
            ("pan_name", " "),
            ("account_number", "12345"),
            ("account_number_confirm", "50100123456780"),
            ("ifsc", "HDFC1234567"),
            ("upi_id", "not-an-upi"),
        ],
    )
    def test_each_field_is_checked(self, api_client, pro_token, docs, field, value):
        response = api_client.put(URL, form(docs, **{field: value}), format="json", **auth(pro_token))
        assert response.status_code == 400
        assert response.json()["field"] == field
        assert not PayoutDetails.objects.exists()

    def test_documents_must_be_the_callers_own_private_uploads(self, api_client, pro_token, docs):
        strangers = document(owner=SEEKER)
        response = api_client.put(
            URL, form(docs, pan_doc_asset_id=str(strangers.pk)), format="json", **auth(pro_token)
        )
        assert response.status_code == 400 and response.json()["field"] == "pan_doc"

        public_image = document(kind=MediaAsset.Kind.IMAGE)
        response = api_client.put(
            URL, form(docs, bank_doc_asset_id=str(public_image.pk)), format="json", **auth(pro_token)
        )
        assert response.status_code == 400 and response.json()["field"] == "bank_doc"

        unfinished = document(status=MediaAsset.Status.PROCESSING)
        response = api_client.put(
            URL, form(docs, bank_doc_asset_id=str(unfinished.pk)), format="json", **auth(pro_token)
        )
        assert response.status_code == 400

    def test_a_change_needs_checking_again(self, api_client, pro_token, docs):
        api_client.put(URL, form(docs), format="json", **auth(pro_token))
        PayoutDetails.objects.filter(consultant_id=PRO).update(status="verified")
        body = api_client.put(
            URL,
            form(docs, account_number="123456789012", account_number_confirm="123456789012"),
            format="json",
            **auth(pro_token),
        ).json()
        assert body["status"] == "submitted"
        assert body["account_last4"] == "9012"
        assert PayoutDetails.objects.count() == 1

    def test_without_a_key_nothing_is_stored(self, api_client, pro_token, docs, settings):
        settings.PAYOUT_ENCRYPTION_KEY = ""
        response = api_client.put(URL, form(docs), format="json", **auth(pro_token))
        assert response.status_code == 503
        assert not PayoutDetails.objects.exists()

    def test_only_a_consultant_has_payout_details(self, api_client, seeker_token, roster):
        assert api_client.get(URL, **auth(seeker_token)).status_code == 404
        assert api_client.get(URL).status_code == 401


@pytest.mark.django_db
class TestSessionsDone:
    def _session(self, service, status, charged):
        return Session.objects.create(
            seeker_id=SEEKER, consultant_id=PRO, service=service, mode="chat",
            rate_paise=1000, status=status, charged_paise=charged,
            ended_at=timezone.now() if status in ("ended", "declined") else None,
        )

    def test_only_sessions_that_charged_count(self, api_client, pro_token, roster):
        _, service = roster
        self._session(service, "ended", 1000)
        self._session(service, "ended", 2500)
        self._session(service, "declined", None)
        self._session(service, "expired", None)

        public = api_client.get(f"/v1/consultants/{PRO}/").json()
        assert public["sessions_done"] == 2
        listed = next(c for c in api_client.get("/v1/consultants/").json() if c["profile_id"] == PRO)
        assert listed["sessions_done"] == 2
        assert api_client.get("/v1/consultants/me/", **auth(pro_token)).json()["sessions_done"] == 2

    def test_zero_when_nothing_was_given(self, api_client, roster):
        assert api_client.get(f"/v1/consultants/{PRO}/").json()["sessions_done"] == 0


@pytest.mark.django_db
class TestConsoleReview:
    LIST = "namo:consultants_payoutdetails_changelist"

    def _saved(self, api_client, pro_token, docs):
        api_client.put(URL, form(docs), format="json", **auth(pro_token))
        return PayoutDetails.objects.get(consultant_id=PRO)

    def test_finance_verifies_and_it_is_audited(self, api_client, pro_token, docs):
        from django.urls import reverse

        from apps.console.models import AdminAction, Tier

        from .test_console import _admin

        details = self._saved(api_client, pro_token, docs)
        client, admin_id = _admin(Tier.FINANCE)
        page = client.get(reverse("namo:consultants_payoutdetails_change", args=[details.pk]))
        assert page.status_code == 200
        assert "50100123456789" in page.content.decode()  # Finance sees it in full

        client.post(reverse(self.LIST), {"action": "verify", "_selected_action": [str(details.pk)]})
        details.refresh_from_db()
        assert details.status == "verified"
        assert AdminAction.objects.get(action="payout_details.verified").admin_id == admin_id

    def test_support_cannot_see_payout_details(self, api_client, pro_token, docs):
        from django.urls import reverse

        from apps.console.models import Tier

        from .test_console import _admin

        details = self._saved(api_client, pro_token, docs)
        client, _ = _admin(Tier.SUPPORT)
        page = client.get(reverse("namo:consultants_payoutdetails_change", args=[details.pk]))
        assert page.status_code in (302, 403)

    def test_reject_needs_a_reason(self, api_client, pro_token, docs):
        from django.urls import reverse

        from apps.console.models import Tier

        from .test_console import _admin

        details = self._saved(api_client, pro_token, docs)
        client, _ = _admin(Tier.FINANCE)
        client.post(reverse(self.LIST), {"action": "reject", "_selected_action": [str(details.pk)]})
        details.refresh_from_db()
        assert details.status == "submitted"

        PayoutDetails.objects.filter(pk=details.pk).update(review_note="PAN photo is blurred.")
        client.post(reverse(self.LIST), {"action": "reject", "_selected_action": [str(details.pk)]})
        details.refresh_from_db()
        assert details.status == "rejected"
        body = api_client.get(URL, **auth(pro_token)).json()
        assert body["review_note"] == "PAN photo is blurred."
