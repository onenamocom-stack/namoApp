from django.db import migrations, models


class Migration(migrations.Migration):
    """A third way to pay: Razorpay checkout per order (6 Oct 2026). A
    choice, so the column is unchanged — only Django's list of values."""

    dependencies = [("shop", "0005_cash_on_delivery")]

    operations = [
        migrations.AlterField(
            model_name="order", name="payment_method",
            field=models.CharField(choices=[("online", "Online"), ("wallet", "Wallet"), ("cod", "Cod")],
                                   db_default="wallet", default="wallet", max_length=8),
        ),
    ]
