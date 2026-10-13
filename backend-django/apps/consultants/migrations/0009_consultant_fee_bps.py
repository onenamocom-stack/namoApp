from django.db import migrations, models


class Migration(migrations.Migration):
    """Namo's share per consultant; blank uses the default in code (13 Oct 2026)."""

    dependencies = [("consultants", "0008_consultant_badge")]

    operations = [
        migrations.AddField(
            model_name="consultant", name="fee_bps",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
