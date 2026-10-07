from django.db import migrations, models


class Migration(migrations.Migration):
    """The seconds of a session Namo pays for (7 Oct 2026)."""

    dependencies = [("chat", "0003_connect_phase")]

    operations = [
        migrations.AddField(
            model_name="session", name="free_seconds",
            field=models.IntegerField(db_default=0, default=0),
        ),
    ]
