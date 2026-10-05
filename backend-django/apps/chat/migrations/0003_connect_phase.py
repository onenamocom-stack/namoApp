"""5 Oct 2026 — the connect phase and one caller at a time.

1. `accepted_at`, nullable: when the consultant said yes. A call's clock
   (`started_at`) now waits for both people to be in the room.
2. `sessions_one_ringing_per_consultant`: one ringing request per
   consultant. Any second ringing row is expired first so the unique index
   can be built (production had none on the day).
3. The SQL sweeper that pg_cron runs (`public.session_sweep`) is taught to
   leave alone a live session whose clock has not started — the API settles
   those (`apps.chat.services`). Postgres only; SQLite has no such function.
"""

from django.db import migrations, models

EXPIRE_EXTRA_RINGING = """
update sessions s set status = 'expired', ended_at = now()
 where s.status = 'requested'
   and exists (select 1 from sessions t
                where t.consultant_id = s.consultant_id and t.status = 'requested'
                  and (t.requested_at, t.id) > (s.requested_at, s.id));
"""

SWEEP_SKIPS_CONNECTING = """
do $do$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'session_sweep') then
    execute $fn$
create or replace function public.session_sweep()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $body$
declare
  c_grace   constant interval := interval '60 seconds';
  c_unanswered constant interval := interval '15 minutes';
  v_id      uuid;
  v_n       integer := 0;
begin
  -- started_at is null: a call still connecting. The API settles those.
  for v_id in
    select id from public.sessions
     where status = 'live' and started_at is not null
       and (now() >= expires_at
            or coalesce(heartbeat_at, started_at) < now() - c_grace)
  loop
    perform public.session_end(
      v_id,
      case when (select now() >= expires_at from public.sessions where id = v_id)
           then 'time ran out' else 'connection lost' end);
    v_n := v_n + 1;
  end loop;

  update public.sessions set status = 'expired'
   where status = 'requested' and requested_at < now() - c_unanswered;

  return v_n;
end;
$body$;
$fn$;
  end if;
end
$do$;
"""


def postgres_only(sql):
    def run(apps, schema_editor):
        if schema_editor.connection.vendor == "postgresql":
            schema_editor.execute(sql)
    return run


class Migration(migrations.Migration):
    dependencies = [("chat", "0002_session_audio_only")]

    operations = [
        migrations.AddField(
            model_name="session", name="accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(postgres_only(EXPIRE_EXTRA_RINGING), migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="session",
            constraint=models.UniqueConstraint(
                condition=models.Q(status="requested"),
                fields=("consultant_id",),
                name="sessions_one_ringing_per_consultant",
            ),
        ),
        migrations.RunPython(postgres_only(SWEEP_SKIPS_CONNECTING), migrations.RunPython.noop),
    ]
