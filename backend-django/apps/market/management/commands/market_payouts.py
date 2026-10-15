"""Make last month's seller payouts (the 7th; docs/01 §4.7). Idempotent:
re-running skips a seller who already has the month's row. The console's
payout list runs the same thing when Finance opens it on or after the 7th."""

from django.core.management.base import BaseCommand

from apps.market import services


class Command(BaseCommand):
    help = "Make last month's Market seller payouts."

    def handle(self, *args, **options):
        made = services.run_payouts()
        self.stdout.write(f"{len(made)} payouts made")
