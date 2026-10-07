from django.db import migrations, models


class Migration(migrations.Migration):
    """A consultant shown free for a new seeker's first session (7 Oct 2026)."""

    dependencies = [("consultants", "0004_payout_details")]

    operations = [
        migrations.AddField(
            model_name="consultant", name="free_first",
            field=models.BooleanField(db_default=False, default=False),
        ),
    ]
