from django.db import migrations, models


def number_existing(apps, schema_editor):
    """Every product already on sale gets a SKU, oldest first: NAMO-0001…,
    and a page address from its name."""
    from django.utils.text import slugify

    Product = apps.get_model("shop", "Product")
    used = set()
    for n, product in enumerate(Product.objects.order_by("created_at", "name"), start=1):
        base = slugify(product.name or "")[:110] or "product"
        slug, k = base, 1
        while slug in used:
            k += 1
            slug = f"{base}-{k}"
        used.add(slug)
        Product.objects.filter(pk=product.pk).update(sku=f"NAMO-{n:04d}", slug=slug)


class Migration(migrations.Migration):
    """The product page and the product id (6 Oct 2026).

    Brand, description, a photo-and-video gallery, FAQ, a readable slug and
    the search/share text — all nullable or an empty list, so no existing
    row changes meaning. And `sku`: added empty, filled for every existing
    product, then made required and unique, so the database itself refuses
    a second product under one id."""

    dependencies = [("shop", "0003_shipment_tracking")]

    operations = [
        migrations.AddField(model_name="product", name="brand",
                            field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name="product", name="description",
                            field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name="product", name="gallery",
                            field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name="product", name="faq",
                            field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name="product", name="slug",
                            field=models.SlugField(blank=True, max_length=120, null=True, unique=True)),
        migrations.AddField(model_name="product", name="seo_title",
                            field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name="product", name="seo_description",
                            field=models.TextField(blank=True, null=True)),
        migrations.AddField(model_name="product", name="sku",
                            field=models.CharField(max_length=64, null=True)),
        migrations.RunPython(number_existing, migrations.RunPython.noop),
        migrations.AlterField(model_name="product", name="sku",
                              field=models.CharField(max_length=64, unique=True)),
    ]
