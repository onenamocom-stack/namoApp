from django.db import migrations, models


class Migration(migrations.Migration):
    """A product in more than one category and subcategory (6 Oct 2026).
    Two link tables; nothing existing changes."""

    dependencies = [("shop", "0006_pay_online")]

    operations = [
        migrations.AddField(
            model_name="product", name="also_categories",
            field=models.ManyToManyField(blank=True, db_table="product_also_categories",
                                         related_name="also_products", to="shop.shopcategory"),
        ),
        migrations.AddField(
            model_name="product", name="also_subcategories",
            field=models.ManyToManyField(blank=True, db_table="product_also_subcategories",
                                         related_name="also_products", to="shop.shopsubcategory"),
        ),
    ]
