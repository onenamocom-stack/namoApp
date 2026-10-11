import json

from django.core.management.base import BaseCommand

from apps.content import drive_reels


class Command(BaseCommand):
    help = ("Post a reel from the Google Drive folder if today's plan says one is due "
            "(apps/content/drive_reels.py). --list shows the queue and today's times; "
            "--now posts the next one whatever the time.")

    def add_arguments(self, parser):
        parser.add_argument("--list", action="store_true")
        parser.add_argument("--now", action="store_true")

    def handle(self, *args, **opts):
        if opts["list"]:
            from django.utils import timezone

            today = timezone.now().astimezone(drive_reels.IST).date()
            self.stdout.write("today: " + ", ".join(t.strftime("%H:%M") for t in drive_reels.plan_for(today)))
            pending = drive_reels.queue()
            self.stdout.write(f"{len(pending)} videos to post; {len(drive_reels.already_up())} ids already on the app")
            from collections import Counter

            for folder, n in Counter(folder for folder, _ in pending).items():
                self.stdout.write(f"  {folder}: {n}")
            for folder, f in pending[:15]:
                self.stdout.write(f"  {folder} / {f['name']} ({int(f.get('size') or 0) // 1024 // 1024} MB)")
            return
        result = drive_reels.post_one() if opts["now"] else drive_reels.tick()
        self.stdout.write(json.dumps(result, default=str))
