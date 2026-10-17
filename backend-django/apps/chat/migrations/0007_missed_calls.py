import uuid

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    """A busy consultant's missed calls (17 Oct 2026)."""

    dependencies = [("chat", "0006_message_image_url")]

    operations = [
        migrations.CreateModel(
            name="MissedCall",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("consultant_id", models.UUIDField()),
                ("seeker_id", models.UUIDField()),
                ("mode", models.CharField(max_length=10)),
                ("audio_only", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                "db_table": "missed_calls",
                "indexes": [models.Index(fields=["consultant_id", "-created_at"], name="missed_calls_consultant_idx")],
            },
        ),
    ]
