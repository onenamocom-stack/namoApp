"""`admin_users` and `admin_actions` as they already stand.

Both tables arrived with the Supabase migration carrying real rows, so this
is recorded with --fake-initial and creates nothing. It exists to make
Django's state match the database, not to build anything.
"""

import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AdminUser',
            fields=[
                ('profile_id', models.UUIDField(primary_key=True, serialize=False)),
                ('tier', models.CharField(choices=[('support', 'Support — reads and searches'), ('fulfilment', 'Fulfilment — shop, stock, shipping'), ('finance', 'Finance — payouts and refunds'), ('superadmin', 'Superadmin — everything, including admins')], max_length=16)),
                ('active', models.BooleanField(default=True)),
                ('added_by_note', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                'verbose_name': 'admin',
                'verbose_name_plural': 'admins',
                'db_table': 'admin_users',
            },
        ),
        migrations.CreateModel(
            name='AdminAction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('action', models.TextField()),
                ('target_type', models.TextField()),
                ('target_id', models.UUIDField(blank=True, null=True)),
                ('detail', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('admin', models.ForeignKey(db_column='admin_id', on_delete=django.db.models.deletion.DO_NOTHING, related_name='actions', to='console.adminuser')),
            ],
            options={
                'verbose_name': 'audit entry',
                'verbose_name_plural': 'audit trail',
                'db_table': 'admin_actions',
                'ordering': ('-created_at',),
            },
        ),
    ]
