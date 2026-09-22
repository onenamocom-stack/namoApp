# payments.order_id — the shop or Academy order a payment was opened for
# (028_shop.sql). The migrated database already has it: HANDOFF §14 added it by
# hand when the copy found it missing. So on Postgres this is `add column if not
# exists` — a no-op there, real on any fresh database — and never needs faking.
# No FK to `orders`: that table is a raw-gateway table no Django migration
# creates, the same no-business-FK trade the rest of this app makes.

from django.db import migrations, models


def add_order_id(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("alter table payments add column if not exists order_id uuid")
        return
    field = models.UUIDField(null=True, blank=True)
    field.set_attributes_from_name("order_id")
    schema_editor.add_field(apps.get_model("wallet", "Payment"), field)


class Migration(migrations.Migration):
    dependencies = [("wallet", "0001_initial")]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(add_order_id, migrations.RunPython.noop)],
            state_operations=[
                migrations.AddField(
                    model_name="payment",
                    name="order_id",
                    field=models.UUIDField(blank=True, null=True),
                )
            ],
        )
    ]
