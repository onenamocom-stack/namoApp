from django.db import migrations, models


class Migration(migrations.Migration):
    """A photo in a chat message, sent by the consultant (17 Oct 2026)."""

    dependencies = [("chat", "0005_paused_seconds")]

    operations = [
        migrations.AddField(
            model_name="message", name="image_url",
            field=models.TextField(blank=True, null=True),
        ),
    ]
