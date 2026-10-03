import apps.content.models
from django.db import migrations, models


def backfill_day(apps, schema_editor):
    """Existing rows get the IST date they were made on. Every row is unique
    on (content, viewer) already, so it is unique on (content, viewer, day)."""
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute(
            "update content_views set day = (created_at at time zone 'Asia/Kolkata')::date"
        )
        return
    ContentView = apps.get_model("content", "ContentView")
    from datetime import timedelta

    for row in ContentView.objects.all():
        row.day = (row.created_at + timedelta(hours=5, minutes=30)).date()
        row.save(update_fields=["day"])


class Migration(migrations.Migration):
    """A view counts once per person per reel per IST day (3 Oct 2026),
    replacing once per person ever. docs/05 §5.2b."""

    dependencies = [
        ("content", "0005_content_comments"),
    ]

    operations = [
        migrations.AddField(
            model_name="contentview",
            name="day",
            field=models.DateField(default=apps.content.models.ist_today),
        ),
        migrations.RunPython(backfill_day, migrations.RunPython.noop),
        migrations.RemoveConstraint(model_name="contentview", name="content_views_once"),
        migrations.AddConstraint(
            model_name="contentview",
            constraint=models.UniqueConstraint(
                fields=("content", "viewer_id", "day"), name="content_views_once_a_day",
            ),
        ),
    ]
