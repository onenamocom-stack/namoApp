from django.db import migrations, models


class Migration(migrations.Migration):
    """Which shop order a Razorpay payment pays for (6 Oct 2026: the shop
    pays through Razorpay directly; the wallet is for chat). Nullable: every
    existing row is a wallet top-up."""

    dependencies = [("wallet", "0002_entitlements")]

    operations = [
        migrations.AddField(
            model_name="payment", name="shop_order_id",
            field=models.UUIDField(blank=True, null=True),
        ),
    ]
