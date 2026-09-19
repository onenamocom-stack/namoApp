import logging

from django.core.management.base import BaseCommand

from apps.wallet.services import reconcile

logger = logging.getLogger("apps.wallet.reconcile")


class Command(BaseCommand):
    """Ask Razorpay what actually happened to every payment we never
    resolved. READ ONLY — it credits nothing: a script that mints undoes
    the reason the webhook is the only credit path. Run after re-saving a
    webhook secret, after any Razorpay config change, and before
    believing the first live payment worked; on a schedule later
    (Celery wraps apps.wallet.services.reconcile, never reimplements it —
    tasks/README). Exits non-zero and names the people owed."""

    def handle(self, *args, **options):
        report = reconcile()
        self.stdout.write(
            f"{report['orders']} unresolved order(s): "
            f"{len(report['owed'])} owed, {len(report['failed'])} failed at"
            f" Razorpay, {len(report['abandoned'])} abandoned,"
            f" {len(report['unknown'])} unknown"
        )
        for order_id in report["abandoned"]:
            self.stdout.write(f"  ok  {order_id}  no payment attempts — checkout abandoned")
        for row in report["failed"]:
            self.stdout.write(
                f"  ok  {row['order_id']}  {row['attempts']} attempt(s),"
                f" all failed — {row['reason']}"
            )
        for order_id in report["unknown"]:
            self.stdout.write(f"  ?   {order_id}  Razorpay could not say — check by hand")
        for row in report["owed"]:
            for payment in row["payments"]:
                self.stdout.write(
                    f"  !!  {row['order_id']}  {payment['id']} {payment['status']}"
                    f" {payment['amount_paise']} paise  NOT CREDITED"
                )
        if not report["owed"]:
            self.stdout.write(
                "\nNothing owed. Every unresolved order was abandoned or failed"
                " at Razorpay."
            )
            return
        total = sum(
            payment["amount_paise"] or 0
            for row in report["owed"]
            for payment in row["payments"]
        )
        self.stdout.write(
            self.style.ERROR(
                f"\n{len(report['owed'])} PAYMENT(S) TAKEN AND NOT CREDITED —"
                f" {total} paise"
            )
        )
        self.stdout.write(
            "\nThese people paid and received nothing. This command will not"
            " credit them: only a signature-verified webhook moves money."
            "\n\nTwo things, in order:"
            "\n  1. Find out WHY the webhook did not land — a wrong or rotated"
            " secret, a deleted webhook, or an unsubscribed event. Fix that"
            " first, or the next one is lost too."
            "\n  2. Credit each person by hand with the ledger-insert recipe"
            " at the foot of backend/schema/003_wallets_ledger.sql, noting"
            " the payment id in the note."
        )
        raise SystemExit(1)
