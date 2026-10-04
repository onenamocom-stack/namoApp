from django.db import migrations, models


class Migration(migrations.Migration):
    """Two nullable columns on shipments (5 Oct 2026): the courier's last
    status line and the label PDF. Nullable, so no default is needed and no
    existing row changes."""

    dependencies = [("shop", "0002_coupons")]

    operations = [
        migrations.AddField(
            model_name="shipment", name="tracking_status",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="shipment", name="label_url",
            field=models.TextField(blank=True, null=True),
        ),
    ]
