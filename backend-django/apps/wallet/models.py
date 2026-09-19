"""Module 8 — wallet + payments (docs/07-DJANGO-MIGRATION.md §6 step 8): the
MONEY core. One model per table, 1:1 onto the existing Supabase schema, so
the initial migration is faked in at cutover (`migrate --fake-initial`) —
every constraint and index name below is the name Postgres already carries,
nothing here creates anything new on the real database. Owned here:

  wallets   003_wallets_ledger.sql
  ledger    003 (004 fixes refuse_mutation's search_path; 005 removes the
            client-settable ref_type from wallet_debit), append-only by
            003's refuse_mutation trigger, 013's
            ledger_one_refund_per_order partial unique index
  payments  006_payments.sql — one row per EVENT, not per payment

Trigger → model-guard mapping (003's refuse_mutation rules, now code):

  * `ledger` is append-only — the Ledger model refuses UPDATE/DELETE the
    same way EarningsLedger does (module 6's precedent), so the invariant
    is executable on SQLite, which has no prod triggers. A mistake is
    corrected by a reversing entry, never an edit (rule 2).
  * `wallets.balance_paise >= 0` — the wallets_never_negative check, kept
    as a model check constraint (the storage-layer backstop survives any
    service written later).
  * `ledger.delta_paise <> 0` — the ledger_delta_nonzero check.
  * `ref_type in ('order','payment','refund','adjustment')` — and the
    service layer adds 005's discipline: a client-facing debit writes
    ref_type='order' ALWAYS (005 removed the client-settable parameter
    because a self-tagged 'payment' row corrupts meaning and the
    reconciliation). Payments and refunds are written server-side only.
  * The after-insert trigger `apply_ledger_to_balance` (the balance is a
    cache and the cache follows the ledger) STAYS a prod trigger after the
    fake-in — Django's services insert ledger rows through raw SQL and, on
    SQLite only, carry the balance themselves (the gateway precedent);
    on Postgres they must NOT double-write what the trigger does.

Deliberately NOT owned here:
  profiles      — the profile module (9); bare UUIDField, no FK
  orders,
  order_items   — 012's order layer; module 6's gateway still writes them
                  inside the booking/chat transactions

Wallet creation stays on Supabase: prod's `handle_new_user` trigger makes
the wallet row the moment auth.users does, and auth does not migrate
(module 10). `services.ensure_wallet` exists for tests and fresh
databases only; nothing client-callable creates a wallet or credits one.
"""

import uuid

from django.db import IntegrityError, models
from django.utils import timezone


class RefType(models.TextChoices):
    """003's CHECK, named — what 005 made server-side only."""

    ORDER = "order", "Order"
    PAYMENT = "payment", "Payment"
    REFUND = "refund", "Refund"
    ADJUSTMENT = "adjustment", "Adjustment"


class Wallet(models.Model):
    """One row of `wallets` (003). `balance_paise` is a CACHE — the ledger
    is the truth and the ledger is right when the two disagree (rule 2,
    verbatim). The cache is maintained by prod's after-insert trigger on
    `ledger`, not by whoever writes the row; services emulate the trigger
    on SQLite only, so a hand-typed credit is correct by construction on
    both backends (003's recipe at the foot of the SQL file works
    unchanged at the psql prompt).

    The row is created by Supabase's `handle_new_user` trigger at signup
    (auth stays on Supabase); nothing in this API client-callable creates
    one. The primary key IS the profile id — a wallet belongs to exactly
    one profile and is looked up by it."""

    profile_id = models.UUIDField(primary_key=True, editable=False)
    balance_paise = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "wallets"
        constraints = [
            # 003's last line of defence, verbatim: "the one invariant that
            # must survive a mistake in any function written later".
            models.CheckConstraint(
                condition=models.Q(balance_paise__gte=0),
                name="wallets_never_negative",
            ),
        ]


class Ledger(models.Model):
    """One row of `ledger` (003) — an ENTRY in the append-only history of
    one wallet. `delta_paise` is signed: negative debits, positive
    credits. `kind` is what the user reads ('Tarot · Bhaktamar',
    'Added money', 'Refund · session'); each party's book names the OTHER
    party (013 fix 4 is a services rule: labels are built by the caller of
    insert_ledger with the counterparty's name).

    Append-only by trigger in prod (003's refuse_mutation, 004's
    search_path fix); the model refuses UPDATE/DELETE the same way
    EarningsLedger does, so the invariant is executable on SQLite. A
    mistake is corrected by writing a REVERSING ENTRY, never an edit —
    that is what the refusal message says."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    wallet = models.ForeignKey(
        Wallet,
        to_field="profile_id",
        db_column="wallet_id",
        on_delete=models.CASCADE,
        related_name="entries",
    )
    delta_paise = models.IntegerField()
    kind = models.TextField()
    ref_type = models.CharField(max_length=16, choices=RefType.choices)
    ref_id = models.UUIDField(null=True, blank=True)
    note = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "ledger"
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(delta_paise=0),
                name="ledger_delta_nonzero",
            ),
            models.CheckConstraint(
                condition=models.Q(ref_type__in=RefType.values),
                name="ledger_ref_type_check",
            ),
            # 013's reversal guard, carried home: one refund per order —
            # the insert IS the check (rule 6), a retry is a no-op, and
            # two concurrent reversals credit once.
            models.UniqueConstraint(
                fields=["ref_id"],
                condition=models.Q(ref_type=RefType.REFUND, ref_id__isnull=False),
                name="ledger_one_refund_per_order",
            ),
        ]
        indexes = [
            models.Index(
                fields=["wallet", "-created_at"],
                name="ledger_wallet_created_idx",
            ),
        ]

    def _refuse_mutation(self):
        raise IntegrityError(
            "ledger rows are append-only; write a reversing entry instead"
        )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            self._refuse_mutation()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        self._refuse_mutation()


class PaymentStatus(models.TextChoices):
    """006's CHECK, named."""

    CREATED = "created", "Created"
    CAPTURED = "captured", "Captured"
    FAILED = "failed", "Failed"
    REFUNDED = "refunded", "Refunded"


class Payment(models.Model):
    """One row of `payments` (006) — one row per EVENT, not per payment.
    The row written when checkout opens is status='created' and carries
    NEITHER provider id yet (both unique columns are nullable so that row
    can exist); it is the ONLY record tying a Razorpay order id to one of
    our profiles — the webhook reads it back to attribute a capture, never
    the payload's notes (those round-trip through the client).

    Idempotency is the two unique columns, not an application-level "have
    I seen this?" (rule 6): a retried delivery carries the same
    provider_payment_id, the insert violates the index, and the whole
    block — including the ledger credit that had already run inside it —
    rolls back together. There is no window between checking and crediting
    because there is no check."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile_id = models.UUIDField()  # profiles id; FK deferred to module 9
    provider = models.TextField(default="razorpay")
    provider_order_id = models.TextField(null=True, blank=True)
    provider_payment_id = models.TextField(null=True, blank=True, unique=True)
    provider_event_id = models.TextField(null=True, blank=True, unique=True)
    amount_paise = models.IntegerField()
    status = models.CharField(
        max_length=16, choices=PaymentStatus.choices, default=PaymentStatus.CREATED
    )
    raw = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Status = PaymentStatus

    class Meta:
        db_table = "payments"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=PaymentStatus.values),
                name="payments_status_check",
            ),
        ]
        indexes = [
            models.Index(
                fields=["profile_id", "-created_at"],
                name="payments_profile_created_idx",
            ),
            models.Index(fields=["provider_order_id"], name="payments_order_idx"),
        ]
