import logging

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.ai.models import Message

logger = logging.getLogger("apps.ai.flush")

RETAIN_DAYS = 30


class Command(BaseCommand):
    """Delete AI messages older than thirty days.

    The retention the product chose (21 Sep 2026). It is a privacy answer
    before it is a storage one: these transcripts are the most personal
    text in the product — people ask an astrologer about their marriage and
    their health — and the cheapest way not to hold them is not to hold
    them. Storage is the lesser reason and would not justify the job alone.
    """

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=RETAIN_DAYS)

    def handle(self, *args, **options):
        cutoff = timezone.now() - timezone.timedelta(days=options["days"])
        deleted, _ = Message.objects.filter(created_at__lt=cutoff).delete()
        self.stdout.write(f"deleted={deleted} older_than={options['days']}d")
