import logging

from django.core.management.base import BaseCommand

from apps.ai.services import sweep_sessions

logger = logging.getLogger("apps.ai.sweep")


class Command(BaseCommand):
    """Settle AI sessions whose held minutes have run out. Run every minute
    on the same schedule as the consultant sweeper — without it an
    abandoned tab leaves a session 'live' forever and the unused minutes
    never come back to the wallet."""

    def handle(self, *args, **options):
        result = sweep_sessions()
        self.stdout.write(f"settled={result['settled']}")
