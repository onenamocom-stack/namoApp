from django.db import models
from django.utils import timezone


class AstroCache(models.Model):
    """One row of the `astro_cache` table (docs/05-BACKEND-SCHEMA.md §4.10,
    backend/schema/019_astro_cache.sql).

    Maps 1:1 onto the existing Supabase table. This model adds nothing the
    SQL does not already have — the migration it generates is faked in at
    cutover. Every value freeastroapi.com computes for us is memoised here;
    the key carries every input that produced the payload, so nothing can go
    stale (no TTL, no sweeper — 019's deliberate design).

    RLS is on in Postgres and there is NO policy for anybody: the table is
    reachable only by the service role. Django has no RLS, so the equivalent
    protection is that only the service layer in this app ever touches the
    table, and no endpoint returns a raw row (no `key`, no `fetched_at`, no
    list route) — the 019 check's invariants ported to pytest.
    """

    key = models.TextField(primary_key=True)
    payload = models.JSONField()
    fetched_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "astro_cache"
