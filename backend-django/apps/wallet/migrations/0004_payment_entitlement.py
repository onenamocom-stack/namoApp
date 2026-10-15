from django.db import migrations, models


class Migration(migrations.Migration):
    """What a Razorpay payment unlocks when it buys something kept — an
    e-book paid at the gateway, not from the wallet (15 Oct 2026, Rahul;
    live only with the owner's yes, behind EBOOK_PAY_ONLINE). Nullable:
    every existing row is a top-up or a shop order."""

    dependencies = [("wallet", "0003_payment_shop_order")]

    operations = [
        migrations.AddField(
            model_name="payment", name="entitlement_sku",
            field=models.CharField(blank=True, max_length=16, null=True),
        ),
        migrations.AddField(
            model_name="payment", name="entitlement_ref",
            field=models.TextField(blank=True, null=True),
        ),
    ]
