from django.db import migrations, models


class Migration(migrations.Migration):
    """Each product's own cashback on a first order through an astrologer's
    code (9 Oct 2026). Every existing product starts on the platform default."""

    dependencies = [("shop", "0007_more_shelves")]

    operations = [
        migrations.AddField(
            model_name="product", name="referral_cashback_kind",
            field=models.CharField(
                max_length=16, default="default", db_default="default",
                choices=[("default", "Platform default (10% of the order)"), ("none", "No cashback"),
                         ("flat", "Flat amount per item"),
                         ("percent", "Percent of the price, optionally capped per item")],
            ),
        ),
        migrations.AddField(
            model_name="product", name="referral_cashback_value",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="product", name="referral_cashback_cap_paise",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
