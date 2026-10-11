import uuid

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


def backfill_order(apps, schema_editor):
    """Every existing cashback row came from a referral that names its order."""
    Cashback = apps.get_model("referrals", "Cashback")
    for row in Cashback.objects.filter(order__isnull=True, referral__isnull=False).select_related("referral"):
        if row.referral.order_id:
            row.order_id = row.referral.order_id
            row.save(update_fields=["order"])


class Migration(migrations.Migration):
    """Astrologers' affiliate links with a window, and first-order cashback
    for everybody (11 Oct 2026)."""

    dependencies = [("referrals", "0001_initial"), ("shop", "0008_referral_cashback")]

    operations = [
        migrations.AlterField(
            model_name="cashback", name="referral",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                                    related_name="cashbacks", to="referrals.referral"),
        ),
        migrations.AddField(
            model_name="cashback", name="order",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name="cashbacks", to="shop.order"),
        ),
        migrations.RunPython(backfill_order, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="cashback",
            constraint=models.UniqueConstraint(condition=models.Q(order__isnull=False),
                                               fields=("order", "side"), name="cashback_one_per_order_side"),
        ),
        migrations.CreateModel(
            name="AffiliateSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("attribution_days", models.PositiveSmallIntegerField(default=15)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "affiliate_settings", "verbose_name": "Affiliate link window",
                     "verbose_name_plural": "Affiliate link window"},
        ),
        migrations.CreateModel(
            name="AffiliateVisit",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("profile_id", models.UUIDField()),
                ("consultant_id", models.UUIDField()),
                ("code", models.CharField(max_length=16)),
                ("product_id", models.UUIDField(blank=True, null=True)),
                ("clicked_at", models.DateTimeField()),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("order", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                            related_name="+", to="shop.order")),
            ],
            options={"db_table": "affiliate_visits"},
        ),
        migrations.AddIndex(
            model_name="affiliatevisit",
            index=models.Index(fields=["profile_id", "-clicked_at"], name="affiliate_visits_who_idx"),
        ),
        migrations.AddIndex(
            model_name="affiliatevisit",
            index=models.Index(fields=["consultant_id", "-clicked_at"], name="affiliate_visits_pro_idx"),
        ),
    ]
