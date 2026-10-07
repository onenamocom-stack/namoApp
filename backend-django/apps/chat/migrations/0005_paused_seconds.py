from django.db import migrations, models


class Migration(migrations.Migration):
    """The seconds a session stood paused for a recharge (7 Oct 2026)."""

    dependencies = [("chat", "0004_session_free_seconds")]

    operations = [
        migrations.AddField(
            model_name="session", name="paused_seconds",
            field=models.IntegerField(db_default=0, default=0),
        ),
    ]
