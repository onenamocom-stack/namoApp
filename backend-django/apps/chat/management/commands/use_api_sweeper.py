"""Point the database's every-minute sweep at the API (5 Oct 2026).

pg_cron ran `select public.session_sweep()` — a SQL copy of the settle that
charged whole minutes while the API charges thirty-second blocks. This
replaces that job's command with an HTTP call (pg_net) to /v1/chat/sweep/,
so there is one settle, the API's. The token goes in a header; it is the
same SWEEP_TOKEN the API reads.

    python manage.py use_api_sweeper --url https://<api>/v1/chat/sweep/

Run it against production AFTER the API carrying /v1/chat/sweep/ is live.
`--revert` puts the SQL sweep back.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

JOB = "session-sweep"


class Command(BaseCommand):
    help = "Make pg_cron's session-sweep call the API's sweeper (or --revert)."

    def add_arguments(self, parser):
        parser.add_argument("--url", help="https://…/v1/chat/sweep/")
        parser.add_argument("--revert", action="store_true")

    def handle(self, *args, **options):
        if connection.vendor != "postgresql":
            raise CommandError("Postgres only.")
        with connection.cursor() as cursor:
            cursor.execute("select jobid from cron.job where jobname = %s", [JOB])
            row = cursor.fetchone()
            if not row:
                raise CommandError(f"No pg_cron job named {JOB}.")
            job_id = row[0]
            if options["revert"]:
                command = "select public.session_sweep()"
            else:
                url, token = options.get("url"), settings.SWEEP_TOKEN
                if not url or not token:
                    raise CommandError("Pass --url and set SWEEP_TOKEN in the environment.")
                cursor.execute("create extension if not exists pg_net")
                command = (
                    "select net.http_post("
                    f"url := {_lit(url)}, "
                    "headers := jsonb_build_object("
                    f"'x-sweep-token', {_lit(token)}, 'content-type', 'application/json'), "
                    "body := '{}'::jsonb, timeout_milliseconds := 20000)"
                )
            cursor.execute("select cron.alter_job(%s, command := %s)", [job_id, command])
        self.stdout.write(f"{JOB} now runs: {'SQL sweep' if options['revert'] else 'API sweep'}")


def _lit(value):
    return "'" + str(value).replace("'", "''") + "'"
