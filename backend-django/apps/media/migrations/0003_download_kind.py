from django.db import migrations, models


class Migration(migrations.Migration):
    """`download`: a Market seller's file, private (15 Oct 2026)."""

    dependencies = [("media", "0002_remove_mediaasset_media_kind_valid_and_more")]

    operations = [
        migrations.RemoveConstraint(model_name="mediaasset", name="media_kind_valid"),
        migrations.AlterField(
            model_name="mediaasset", name="kind",
            field=models.CharField(choices=[("reel", "Reel"), ("image", "Image"), ("audio", "Audio"),
                                            ("document", "Document"), ("download", "Download")], max_length=16),
        ),
        migrations.AddConstraint(
            model_name="mediaasset",
            constraint=models.CheckConstraint(
                condition=models.Q(kind__in=["reel", "image", "audio", "document", "download"]),
                name="media_kind_valid",
            ),
        ),
    ]
