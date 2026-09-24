"""Pay every cashback whose return window has closed.

Runs on a schedule, like the other sweeps. Idempotent: each row moves to
PAID under its own lock before the money is written, so running it twice —
or running two of them — pays once.
"""

from django.core.management.base import BaseCommand

from apps.referrals import services


class Command(BaseCommand):
    help = "Credit referral cashback that has matured."

    def handle(self, *args, **options):
        paid = services.mature_due()
        self.stdout.write(f"matured {paid} cashback row(s)")
