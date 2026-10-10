from django.db import migrations, models

RATE_MIN, RATE_MAX, SLOT = 5, 110, 20


def _clamp(rupees):
    return max(RATE_MIN, min(RATE_MAX, rupees))


def _rupees(paise):
    """Paise to whole rupees, half up — rates are whole rupees from now on."""
    return (paise + 50) // 100


def own_rates(apps, schema_editor):
    """Each consultant's price as four rates (10 Oct 2026, Rahul).

    Chat, video and audio take the per-minute rate they had, so the meter
    charges what it charged yesterday. Booking takes the 20-minute slot's
    price over 20, to the nearest rupee (₹592 -> ₹30/min -> ₹600): a slot is
    now that rate times 20, with no discount. The 15- and 30-minute rows are
    switched off, not deleted — bookings point at them. Every row loses its
    band: the consultant owns the number now."""
    Service = apps.get_model("consultants", "ConsultantService")
    ids = Service.objects.values_list("consultant_id", flat=True).distinct()
    for consultant_id in ids:
        rows = list(Service.objects.filter(consultant_id=consultant_id))
        per_minute = next(
            (r for r in rows if r.billing == "per_minute" and r.mode == "call"),
            next((r for r in rows if r.billing == "per_minute"), None),
        )
        slot = next((r for r in rows if r.billing == "fixed" and r.duration_mins == SLOT), None)
        rate = _clamp(_rupees(per_minute.price_paise)) if per_minute else None
        booking = _clamp(_rupees(slot.price_paise // SLOT)) if slot else None
        rate = rate or booking
        booking = booking or rate
        if rate is None:
            continue
        for mode, sort in (("chat", 100), ("call", 110), ("audio", 120)):
            Service.objects.update_or_create(
                consultant_id=consultant_id, mode=mode, billing="per_minute", duration_mins=1,
                defaults={"price_paise": rate * 100, "active": True, "sort": sort},
            )
        Service.objects.update_or_create(
            consultant_id=consultant_id, mode="call", billing="fixed", duration_mins=SLOT,
            defaults={"price_paise": booking * 100 * SLOT, "active": True, "sort": 0},
        )
        Service.objects.filter(consultant_id=consultant_id, billing="fixed").exclude(
            duration_mins=SLOT
        ).update(active=False)
    Service.objects.update(band_id=None)


class Migration(migrations.Migration):
    """Consultants type their own rates (10 Oct 2026, Rahul): a per-minute row
    per channel (`audio` is new), one 20-minute slot, no bands."""

    dependencies = [
        ('consultants', '0005_consultant_free_first'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='consultantservice',
            name='consultant_services_mode_check',
        ),
        migrations.AlterField(
            model_name='consultantservice',
            name='band_id',
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='consultantservice',
            name='mode',
            field=models.CharField(choices=[('call', 'Call'), ('chat', 'Chat'), ('audio', 'Audio'), ('live', 'Live'), ('booking', 'Booking')], max_length=16),
        ),
        migrations.AddConstraint(
            model_name='consultantservice',
            constraint=models.CheckConstraint(condition=models.Q(('mode__in', ['call', 'chat', 'audio', 'live', 'booking'])), name='consultant_services_mode_check'),
        ),
        # Not reversible: the old prices are gone once a consultant types new
        # ones, and putting the bands back is a decision, not a rollback.
        migrations.RunPython(own_rates, migrations.RunPython.noop),
    ]
