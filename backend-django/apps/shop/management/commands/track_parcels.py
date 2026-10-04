"""The webhook's fallback: ask Shiprocket about every parcel still moving,
and finish dispatching any paid order that stopped half-way. Safe to run as
often as wanted; nothing here moves a parcel backwards or sends one twice.
"""

from django.core.management.base import BaseCommand

from apps.shop import delivery, shiprocket
from apps.shop.models import Shipment


class Command(BaseCommand):
    help = "Dispatch stalled paid parcels and refresh tracking for the rest."

    def handle(self, *args, **options):
        if not shiprocket.is_configured():
            self.stdout.write("shiprocket not configured")
            return
        dispatched = moved = failed = 0
        for shipment in Shipment.objects.filter(status=Shipment.Status.READY, awb=None):
            if delivery.dispatch(shipment.order_id) == "dispatched":
                dispatched += 1
        for shipment in Shipment.objects.filter(status=Shipment.Status.SHIPPED).exclude(awb=None):
            try:
                moved += int(delivery.refresh(shipment))
            except shiprocket.ShiprocketError:
                failed += 1
        self.stdout.write(f"dispatched={dispatched} moved={moved} failed={failed}")
