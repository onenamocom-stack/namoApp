# Account type, firm name, GST number and certificate on payout details
# (16 Oct 2026, Rahul). Database defaults, so the live code inserts while
# this runs ahead of the deploy.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('consultants', '0010_consultant_fee_bps'),
    ]

    operations = [
        migrations.AddField(
            model_name='payoutdetails', name='account_type',
            field=models.CharField(blank=True, db_default='', default='', max_length=8),
        ),
        migrations.AddField(
            model_name='payoutdetails', name='firm_name',
            field=models.TextField(blank=True, db_default='', default=''),
        ),
        migrations.AddField(
            model_name='payoutdetails', name='gst_number',
            field=models.CharField(blank=True, db_default='', default='', max_length=15),
        ),
        migrations.AddField(
            model_name='payoutdetails', name='gst_doc_asset_id',
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
