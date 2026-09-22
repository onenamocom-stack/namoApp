import secrets
import string

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.console.models import AdminUser, Tier
from apps.profiles.models import Profile


class Command(BaseCommand):
    """Give somebody a console login.

    An admin is a PROFILE (`admin_users.profile_id` -> `profiles.id`, and
    the audit trail points there), so this will not invent a person: the
    profile must already exist, which in practice means they have signed in
    to the app once with their phone.

    The password is generated and printed once. Nothing writes it down —
    `set_password` stores a hash — so a lost one is reset by running this
    again with --reset rather than recovered.
    """

    def add_arguments(self, parser):
        parser.add_argument("phone", help="the profile's phone, e.g. 918447284861")
        parser.add_argument("--tier", default=Tier.SUPERADMIN, choices=Tier.values)
        parser.add_argument("--reset", action="store_true",
                            help="new password for an existing login")

    @transaction.atomic
    def handle(self, *args, **options):
        phone = options["phone"].lstrip("+")
        profile = Profile.objects.filter(phone__endswith=phone[-10:]).first()
        if profile is None:
            raise CommandError(
                f"No profile with phone ending {phone[-10:]}. "
                "They must sign in to the app first."
            )

        admin, _ = AdminUser.objects.get_or_create(
            profile_id=profile.id,
            defaults={"tier": options["tier"], "active": True},
        )
        admin.tier = options["tier"]
        admin.active = True

        # Alphanumeric only — the same lesson as the Django secret key and
        # the Razorpay webhook secret: punctuation breaks `.env` sourcing
        # and shell paste, and a password nobody can paste ends up on a
        # sticky note.
        alphabet = string.ascii_letters + string.digits
        password = "".join(secrets.choice(alphabet) for _ in range(20))

        username = f"p{phone[-10:]}"
        user = admin.operator or User.objects.filter(username=username).first()
        if user is None:
            user = User.objects.create(username=username, is_staff=True)
        elif not options["reset"]:
            self.stdout.write(
                f"{username} already has a login. Use --reset for a new password."
            )
            return
        user.is_staff = True
        user.is_active = True
        user.set_password(password)
        user.save()

        admin.operator = user
        admin.save()

        self.stdout.write("")
        self.stdout.write(f"  username  {username}")
        self.stdout.write(f"  password  {password}")
        self.stdout.write(f"  tier      {admin.tier}")
        self.stdout.write(f"  profile   {profile.id} ({profile.name or 'no name'})")
        self.stdout.write("")
        self.stdout.write("Shown once. Change it after the first sign-in.")
