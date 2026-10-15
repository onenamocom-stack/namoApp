from django.db import migrations, models


class Migration(migrations.Migration):
    """A download's MRP, struck through beside its price on the Market, and
    its description for its own page (15 Oct 2026, Rahul: "Create MRP in all
    categories"; "optimise the landing page for the category"). The MRP is
    display only: what is charged is still `price_paise`."""

    dependencies = [("bhakti", "0007_writing_limit_indexes")]

    operations = [
        migrations.AddField(
            model_name="bhaktiasset", name="description",
            field=models.TextField(blank=True, default="", db_default=""),
        ),
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
