from django.db import migrations, models


class Migration(migrations.Migration):
    """The consultant's intro video or photo (11 Oct 2026, Rahul). Two
    nullable columns, nothing backfilled."""

    dependencies = [
        ("consultants", "0006_own_rates"),
    ]

    operations = [
        migrations.AddField(
            model_name="consultant",
            name="intro_url",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="consultant",
            name="intro_kind",
            field=models.CharField(blank=True, max_length=8, null=True),
        ),
    ]
