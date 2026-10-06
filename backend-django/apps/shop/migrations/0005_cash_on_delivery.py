from django.db import migrations, models


class Migration(migrations.Migration):
    """Cash on delivery (6 Oct 2026): how an order is paid, the COD fee it
    carries, and whether a quote's pincode takes cash. Database defaults on
    every column, so rows written by raw SQL (bookings, the chat meter) and
    every existing row read as a wallet order with no fee."""

    dependencies = [("shop", "0004_product_page")]

    operations = [
        migrations.AddField(
            model_name="order", name="payment_method",
            field=models.CharField(choices=[("wallet", "Wallet"), ("cod", "Cod")], db_default="wallet",
                                   default="wallet", max_length=8),
        ),
        migrations.AddField(
            model_name="order", name="cod_fee_paise",
            field=models.IntegerField(db_default=0, default=0),
        ),
        migrations.AddField(
            model_name="shippingquote", name="cod_available",
            field=models.BooleanField(db_default=False, default=False),
        ),
    ]
