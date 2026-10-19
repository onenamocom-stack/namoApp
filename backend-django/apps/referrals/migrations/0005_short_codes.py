"""Four-character referral codes, one per person (19 Oct 2026, Rahul: "4
digit kar do. Sabko ek he. Aur purane band kar do").

Every person who holds a code gets one new four-character code, written on
each of their rows (seeker and consultant alike). The old eight-character
codes stop working: nothing keeps them. Affiliate visits store the code they
came through and are resolved again when an order lands, so their code
moves with the person's; signed-up referrals keep the old code as history.
"""

import secrets

from django.db import migrations, models

ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def shorten(apps, schema_editor):
    ReferralCode = apps.get_model("referrals", "ReferralCode")
    AffiliateVisit = apps.get_model("referrals", "AffiliateVisit")
    Coupon = apps.get_model("shop", "Coupon")
    taken = {c.upper() for c in Coupon.objects.values_list("code", flat=True)}
    people = {}
    for row in ReferralCode.objects.order_by("created_at"):
        people.setdefault(str(row.profile_id), []).append(row)
    for rows in people.values():
        code = None
        while code is None or code in taken:
            code = "".join(secrets.choice(ALPHABET) for _ in range(4))
        taken.add(code)
        for row in rows:
            AffiliateVisit.objects.filter(code=row.code).update(code=code)
            row.code = code
            row.save(update_fields=["code"])


class Migration(migrations.Migration):

    dependencies = [
        ('referrals', '0004_signup_bonus'),
        ('shop', '0012_market_names_and_show'),
    ]

    operations = [
        migrations.AlterField(
            model_name='referralcode',
            name='code',
            field=models.CharField(max_length=16),
        ),
        migrations.RunPython(shorten, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='referralcode',
            name='kind',
            field=models.CharField(choices=[('seeker', 'Seeker (sign-up)'), ('consultant', 'Consultant (link and coupon)')], max_length=16),
        ),
        migrations.AddConstraint(
            model_name='referralcode',
            constraint=models.UniqueConstraint(fields=('code', 'kind'), name='referral_codes_code_kind'),
        ),
    ]
