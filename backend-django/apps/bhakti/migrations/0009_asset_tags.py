# An e-book tagged on a post (15 Oct 2026, Rahul).

import uuid

import django.db.models.deletion
from django.db import migrations, models


def close_to_postgrest(apps, schema_editor):
    """RLS on, no policies: read through the API only, like every table."""
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("alter table bhakti_asset_tags enable row level security")


class Migration(migrations.Migration):

    dependencies = [
        ('bhakti', '0008_asset_mrp_description'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssetTag',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('content_id', models.UUIDField(db_index=True)),
                ('sort', models.SmallIntegerField(default=0)),
                ('asset', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tags',
                                            to='bhakti.bhaktiasset')),
            ],
            options={
                'db_table': 'bhakti_asset_tags',
                'constraints': [models.UniqueConstraint(fields=('content_id', 'asset'),
                                                        name='bhakti_asset_tags_once')],
            },
        ),
        migrations.RunPython(close_to_postgrest, migrations.RunPython.noop),
    ]
