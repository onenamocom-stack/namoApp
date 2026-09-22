"""The one column Django needs that the old schema had no reason to carry.

`admin_users` identifies an admin by their PROFILE, which is right — the
audit trail points at a person who exists in this product. But Django's
admin logs somebody in against `auth_user`, so the two have to be linked.
Nullable on purpose: the two superadmins that came across with the
migration have rows and no console login yet.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("console", "0001_existing_tables"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="adminuser",
            name="operator",
            field=models.OneToOneField(
                blank=True, null=True,
                db_column="operator_user_id",
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="admin_profile",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
