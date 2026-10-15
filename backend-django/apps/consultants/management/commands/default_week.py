"""Put every consultant on the default week (16 Oct 2026, Rahul): 11 am to
2 pm and 4 pm to 9 pm, every day — replacing what they had.

    python manage.py default_week            # dry run: counts only
    python manage.py default_week --yes      # writes

Production data: run only with the owner's yes. Bookings already made are
untouched.
"""

from django.core.management.base import BaseCommand

from apps.consultants import services
from apps.consultants.models import Consultant


class Command(BaseCommand):
    help = "Replace every consultant's week with the default (11-2 and 4-9, every day)."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Write. Without it, a dry run.")

    def handle(self, *args, yes=False, **options):
        ids = list(Consultant.objects.values_list("profile_id", flat=True))
        if not yes:
            self.stdout.write(f"dry run: {len(ids)} consultants would get the default week")
            return
        for pid in ids:
            services.set_week(pid, services.default_week())
        self.stdout.write(f"{len(ids)} consultants on the default week")
