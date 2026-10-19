"""Every `user-NNNN` nobody chose, renamed from the person's name
(19 Oct 2026, Rahul: "sabka badal do"). The same rule as a name being
saved (`services.rename_placeholder_username`): a username the person
picked, or a name with no Latin letters, is left alone.

    python manage.py rename_placeholder_usernames            # counts only
    python manage.py rename_placeholder_usernames --write    # renames
"""

from django.core.management.base import BaseCommand

from apps.profiles import services
from apps.profiles.models import Profile


class Command(BaseCommand):
    help = "Rename automatic user-NNNN usernames to name-surname-NNNN."

    def add_arguments(self, parser):
        parser.add_argument("--write", action="store_true", help="Rename; without it, only count.")

    def handle(self, *args, write=False, **options):
        rows = Profile.objects.filter(username__regex=r"^user-[0-9]+$", username_changed_at__isnull=True)
        renamed = kept = 0
        for profile in rows.iterator():
            if services.suggest_username(profile.name).startswith("user-"):
                kept += 1
                continue
            if write:
                services.rename_placeholder_username(profile)
            renamed += 1
        verb = "renamed" if write else "would rename"
        self.stdout.write(f"{verb} {renamed}; kept {kept} (no Latin name)")
