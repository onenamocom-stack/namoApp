# Whose link brought an e-book's buyer (15 Oct 2026, Rahul).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('wallet', '0005_sku_listing'),
    ]

    operations = [
        migrations.AddField(
            model_name='entitlement',
            name='referrer_id',
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
