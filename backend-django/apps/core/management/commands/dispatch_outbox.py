import logging

from django.core.management.base import BaseCommand

from apps.core.services import dispatch_batch

logger = logging.getLogger("apps.core.outbox")


class Command(BaseCommand):
    help = "Dispatch due outbox events. Run on a scheduler; Celery replaces this wrapper, not the logic."

    def add_arguments(self, parser):
        parser.add_argument("--batch", type=int, default=100)

    def handle(self, *args, **options):
        dispatched, failed = dispatch_batch(limit=options["batch"])
        self.stdout.write(f"dispatched={dispatched} failed={failed}")
