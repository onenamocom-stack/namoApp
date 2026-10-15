from django.db import migrations, models


class Migration(migrations.Migration):
    """An e-book's MRP, struck through beside its price on the Market (15 Oct
    2026, Rahul: "Create MRP in all categories"). Display only: what is
    charged is still `price_paise`. Nullable: no MRP shows none."""

    dependencies = [("bhakti", "0007_writing_limit_indexes")]

    operations = [
        migrations.AddField(
            model_name="bhaktiasset", name="mrp_paise",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="bhaktiasset",
            constraint=models.CheckConstraint(
                condition=models.Q(mrp_paise__isnull=True) | models.Q(mrp_paise__gt=0),
                name="bhakti_assets_mrp_paise_check",
            ),
        ),
    ]
