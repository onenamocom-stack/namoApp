"""Wipe one account so its phone number can be used again.

WHY THIS EXISTS. Testing the referral ladder needs a NEW seeker, and a
new seeker needs a phone number nobody has used. Without this, every
round of testing burns a real number — and the team does not have an
endless supply of them.

THE SUPABASE AUTH USER IS THE POINT. Deleting the `profiles` row alone
achieves nothing: auth lives in Supabase, so the next sign-up with that
number logs back into the same account and the test is not a new seeker
at all. This deletes both sides.

WHAT IT CANNOT DELETE, and does not pretend to: `ledger` and
`earnings_ledger` refuse DELETE by trigger (rule 2, append-only). An
account that has moved money keeps those rows and therefore keeps its
profile. The command says so plainly rather than half-succeeding — and
it refuses outright instead, because a half-deleted account is worse for
the next test than an untouched one.

DRY RUN BY DEFAULT. It prints what it would remove and stops. `--yes` is
the only thing that deletes anything.
"""

import json
import urllib.error
import urllib.request

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Delete a test account by phone, in Django and in Supabase Auth."

    def add_arguments(self, parser):
        parser.add_argument("phone", help="e.g. 917011921246 or 7011921246")
        parser.add_argument(
            "--yes", action="store_true",
            help="Actually delete. Without it this only prints what it would do.",
        )
        parser.add_argument(
            "--service-key", default="",
            help="Supabase service-role key. Without it the auth user is left "
                 "alone and the phone stays unusable for a fresh sign-up.",
        )

    def handle(self, *args, **options):
        from apps.profiles.models import Profile

        digits = "".join(c for c in options["phone"] if c.isdigit())
        if len(digits) < 10:
            raise CommandError("That does not look like a phone number.")
        tail = digits[-10:]

        profile = Profile.objects.filter(phone__endswith=tail).first()
        if profile is None:
            self.stdout.write(f"No profile ending {tail}. Nothing to do here.")
            self._delete_auth_user(None, tail, options)
            return

        counts, blockers = self._survey(profile.id)
        self.stdout.write(f"\n{profile.name} · {profile.phone} · {profile.id}")
        for label, n in counts.items():
            if n:
                self.stdout.write(f"   {label:24} {n}")

        if blockers:
            # Refuse rather than half-delete. A profile whose ledger cannot
            # go is a profile that cannot go, and leaving the rest of it
            # deleted would make the next test start from a broken account
            # rather than a clean one.
            self.stdout.write(self.style.ERROR(
                "\nThis account has moved money. Both ledgers are append-only "
                "by trigger, so it cannot be removed:"
            ))
            for label, n in blockers.items():
                self.stdout.write(f"   {label:24} {n}")
            self.stdout.write(
                "\nUse a different number, or reverse the balances and leave "
                "the account renamed — the referral test cleanups did that."
            )
            return

        if not options["yes"]:
            self.stdout.write(self.style.WARNING(
                "\nDry run. Pass --yes to actually delete."
            ))
            return

        removed = self._delete(profile.id)
        self.stdout.write(self.style.SUCCESS(f"\nDeleted: {removed}"))
        self._delete_auth_user(profile.id, tail, options)

    # ── what is attached ────────────────────────────────────────────────

    def _survey(self, pid):
        from apps.ai.models import Message, Quota
        from apps.consultants.models import Consultant, EarningsLedger
        from apps.notifications.models import Notification
        from apps.referrals.models import Cashback, Referral, ReferralCode
        from apps.shop.models import Order

        counts = {
            "ai messages": Message.objects.filter(profile_id=pid).count(),
            "ai quota": Quota.objects.filter(profile_id=pid).count(),
            "referral codes": ReferralCode.objects.filter(profile_id=pid).count(),
            "referrals (referee)": Referral.objects.filter(referee_id=pid).count(),
            "referrals (referrer)": Referral.objects.filter(referrer_id=pid).count(),
            "cashback": Cashback.objects.filter(profile_id=pid).count(),
            "notifications": Notification.objects.filter(profile_id=pid).count(),
            "orders": Order.objects.filter(profile_id=pid).count(),
            "consultant row": Consultant.objects.filter(profile_id=pid).count(),
        }
        with connection.cursor() as c:
            c.execute("select count(*) from ledger where wallet_id = %s", [str(pid)])
            ledger = c.fetchone()[0]
        blockers = {}
        if ledger:
            blockers["wallet ledger rows"] = ledger
        earnings = EarningsLedger.objects.filter(consultant_id=pid).count()
        if earnings:
            blockers["earnings ledger rows"] = earnings
        return counts, blockers

    # ── the delete ──────────────────────────────────────────────────────

    def _delete(self, pid):
        from apps.ai.models import Message, Quota
        from apps.consultants.models import Consultant
        from apps.notifications.models import Notification
        from apps.referrals.models import Cashback, Referral, ReferralCode
        from apps.shop.models import Order, OrderItem

        orders = list(Order.objects.filter(profile_id=pid).values_list("id", flat=True))
        removed = {}
        # Children before parents. Referrals go before codes because a
        # referral names the code it was claimed with.
        for label, qs in (
            ("cashback", Cashback.objects.filter(profile_id=pid)),
            ("referrals", Referral.objects.filter(referee_id=pid)),
            ("referrals made", Referral.objects.filter(referrer_id=pid)),
            ("codes", ReferralCode.objects.filter(profile_id=pid)),
            ("notifications", Notification.objects.filter(profile_id=pid)),
            ("ai messages", Message.objects.filter(profile_id=pid)),
            ("ai quota", Quota.objects.filter(profile_id=pid)),
            ("order items", OrderItem.objects.filter(order_id__in=orders)),
            ("orders", Order.objects.filter(id__in=orders)),
            ("consultant", Consultant.objects.filter(profile_id=pid)),
        ):
            n = qs.delete()[0]
            if n:
                removed[label] = n

        with connection.cursor() as c:
            c.execute("delete from wallets where profile_id = %s", [str(pid)])
            if c.rowcount:
                removed["wallet"] = c.rowcount
            c.execute("delete from profiles where id = %s", [str(pid)])
            removed["profile"] = c.rowcount
        return removed

    # ── the half that actually frees the number ─────────────────────────

    def _delete_auth_user(self, pid, tail, options):
        """Supabase Auth. Without this the number is not reusable: the next
        sign-up finds the existing auth user and logs back into it."""
        key = options["service_key"]
        if not key:
            self.stdout.write(self.style.WARNING(
                "\nNo --service-key given, so the Supabase auth user is still "
                "there. The number will NOT be usable for a fresh sign-up "
                "until it is removed."
            ))
            return
        if not options["yes"]:
            return

        base = settings.SUPABASE_URL.rstrip("/")
        headers = {"apikey": key, "Authorization": f"Bearer {key}"}

        # Find the user by phone, then delete by id — the admin API has no
        # delete-by-phone.
        url = f"{base}/auth/v1/admin/users?page=1&per_page=200"
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=20) as response:
                users = json.load(response).get("users", [])
        except urllib.error.HTTPError as exc:
            self.stdout.write(self.style.ERROR(
                f"Could not list auth users: {exc.code} {exc.reason}"))
            return

        match = next(
            (u for u in users if (u.get("phone") or "").endswith(tail)), None
        )
        if match is None:
            self.stdout.write("No Supabase auth user with that number.")
            return

        request = urllib.request.Request(
            f"{base}/auth/v1/admin/users/{match['id']}",
            headers=headers, method="DELETE",
        )
        try:
            with urllib.request.urlopen(request, timeout=20):
                self.stdout.write(self.style.SUCCESS(
                    f"Supabase auth user {match['id']} deleted. "
                    "The number is free for a fresh sign-up."
                ))
        except urllib.error.HTTPError as exc:
            self.stdout.write(self.style.ERROR(
                f"Auth user NOT deleted: {exc.code} {exc.reason}"))
