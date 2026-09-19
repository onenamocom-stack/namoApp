"""Module 8 — wallet + payments (docs/07 §6 step 8): the pytest port of
backend/schema/003_wallets_ledger_check.sql and 006_payments_check.sql,
the two Razorpay edge functions' contract (order + webhook), and the
module's endpoint surface. THE MONEY CORE's checks: every assertion in
both check files is relative (they can run against any wallet, twice),
so these are too — each test funds its own wallet from zero and measures
deltas.

Matrix under test:
  003 check 1-8  -> TestLedgerInvariants (balance cache follows ledger;
                   affordable debit once, ref_type 'order' (005);
                   over-balance refused by the server with the exact
                   string and writing nothing; nonsense amounts refused;
                   append-only at the model layer (5's SQL trigger becomes
                   the ORM guard); the never-negative CHECK at the storage
                   layer; replay == balance; no client write path)
  013's index    -> one refund per order, the insert is the check
  006 check 1-4  -> TestWebhookCapture (capture credits exactly once;
                   redelivery credits nothing; a repeated EVENT id under a
                   different payment id is refused too; a failure leaves a
                   payments row and no ledger row; unattributable raises)
  edge functions -> TestTopupOrder*, TestWebhook* (MIN/MAX band with the
                   exact refusal sentence, order lifecycle, HMAC over the
                   raw body, bad signature 401, unhandled events 200,
                   verify-then-parse, amount-must-match-order)
  races          -> TestRaces (concurrent debits serialise on the lock;
                   double top-up confirm credits once; a refund racing a
                   reversal credits once)
  reconciliation -> TestReconcile (the HANDOFF story: a lone 'created'
                   row is abandoned-or-lost and only Razorpay knows;
                   read-only; exits non-zero naming the people owed)
"""

import hashlib
import hmac
import json
import threading
import uuid

import pytest
from django.core.management import call_command
from django.db import IntegrityError, connection

from apps.wallet import services
from apps.wallet.models import Ledger, Payment
from apps.wallet.razorpay import RazorpayError

from .conftest import OTHER_USER, TEST_USER, make_claims

SEEKER = TEST_USER
OTHER = OTHER_USER

WEBHOOK_SECRET = "whsec-test-secret"
KEY_ID = "rzp_test_123"
KEY_SECRET = "secret_456"


# ── helpers ──────────────────────────────────────────────────────────────────


def _wallet(pid, balance=0):
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise, created_at)"
            " values (%s, %s, %s)",
            [str(pid), balance, services._now()],
        )


def _fund(pid, amount):
    services.insert_ledger(pid, amount, "Added money", ref_type="adjustment")


def _balance(pid):
    return services.balance_of(pid)


def _ledger_rows(pid):
    with connection.cursor() as cursor:
        cursor.execute(
            "select delta_paise, kind, ref_type from ledger where"
            f" {services._xid('wallet_id', '%s')} order by created_at, id",
            [str(pid)],
        )
        return cursor.fetchall()


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    """The real HMAC Razorpay's header carries — recomputed here with the
    stdlib, independent of the module under test."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def _event(event, order_id, payment_id, amount_paise, event_id="evt_1"):
    return json.dumps(
        {
            "event": event,
            "payload": {
                "payment": {
                    "entity": {
                        "id": payment_id,
                        "order_id": order_id,
                        "amount": amount_paise,
                    }
                }
            },
        }
    ).encode("utf-8")


def _webhook(client, body: bytes, secret=WEBHOOK_SECRET, event_id="evt_1",
             extra_headers=None):
    headers = {
        "HTTP_X_RAZORPAY_SIGNATURE": _sign(body, secret),
        "HTTP_X_RAZORPAY_EVENT_ID": event_id,
        "content_type": "application/json",
    }
    headers.update(extra_headers or {})
    return client.post("/v1/wallet/webhook/razorpay/", data=body, **headers)


class StubOrderClient:
    """The Razorpay seam, stubbed — no network, ever, in money tests."""

    def __init__(self, order_id="order_TESTSTUB", fail=False):
        self.order_id = order_id
        self.fail = fail
        self.calls = []
        self.payments_payload = {"items": []}

    def create_order(self, amount_paise, notes):
        if self.fail:
            raise RazorpayError("order refused", status=400)
        self.calls.append({"amount_paise": amount_paise, "notes": notes})
        return {"id": self.order_id}

    def order_payments(self, order_id):
        return self.payments_payload


@pytest.fixture
def configured(settings, monkeypatch):
    settings.RAZORPAY_KEY_ID = KEY_ID
    settings.RAZORPAY_KEY_SECRET = KEY_SECRET
    settings.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET
    return settings


@pytest.fixture
def seeker_wallet():
    _wallet(SEEKER)
    return SEEKER


# ── 003_wallets_ledger_check.sql, ported ─────────────────────────────────────


@pytest.mark.django_db
class TestLedgerInvariants:
    def test_credit_reaches_balance(self, seeker_wallet):
        # Assertion 1: the cache follows the ledger, with no writer
        # maintaining it (the SQLite emulation IS the trigger's job).
        _fund(SEEKER, 124000)
        assert _balance(SEEKER) == 124000

    def test_affordable_debit_taken_once_as_order(self, seeker_wallet):
        # Assertion 2: a debit inside the balance is taken, once, and the
        # row it writes is an order — never anything else (005).
        _fund(SEEKER, 124000)
        result = services.debit(SEEKER, 4900, "Tarot · Bhaktamar")
        assert result == {"ok": True, "balance_paise": 119100}
        rows = [r for r in _ledger_rows(SEEKER) if r[1] == "Tarot · Bhaktamar"]
        assert len(rows) == 1
        delta, kind, ref_type = rows[0]
        assert (delta, kind, ref_type) == (-4900, "Tarot · Bhaktamar", "order")

    def test_overbalance_debit_refused_by_server_exactly(self, seeker_wallet):
        # Assertion 3: refused BY THE SERVER with the string the front end
        # has always shown, and writes nothing — not a row, not a paise.
        _fund(SEEKER, 50000)
        before_balance, before_rows = _balance(SEEKER), len(_ledger_rows(SEEKER))
        result = services.debit(SEEKER, 50001, "Report · Career")
        assert result["ok"] is False
        assert result["reason"] == "Not enough balance"
        assert result["balance_paise"] == 50000  # the locked truth, for the UI
        assert _balance(SEEKER) == before_balance
        assert len(_ledger_rows(SEEKER)) == before_rows

    def test_nonsense_amounts_refused_before_the_ledger(self, seeker_wallet):
        # Assertion 4: a negative debit is a credit wearing a disguise.
        assert services.debit(SEEKER, -1000, "Refund by another name") == {
            "ok": False,
            "reason": "That is not something we can charge for.",
        }
        assert services.debit(SEEKER, 0, "Nothing")["ok"] is False
        assert services.debit(SEEKER, 1000, "   ")["ok"] is False
        assert services.debit(SEEKER, None, "Nothing")["ok"] is False
        assert _ledger_rows(SEEKER) == []

    def test_ledger_rows_are_append_only(self, seeker_wallet):
        # Assertion 5: history cannot be edited — not by the client, not
        # by the owner. 003's refuse_mutation trigger becomes the model
        # guard (prod keeps the trigger; this is the ORM layer refusing).
        _fund(SEEKER, 1000)
        from django.db import connection as conn

        with conn.cursor() as cursor:
            cursor.execute("select id from ledger limit 1")
            row_id = cursor.fetchone()[0]
        # Raw rows store dashed UUIDs while the ORM queries dashless on
        # SQLite — fetch format-agnostically; the guard is what matters.
        row = next(r for r in Ledger.objects.all() if str(r.id) == row_id)
        row.delta_paise = 0
        with pytest.raises(IntegrityError, match="append-only"):
            row.save()
        with pytest.raises(IntegrityError, match="append-only"):
            row.delete()
        # Nothing moved.
        assert [r[0] for r in _ledger_rows(SEEKER)] == [1000]

    def test_wallet_cannot_go_negative_at_the_storage_layer(self, seeker_wallet):
        # Assertion 6: bypass the service's check with a raw overdraft —
        # the wallets_never_negative CHECK is the backstop under any
        # function written later. The whole append rolls back with it.
        _fund(SEEKER, 500)
        with pytest.raises(IntegrityError):
            services.insert_ledger(SEEKER, -999999, "Overdraft",
                                   ref_type="adjustment")
        assert _balance(SEEKER) == 500
        assert [r[0] for r in _ledger_rows(SEEKER)] == [500]

    def test_replay_reproduces_the_balance(self, seeker_wallet):
        # Assertion 7, the check worth having: apply the ledger from zero
        # and it reproduces the stored balance exactly.
        _fund(SEEKER, 124000)
        services.debit(SEEKER, 4900, "Tarot · Bhaktamar")
        _fund(SEEKER, 777)
        services.debit(SEEKER, 100, "Report · Career")
        replay = sum(r[0] for r in _ledger_rows(SEEKER))
        assert replay == _balance(SEEKER) == 119777

    def test_no_client_write_anywhere_near_either_table(self, api_client,
                                                        authed_client):
        # Assertion 8: wallets/ledger have no write policy for anybody.
        # Structural in Django — the only surface is the API, and it
        # exposes no write on either table: an authenticated caller gets
        # a 405 (no such endpoint), an anonymous one 401s at the gate
        # first. Either way nothing writes.
        for method in ("post", "put", "patch", "delete"):
            assert getattr(authed_client, method)(
                "/v1/wallet/ledger/", data={}, format="json"
            ).status_code == 405
            assert getattr(authed_client, method)(
                "/v1/wallet/", data={}, format="json"
            ).status_code == 405
            assert getattr(api_client, method)(
                "/v1/wallet/ledger/", data={}, format="json"
            ).status_code in (401, 405)

    def test_refund_index_allows_exactly_one_per_order(self, seeker_wallet):
        # 013's reversal guard, carried home: the insert IS the check —
        # a second refund for the same order is caught, not checked for.
        _fund(SEEKER, 5000)
        order_id = uuid.uuid4()
        services.insert_ledger(SEEKER, -5000, "Atharv · 20 min",
                               ref_type="order", ref_id=order_id)
        services.insert_ledger(SEEKER, 5000, "Refund · session",
                               ref_type="refund", ref_id=order_id)
        with pytest.raises(IntegrityError):
            services.insert_ledger(SEEKER, 5000, "Refund · session",
                                   ref_type="refund", ref_id=order_id)
        # funded 5000, held 5000, refunded 5000 — once, never twice.
        assert [r[0] for r in _ledger_rows(SEEKER)] == [5000, -5000, 5000]
        assert _balance(SEEKER) == 5000

    def test_service_rejects_unknown_ref_type(self, seeker_wallet):
        # 005's meaning-corruption class, closed at the service rail: a
        # ledger row tagged 'cashback' (or anything outside 003's CHECK)
        # never reaches the table.
        with pytest.raises(ValueError):
            services.insert_ledger(SEEKER, 1000, "Cashback",
                                   ref_type="cashback")


# ── the spend endpoint: wallet_debit over REST ───────────────────────────────


@pytest.mark.django_db
class TestSpendEndpoint:
    def test_spend_debits_and_reports_the_new_balance(self, authed_client,
                                                      seeker_wallet):
        _fund(SEEKER, 10000)
        response = authed_client.post(
            "/v1/wallet/spend/",
            {"amount_paise": 4900, "kind": "Tarot · Bhaktamar"},
            format="json",
        )
        assert response.status_code == 200
        # The body is wallet_debit's jsonb itself, byte for byte.
        assert response.json() == {"ok": True, "balance_paise": 5100}
        assert _balance(SEEKER) == 5100

    def test_spend_refusal_carries_the_exact_sentence_and_balance(
        self, authed_client, seeker_wallet
    ):
        _fund(SEEKER, 1000)
        response = authed_client.post(
            "/v1/wallet/spend/", {"amount_paise": 2000, "kind": "Report"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json() == {
            "ok": False,
            "reason": "Not enough balance",
            "balance_paise": 1000,
        }
        # The refusal wrote nothing.
        assert _balance(SEEKER) == 1000
        assert len(_ledger_rows(SEEKER)) == 1  # only the funding row

    def test_spend_requires_auth(self, api_client, seeker_wallet):
        response = api_client.post(
            "/v1/wallet/spend/", {"amount_paise": 100, "kind": "x"},
            format="json",
        )
        assert response.status_code == 401

    def test_spend_without_a_wallet(self, authed_client):
        response = authed_client.post(
            "/v1/wallet/spend/", {"amount_paise": 100, "kind": "x"},
            format="json",
        )
        assert response.json() == {"ok": False, "reason": "No wallet on this account."}


# ── balance + ledger reads ───────────────────────────────────────────────────


@pytest.mark.django_db
class TestBalanceAndLedgerEndpoints:
    def test_balance_is_the_callers_own_row(self, authed_client, seeker_wallet):
        _fund(SEEKER, 4242)
        response = authed_client.get("/v1/wallet/")
        assert response.status_code == 200
        assert response.json() == {
            "profile_id": str(SEEKER),
            "balance_paise": 4242,
            "wallet_exists": True,
        }

    def test_no_wallet_reads_zero_but_not_existing(self, authed_client):
        response = authed_client.get("/v1/wallet/")
        assert response.json() == {
            "profile_id": str(SEEKER),
            "balance_paise": 0,
            "wallet_exists": False,
        }

    def test_balance_requires_auth(self, api_client, seeker_wallet):
        assert api_client.get("/v1/wallet/").status_code == 401

    def test_ledger_is_newest_first_in_postgrest_shapes(self, authed_client,
                                                        seeker_wallet):
        for n in range(3):
            _fund(SEEKER, 100 * (n + 1))
        response = authed_client.get("/v1/wallet/ledger/")
        assert response.status_code == 200
        rows = response.json()
        assert [r["delta_paise"] for r in rows] == [300, 200, 100]
        row = rows[0]
        for key in ("id", "delta_paise", "kind", "ref_type", "ref_id",
                    "note", "created_at", "wallet_id"):
            assert key in row  # raw snake_case, the shape PostgREST returned

    def test_ledger_keyset_pages_without_gaps_or_duplicates(
        self, authed_client, seeker_wallet
    ):
        for _ in range(55):
            _fund(SEEKER, 100)
        page1 = authed_client.get("/v1/wallet/ledger/?limit=50").json()
        assert len(page1) == 50
        anchor = page1[-1]["id"]
        page2 = authed_client.get(
            f"/v1/wallet/ledger/?limit=50&after={anchor}"
        ).json()
        assert len(page2) == 5
        ids1 = {r["id"] for r in page1}
        assert all(r["id"] not in ids1 for r in page2)
        # An unknown anchor returns from the start rather than guessing.
        again = authed_client.get(
            f"/v1/wallet/ledger/?after={uuid.uuid4()}"
        ).json()
        assert len(again) == 50

    def test_ledger_is_scoped_to_the_caller(self, authed_client, seeker_wallet,
                                            sign_hs256, hs256_mode):
        _fund(SEEKER, 1000)
        other_client_auth = {
            "HTTP_AUTHORIZATION": f"Bearer {sign_hs256(claims=make_claims(sub=OTHER))}"
        }
        from rest_framework.test import APIClient

        client = APIClient()
        client.credentials(**other_client_auth)
        _wallet(OTHER)
        assert client.get("/v1/wallet/ledger/").json() == []


# ── razorpay-order parity ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestTopupOrderService:
    def test_band_edges_enforced_with_the_exact_sentence(self, seeker_wallet,
                                                         configured):
        stub = StubOrderClient()
        for amount in (MIN_M1 := services.MIN_PAISE - 1,
                       services.MAX_PAISE + 1):
            with pytest.raises(services.Refusal) as exc:
                services.create_topup_order(SEEKER, amount, client=stub)
            assert exc.value.status == 400
            assert exc.value.reason == "Add between ₹100 and ₹1,00,000."
        # The band itself is inclusive, both ends.
        for amount in (services.MIN_PAISE, services.MAX_PAISE):
            result = services.create_topup_order(SEEKER, amount, client=stub)
            assert result["amount_paise"] == amount
        assert len(stub.calls) == 2  # the two refusals never reached Razorpay
        assert [c["amount_paise"] for c in stub.calls] == [
            services.MIN_PAISE, services.MAX_PAISE,
        ]

    def test_float_amounts_refused(self, seeker_wallet, configured):
        with pytest.raises(services.Refusal) as exc:
            services.create_topup_order(SEEKER, 10000.5,
                                        client=StubOrderClient())
        assert exc.value.reason == "Add between ₹100 and ₹1,00,000."

    def test_not_configured_names_nothing_to_the_client(self, seeker_wallet,
                                                        settings):
        settings.RAZORPAY_KEY_ID = ""
        settings.RAZORPAY_KEY_SECRET = ""
        with pytest.raises(services.Refusal) as exc:
            services.create_topup_order(SEEKER, services.MIN_PAISE,
                                        client=StubOrderClient())
        assert exc.value.status == 500
        assert exc.value.reason == "Payments are not configured yet."

    def test_provider_failure_is_a_502(self, seeker_wallet, configured):
        with pytest.raises(services.Refusal) as exc:
            services.create_topup_order(
                SEEKER, services.MIN_PAISE,
                client=StubOrderClient(fail=True),
            )
        assert exc.value.status == 502
        assert exc.value.reason == "Could not reach the payment provider. Try again."
        # Nothing recorded: an unattributable order must never exist.
        assert Payment.objects.count() == 0

    def test_record_failure_stops_checkout_before_it_opens(
        self, seeker_wallet, configured, monkeypatch
    ):
        def boom(**kwargs):
            raise RuntimeError("database gone")

        monkeypatch.setattr(
            "apps.wallet.services.Payment.objects.create", boom
        )
        with pytest.raises(services.Refusal) as exc:
            services.create_topup_order(SEEKER, services.MIN_PAISE,
                                        client=StubOrderClient())
        assert exc.value.status == 500
        assert exc.value.reason == "Could not start that payment. Try again."

    def test_success_writes_the_created_row(self, seeker_wallet, configured):
        stub = StubOrderClient(order_id="order_TEST123")
        result = services.create_topup_order(SEEKER, 25000, client=stub)
        assert result == {
            "ok": True,
            "order_id": "order_TEST123",
            "amount_paise": 25000,
            "key_id": KEY_ID,
        }
        # The notes carry the profile id for a person reconciling in the
        # Razorpay dashboard — and are never the attribution path.
        assert stub.calls[0]["notes"] == {"profile_id": str(SEEKER)}
        row = Payment.objects.get(provider_order_id="order_TEST123")
        assert row.status == "created"
        assert row.amount_paise == 25000
        assert row.provider_payment_id is None and row.provider_event_id is None


@pytest.mark.django_db
class TestTopupOrderEndpoint:
    @pytest.fixture(autouse=True)
    def stub_client(self, monkeypatch):
        monkeypatch.setattr(
            "apps.wallet.services.RazorpayClient",
            lambda *args, **kwargs: StubOrderClient(),
        )

    def test_order_create_returns_checkout_fields(self, authed_client,
                                                  seeker_wallet, configured):
        response = authed_client.post(
            "/v1/wallet/topup/order/", {"amount_paise": 25000}, format="json"
        )
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["amount_paise"] == 25000
        assert body["key_id"] == KEY_ID
        assert body["order_id"].startswith("order_")

    def test_band_refusal_body_matches_the_edge_function(self, authed_client,
                                                         seeker_wallet,
                                                         configured):
        response = authed_client.post(
            "/v1/wallet/topup/order/", {"amount_paise": 500}, format="json"
        )
        assert response.status_code == 400
        assert response.json() == {
            "ok": False,
            "reason": "Add between ₹100 and ₹1,00,000.",
        }

    def test_order_create_requires_auth(self, api_client, seeker_wallet,
                                        configured):
        response = api_client.post(
            "/v1/wallet/topup/order/", {"amount_paise": 25000}, format="json"
        )
        assert response.status_code == 401


@pytest.mark.django_db
class TestTopupStatus:
    @pytest.fixture(autouse=True)
    def stub_client(self, monkeypatch):
        monkeypatch.setattr(
            "apps.wallet.services.RazorpayClient",
            lambda *args, **kwargs: StubOrderClient(),
        )

    def test_capture_is_visible_to_the_owner(self, client, authed_client,
                                             seeker_wallet, configured):
        services.create_topup_order(SEEKER, 12300, client=StubOrderClient())
        body = _event("payment.captured", "order_TESTSTUB", "pay_1", 12300)
        response = _webhook(client, body)
        assert response.status_code == 200
        status = authed_client.get("/v1/wallet/topup/order_TESTSTUB/")
        assert status.status_code == 200
        assert status.json()["status"] == "captured"
        assert status.json()["amount_paise"] == 12300

    def test_pending_topup_is_a_404_so_ids_do_not_leak(self, authed_client,
                                                       seeker_wallet,
                                                       configured):
        services.create_topup_order(SEEKER, 12300, client=StubOrderClient())
        response = authed_client.get("/v1/wallet/topup/order_TESTSTUB/")
        assert response.status_code == 404

    def test_someone_elses_order_is_a_404(self, client, authed_client,
                                          seeker_wallet, configured,
                                          sign_hs256, hs256_mode):
        services.create_topup_order(SEEKER, 12300, client=StubOrderClient())
        body = _event("payment.captured", "order_TESTSTUB", "pay_1", 12300)
        _webhook(client, body)
        from rest_framework.test import APIClient

        other = APIClient()
        other.credentials(HTTP_AUTHORIZATION=f"Bearer {sign_hs256(claims=make_claims(sub=OTHER))}")
        _wallet(OTHER)
        assert other.get("/v1/wallet/topup/order_TESTSTUB/").status_code == 404


# ── the webhook: signature vectors + 006_payments_check.sql, ported ──────────


@pytest.mark.django_db
class TestWebhookSignature:
    def test_hmac_vectors_recomputed_independently(self):
        body = (
            b'{"event":"payment.captured","payload":{"payment":{"entity":'
            b'{"id":"pay_1","order_id":"order_1","amount":12300}}}}'
        )
        digest = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        assert len(digest) == 64
        assert services.signature_hex(WEBHOOK_SECRET, body) == digest
        assert services.signatures_match(digest, digest)
        # One byte wrong anywhere -> no match, whatever the prefix.
        assert not services.signatures_match(digest[:-1] + "0", digest)
        assert not services.signatures_match("", digest)
        assert not services.signatures_match(digest, "")

    def test_bad_signature_rejected_without_parsing(self, client,
                                                    seeker_wallet, configured):
        services.create_topup_order(SEEKER, 12300, client=StubOrderClient())
        body = _event("payment.captured", "order_TESTSTUB", "pay_1", 12300)
        response = _webhook(client, body, secret="whsec-WRONG-secret")
        assert response.status_code == 401
        assert response.content.decode() == "Bad signature."
        # Nothing was read, nothing was written.
        assert Payment.objects.filter(status="captured").count() == 0
        assert _balance(SEEKER) == 0

    def test_missing_secret_answers_not_configured(self, client, settings):
        settings.RAZORPAY_WEBHOOK_SECRET = ""
        body = _event("payment.captured", "order_x", "pay_1", 100)
        response = _webhook(client, body)
        assert response.status_code == 500
        assert response.content.decode() == "Not configured."

    def test_signed_garbage_is_a_400(self, client, configured):
        body = b"this is not json"
        response = _webhook(client, body)
        assert response.status_code == 400
        assert response.content.decode() == "Bad payload."

    def test_unhandled_events_are_ignored_with_200(self, client, configured):
        body = json.dumps(
            {"event": "payment.authorized", "payload": {"payment": {"entity": {}}}}
        ).encode()
        response = _webhook(client, body)
        assert response.status_code == 200
        assert response.content.decode() == "Ignored."

    def test_payment_entity_required(self, client, configured):
        body = json.dumps(
            {"event": "payment.captured", "payload": {"payment": {"entity": {}}}}
        ).encode()
        response = _webhook(client, body)
        assert response.status_code == 400

    def test_get_is_a_405(self, client, configured):
        assert client.get("/v1/wallet/webhook/razorpay/").status_code == 405

    def test_no_auth_token_needed_the_signature_is_the_credential(
        self, client, seeker_wallet, configured
    ):
        # verify_jwt = false on the edge function, for the same reason:
        # Razorpay is not a signed-in user.
        services.create_topup_order(SEEKER, 12300, client=StubOrderClient())
        body = _event("payment.captured", "order_TESTSTUB", "pay_1", 12300)
        response = _webhook(client, body)
        assert response.status_code == 200
        assert response.json()["ok"] is True


@pytest.mark.django_db
class TestWebhookCapture:
    """006_payments_check.sql, assertions 1-4, against the real view —
    every delivery signed, the balance measured relative to zero."""

    def _order(self, seeker_wallet, amount=12300, order_id="order_TESTSTUB"):
        services.create_topup_order(
            SEEKER, amount, client=StubOrderClient(order_id=order_id)
        )

    def test_capture_credits_exactly_once(self, client, seeker_wallet,
                                          configured):
        # Assertion 1.
        self._order(seeker_wallet)
        body = _event("payment.captured", "order_TESTSTUB", "pay_1", 12300)
        response = _webhook(client, body)
        assert response.status_code == 200
        assert response.json()["ok"] is True
        assert response.json()["duplicate"] is False
        assert response.json()["profile_id"] == str(SEEKER)
        credits = [r for r in _ledger_rows(SEEKER) if r[2] == "payment"]
        assert len(credits) == 1
        assert credits[0][0] == 12300 and credits[0][1] == "Added money"
        assert _balance(SEEKER) == 12300

    def test_redelivery_credits_nothing(self, client, seeker_wallet,
                                        configured):
        # Assertion 2, the ordinary case: Razorpay retries until a 2xx.
        self._order(seeker_wallet)
        first = _webhook(client, _event("payment.captured", "order_TESTSTUB",
                                        "pay_1", 12300, "evt_1"))
        assert first.json()["duplicate"] is False
        second = _webhook(client, _event("payment.captured", "order_TESTSTUB",
                                         "pay_1", 12300, "evt_2"))
        assert second.status_code == 200
        assert second.json() == {"ok": True, "duplicate": True}
        credits = [r for r in _ledger_rows(SEEKER) if r[2] == "payment"]
        assert len(credits) == 1
        assert _balance(SEEKER) == 12300

    def test_repeated_event_id_under_a_different_payment_is_refused(
        self, client, seeker_wallet, configured
    ):
        # The second unique index doing its job (006's own line).
        self._order(seeker_wallet)
        assert _webhook(client, _event("payment.captured", "order_TESTSTUB",
                                       "pay_1", 12300, "evt_1")).json()["ok"]
        replay = _webhook(client, _event("payment.captured", "order_TESTSTUB",
                                         "pay_2", 12300, "evt_1"))
        assert replay.json()["duplicate"] is True
        assert len([r for r in _ledger_rows(SEEKER) if r[2] == "payment"]) == 1

    def test_failed_payment_records_a_row_and_no_credit(self, client,
                                                        seeker_wallet,
                                                        configured):
        # Assertion 3: a failure leaves a payments row and no ledger row.
        self._order(seeker_wallet, amount=10000, order_id="order_FAIL")
        response = _webhook(
            client, _event("payment.failed", "order_FAIL", "pay_9", 10000, "evt_3")
        )
        assert response.status_code == 200
        row = Payment.objects.get(provider_payment_id="pay_9")
        assert row.status == "failed"
        assert len(_ledger_rows(SEEKER)) == 0  # only the created row in payments
        assert _balance(SEEKER) == 0

    def test_unattributable_payment_raises_and_is_retried(self, client,
                                                          seeker_wallet,
                                                          configured):
        # Assertion 4: a payment matching no order is refused, not guessed
        # — 500, so Razorpay retries the loud half of the mistake.
        body = _event("payment.captured", "order_that_never_existed",
                      "pay_orphan", 100)
        response = _webhook(client, body)
        assert response.status_code == 500
        assert response.content.decode() == "Could not record that payment."
        assert Payment.objects.filter(provider_order_id="order_that_never_existed").count() == 0
        assert len(_ledger_rows(SEEKER)) == 0

    def test_amount_mismatch_refused_without_credit(self, client,
                                                    seeker_wallet,
                                                    configured):
        # amount-must-match-order (documented hardening over 006): the
        # capture must equal the order it attributes through — crediting
        # either number silently is the quiet half of the mistake.
        self._order(seeker_wallet, amount=12300)
        body = _event("payment.captured", "order_TESTSTUB", "pay_1", 9900)
        response = _webhook(client, body)
        assert response.status_code == 500
        assert _balance(SEEKER) == 0
        assert len(_ledger_rows(SEEKER)) == 0
        # No terminal row either: the event did not happen as far as this
        # system is concerned, and reconciliation names the order.
        assert Payment.objects.filter(provider_payment_id="pay_1").count() == 0

    def test_capture_uses_razorpays_amount_not_the_browsers(self, client,
                                                            seeker_wallet,
                                                            configured):
        # Rule 3's money half: what is credited is what Razorpay reports,
        # from the signature-verified payload. The order row amount is the
        # guard rail, the payload is the source — they agree here.
        self._order(seeker_wallet, amount=10000)
        body = _event("payment.captured", "order_TESTSTUB", "pay_1", 10000)
        assert _webhook(client, body).status_code == 200
        assert _balance(SEEKER) == 10000


@pytest.mark.django_db
class TestPaymentCaptureService:
    def test_only_captured_and_failed_exist(self, seeker_wallet, configured):
        services.create_topup_order(SEEKER, 10000, client=StubOrderClient())
        with pytest.raises(services.CaptureFailed, match="not authorized"):
            services.payment_capture("evt", "order_TESTSTUB", "pay_1", 1000,
                                     "authorized", {})

    def test_non_positive_amount_raises(self, seeker_wallet, configured):
        services.create_topup_order(SEEKER, 10000, client=StubOrderClient())
        with pytest.raises(services.CaptureFailed, match="no positive amount"):
            services.payment_capture("evt", "order_TESTSTUB", "pay_1", 0,
                                     "captured", {})


# ── real-thread races ────────────────────────────────────────────────────────


@pytest.mark.django_db(transaction=True)
class TestRaces:
    def _fire(self, barrier, target, *args, **kwargs):
        from django.db import connection

        connection.close()
        barrier.wait(timeout=10)
        try:
            return target(*args, **kwargs)
        finally:
            connection.close()

    def test_concurrent_debits_serialise_on_the_lock(self, seeker_wallet):
        # Four debits of 4000 against a 10000 wallet: the row lock means
        # exactly two pass and the wallet cannot go negative.
        _fund(SEEKER, 10000)
        barrier = threading.Barrier(4)
        results, threads = [], []

        def fire():
            results.append(self._fire(barrier, services.debit,
                                      SEEKER, 4000, "Report"))

        threads = [threading.Thread(target=fire) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert sorted(r["ok"] for r in results) == [False, False, True, True]
        assert sum(1 for r in results if r.get("reason") == "Not enough balance") == 2
        assert _balance(SEEKER) == 2000
        # Four attempts, exactly two rows; replay still equals balance.
        assert len(_ledger_rows(SEEKER)) == 3  # funding + two debits
        assert sum(r[0] for r in _ledger_rows(SEEKER)) == _balance(SEEKER)

    def test_double_top_up_confirm_credits_once(self, seeker_wallet,
                                                configured):
        # The same capture delivered twice at the SAME INSTANT: the unique
        # index catches the loser and the whole block rolls back with the
        # credit inside it. No window between checking and crediting —
        # there is no check.
        services.create_topup_order(SEEKER, 10000, client=StubOrderClient())
        barrier = threading.Barrier(2)
        results = []

        def fire(event_id):
            results.append(
                self._fire(barrier, services.payment_capture,
                           event_id, "order_TESTSTUB", "pay_1", 10000,
                           "captured", {})
            )

        threads = [
            threading.Thread(target=fire, args=("evt_A",)),
            threading.Thread(target=fire, args=("evt_B",)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert sorted(r["ok"] for r in results) == [True, True]
        assert sorted(r["duplicate"] for r in results) == [False, True]
        credits = [r for r in _ledger_rows(SEEKER) if r[2] == "payment"]
        assert len(credits) == 1
        assert credits[0][0] == 10000
        assert _balance(SEEKER) == 10000

    def test_refund_racing_reversal_credits_once(self, seeker_wallet):
        # Two reversals of one order at once (the pressed-Decline against
        # an admin's reversal): 013's index catches the loser, and the
        # balance carries exactly one refund.
        order_id = uuid.uuid4()
        _fund(SEEKER, 10000)
        services.insert_ledger(SEEKER, -8000, "Atharv · 20 min",
                               ref_type="order", ref_id=order_id)
        barrier = threading.Barrier(2)
        errors = []

        def fire():
            try:
                self._fire(barrier, services.insert_ledger,
                           SEEKER, 8000, "Refund · session",
                           ref_type="refund", ref_id=order_id)
            except IntegrityError:
                errors.append("caught")

        threads = [threading.Thread(target=fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert errors == ["caught"]  # exactly one loser, caught not checked
        refunds = [r for r in _ledger_rows(SEEKER) if r[2] == "refund"]
        assert len(refunds) == 1
        assert _balance(SEEKER) == 10000  # funded, held, refunded once


# ── the reconciliation sweep (backend/tools/reconcile-payments.mjs) ──────────


@pytest.mark.django_db
class TestReconcile:
    def _created(self, order_id, amount=5000, pid=SEEKER):
        Payment.objects.create(
            profile_id=pid, provider_order_id=order_id, amount_paise=amount,
            status="created",
        )

    def test_lone_created_rows_are_unresolved(self, seeker_wallet):
        self._created("order_A")
        self._created("order_B")
        # An order with a terminal sibling is resolved — the created row
        # is its history, not a debt.
        self._created("order_C")
        Payment.objects.create(
            profile_id=SEEKER, provider_order_id="order_C",
            provider_payment_id="pay_C", amount_paise=5000, status="captured",
        )
        assert services.find_unresolved_orders() == ["order_A", "order_B"]

    def test_classifies_owed_failed_abandoned_and_unknown(self, seeker_wallet):
        self._created("order_OWED")
        self._created("order_FAILED")
        self._created("order_GONE")
        self._created("order_UNKNOWN")
        stub = StubOrderClient()
        stub.payments_payload = {
            "items": [
                {"id": "pay_o1", "status": "captured", "amount": 5000},
                {"id": "pay_o2", "status": "authorized", "amount": 5000},
            ]
        }
        by_order = {
            "order_OWED": {"items": [
                {"id": "pay_o1", "status": "captured", "amount": 5000},
                {"id": "pay_o2", "status": "authorized", "amount": 5000},
            ]},
            "order_FAILED": {"items": [
                {"id": "pay_f1", "status": "failed", "amount": 5000,
                 "error_description": "Card declined"},
            ]},
            "order_GONE": {"items": []},
        }

        def order_payments(order_id):
            if order_id == "order_UNKNOWN":
                raise RazorpayError("lookup refused", status=500)
            return by_order[order_id]

        stub.order_payments = order_payments
        report = services.reconcile(client=stub)
        assert report["orders"] == 4
        assert [o["order_id"] for o in report["owed"]] == ["order_OWED"]
        assert [p["id"] for p in report["owed"][0]["payments"]] == ["pay_o1", "pay_o2"]
        assert report["failed"][0]["attempts"] == 1
        assert report["failed"][0]["reason"] == "Card declined"
        assert report["abandoned"] == ["order_GONE"]
        assert report["unknown"] == ["order_UNKNOWN"]
        # READ ONLY: the sweep moved nothing — no credit landed anywhere.
        assert _balance(SEEKER) == 0
        assert Payment.objects.filter(status="captured").count() == 0

    def test_command_exits_nonzero_and_names_the_owed(self, seeker_wallet,
                                                      configured, capsys,
                                                      monkeypatch):
        self._created("order_OWED", amount=7000)
        stub = StubOrderClient()
        stub.payments_payload = {
            "items": [{"id": "pay_o1", "status": "captured", "amount": 7000}]
        }
        monkeypatch.setattr(
            "apps.wallet.management.commands.reconcile_payments.reconcile",
            lambda: services.reconcile(client=stub),
        )
        with pytest.raises(SystemExit) as exc:
            call_command("reconcile_payments")
        assert exc.value.code == 1
        out = capsys.readouterr().out
        assert "order_OWED" in out and "pay_o1" in out and "NOT CREDITED" in out

    def test_command_exits_zero_when_nothing_is_owed(self, seeker_wallet,
                                                     configured, capsys,
                                                     monkeypatch):
        self._created("order_GONE")
        stub = StubOrderClient()  # empty items: abandoned checkout
        monkeypatch.setattr(
            "apps.wallet.management.commands.reconcile_payments.reconcile",
            lambda: services.reconcile(client=stub),
        )
        call_command("reconcile_payments")
        assert "Nothing owed" in capsys.readouterr().out
