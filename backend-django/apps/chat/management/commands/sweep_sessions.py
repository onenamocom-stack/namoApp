import logging

from django.core.management.base import BaseCommand

from apps.chat.services import sweep_sessions

logger = logging.getLogger("apps.chat.sweep")


class Command(BaseCommand):
    """Settle expired and abandoned live sessions, expire unanswered chat
    requests. Run every minute on a scheduler (the pg_cron replacement for
    `select public.session_sweep()`); Celery replaces this wrapper, not the
    logic — apps.chat.services.sweep_sessions is the single implementation,
    and when Celery lands one @shared_task calls it (tasks/README)."""

    def handle(self, *args, **options):
        result = sweep_sessions()
        self.stdout.write(
            f"settled={result['settled']} expired_requests={result['expired_requests']}"
        )
