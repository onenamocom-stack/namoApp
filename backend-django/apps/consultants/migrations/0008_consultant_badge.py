from django.db import migrations, models


class Migration(migrations.Migration):
    """Pro, Expert or Master, set in the console; everyone starts at Pro
    (13 Oct 2026). The database default lets an older API image insert."""

    dependencies = [("consultants", "0007_consultant_intro")]

    operations = [
        migrations.AddField(
            model_name="consultant",
            name="badge",
            field=models.CharField(
                choices=[("pro", "Pro"), ("expert", "Expert"), ("master", "Master")],
                db_default="pro",
                default="pro",
                max_length=8,
            ),
        ),
        migrations.AddConstraint(
            model_name="consultant",
            constraint=models.CheckConstraint(
                condition=models.Q(badge__in=["pro", "expert", "master"]),
                name="consultants_badge_check",
            ),
        ),
    ]
