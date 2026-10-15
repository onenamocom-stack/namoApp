# A Creator's bank: account type, firm name, GST (16 Oct 2026, Rahul).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('market', '0003_commission_rates'),
    ]

    operations = [
        migrations.AddField(
            model_name='sellerbank', name='account_type',
            field=models.CharField(blank=True, db_default='', default='', max_length=8),
        ),
        migrations.AddField(
            model_name='sellerbank', name='firm_name',
            field=models.TextField(blank=True, db_default='', default=''),
        ),
        migrations.AddField(
            model_name='sellerbank', name='gst_number',
            field=models.CharField(blank=True, db_default='', default='', max_length=15),
        ),
        migrations.AddField(
            model_name='sellerbank', name='gst_doc_asset_id',
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
