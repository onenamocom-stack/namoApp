"""Re-derive the price catalogue and move every consultant service onto it.

    python manage.py reprice_bands

Run after `derive_band_price` changes. Idempotent: a second run changes
nothing. Bookings already made keep the price they were charged.
"""

from django.core.management.base import BaseCommand

from apps.consultants import services


class Command(BaseCommand):
    help = "Re-derive price bands and reprice every consultant service from them."

    def handle(self, *args, **options):
        created, refreshed = services.seed_price_bands()
        changed = services.reprice_services()
        self.stdout.write(
            f"bands created {created}, refreshed {refreshed}; services repriced {changed}"
        )
