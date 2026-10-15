from django.db import migrations, models


class Migration(migrations.Migration):
    """The `listing` sku: a Market seller's download, course or event
    (15 Oct 2026)."""

    dependencies = [("wallet", "0004_payment_entitlement")]

    operations = [
        migrations.RemoveConstraint(model_name="entitlement", name="entitlements_sku_check"),
        migrations.AlterField(
            model_name="entitlement", name="sku",
            field=models.CharField(choices=[("ebook", "E-book"), ("muhurat", "Muhurat"),
                                            ("prediction", "Prediction"), ("listing", "Market listing")],
                                   max_length=16),
        ),
        migrations.AddConstraint(
            model_name="entitlement",
            constraint=models.CheckConstraint(
                condition=models.Q(sku__in=["ebook", "muhurat", "prediction", "listing"]),
                name="entitlements_sku_check",
            ),
        ),
    ]
