# ── FAKE IN AT CUTOVER — DO NOT RUN FOR REAL ON THE PRODUCTION DATABASE ──────
# This migration records Django's ownership of a table that ALREADY EXISTS.
# `astro_cache` was created by backend/schema/019_astro_cache.sql (key text
# primary key, payload jsonb, fetched_at timestamptz, RLS on and no policy);
# nothing below creates anything new — every name is the one Postgres already
# carries. At cutover: deploy the API against the existing database, then
# `manage.py migrate --fake-initial` (falls back to `--fake astro` if
# inspectdb-level drift makes --fake-initial refuse). It runs for real only
# on fresh databases (tests, dev scratches).
#
# RLS has no Django equivalent; the protection it provided (service-role
# only, zero policies) is re-expressed in code: only apps.astro.services
# touches this table and no endpoint returns a raw row.

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='AstroCache',
            fields=[
                ('key', models.TextField(primary_key=True, serialize=False)),
                ('payload', models.JSONField()),
                ('fetched_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                'db_table': 'astro_cache',
            },
        ),
    ]
