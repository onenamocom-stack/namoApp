"""Two Pro categories renamed (21 Oct 2026, Rahul: "Astrologer ka wahi naam
rahne do. Baki ko change kar do"): Therapist is now Mental health, Life Coach
is now Life coach. Every Pro's category list, every pending profile review
and the two AI Pros follow; an AI Pro still carrying its made-up name gets the
new one. The AI Pros keep their keys (`therapist`, `life_coach`), so their
chats carry on."""

from django.db import migrations

RENAMES = {"Therapist": "Mental health", "Life Coach": "Life coach"}


def _swap(raw, table):
    names = [n.strip() for n in (raw or "").split(",") if n.strip()]
    return ", ".join(table.get(n, n) for n in names)


def _run(apps, table):
    for model in (apps.get_model("consultants", "Consultant"), apps.get_model("consultants", "ProfileReview")):
        for row in model.objects.all().only("pk", "category"):
            new = _swap(row.category, table)
            if new != row.category:
                model.objects.filter(pk=row.pk).update(category=new)
    AiBot = apps.get_model("ai", "AiBot")
    for old, new in table.items():
        for bot in AiBot.objects.filter(category=old):
            bot.category = new
            if bot.name == f"NAMO AI · {old}":
                bot.name = f"NAMO AI · {new}"
            bot.save(update_fields=["category", "name"])


def forward(apps, schema_editor):
    _run(apps, RENAMES)


def back(apps, schema_editor):
    _run(apps, {new: old for old, new in RENAMES.items()})


class Migration(migrations.Migration):
    dependencies = [
        ("ai", "0007_aibot_message_persona"),
        ("consultants", "0015_freefirstsettings"),
    ]

    operations = [migrations.RunPython(forward, back)]
