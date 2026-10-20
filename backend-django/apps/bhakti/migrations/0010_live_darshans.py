# Temples' live YouTube darshan on the darshan page (20 Oct 2026, Rahul).

import uuid

import django.utils.timezone
from django.db import migrations, models


def close_to_postgrest(apps, schema_editor):
    """RLS on, no policies: read through the API only, like every table."""
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("alter table live_darshans enable row level security")


class Migration(migrations.Migration):

    dependencies = [
        ('bhakti', '0009_asset_tags'),
    ]

    operations = [
        migrations.CreateModel(
            name='LiveDarshan',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('temple', models.TextField()),
                ('temple_hi', models.TextField(blank=True, default='')),
                ('location', models.TextField(blank=True, default='')),
                ('location_hi', models.TextField(blank=True, default='')),
                ('youtube_url', models.TextField()),
                ('video_id', models.TextField(blank=True, default='')),
                ('channel_id', models.TextField(blank=True, default='')),
                ('hours', models.TextField(blank=True, default='')),
                ('image_url', models.TextField(blank=True, default='')),
                ('sort', models.IntegerField(default=0)),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                'verbose_name': 'live darshan',
                'db_table': 'live_darshans',
                'ordering': ('sort', 'temple'),
            },
        ),
        migrations.RunPython(close_to_postgrest, migrations.RunPython.noop),
    ]
