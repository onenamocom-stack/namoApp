"""Module 6 — consultants (docs/07-DJANGO-MIGRATION.md §6 step 6).

One model per table, 1:1 onto the existing Supabase schema, so the initial
migration is faked in at cutover (`migrate --fake-initial`) — every constraint
and index name below is the name Postgres already carries, nothing here
creates anything new on the real database. Owned here:

  price_bands            007_consultants.sql, prices corrected by 011
  consultants            007_consultants.sql
  consultant_services    007_consultants.sql
  consultant_availability 007_consultants.sql (009's grid: one row per open cell)
  consultant_time_off    007_consultants.sql
  bookings               008_bookings.sql, order_id FK added by 012
  earnings_ledger        012_bookings_transaction.sql — the consultant's book

Deliberately NOT owned here (raw-SQL gateway, the astro/content pattern):
  profiles               — the profile module (9)
  wallets, ledger        — the wallet module (8); prod triggers still carry
                           balance/mutations until that cutover
  orders, order_items    — the order layer of 012, claimed by wallet+payments
                           (8): the booking transaction writes them through
                           the gateway exactly as 012's function does

Append-only (rule 2): prod refuses UPDATE/DELETE on both ledgers by trigger
(003/012 refuse_mutation). EarningsLedger replicates that refusal in the model
layer so the invariant is executable in this module's tests; module 8 claimed
`ledger` and gives it the same ORM guard — and this module's money paths now
go through apps.wallet.services (the moved gateway), same SQL, same results.
"""

import uuid

from django.db import IntegrityError, models
from django.utils import timezone

from .fields import TextArrayField


class ConsultantStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    BLOCKED = "blocked", "Blocked"


class Consultant(models.Model):
    """One row of `consultants` (007). Consultant-ness IS the existence of
    this row — there is no role column anywhere (docs/05 §4.1). `status` is
    the public-read predicate: an unapproved consultant is invisible, not
    forbidden, which is why the public projections filter on it rather than
    refuse. The applicant-writable columns are exactly 007's column grant;
    `status`, `verified` and the caches are server-side only (009 check
    assertion 8 — a consultant cannot approve themselves)."""

    profile_id = models.UUIDField(primary_key=True, editable=False)
    category = models.TextField()
    specialization = models.TextField(null=True, blank=True)
    languages = TextArrayField()
    experience_yrs = models.SmallIntegerField(null=True, blank=True)
    bio = models.TextField(null=True, blank=True)
    credentials = TextArrayField()
    status = models.CharField(
        max_length=16, choices=ConsultantStatus.choices, default=ConsultantStatus.PENDING
    )
    verified = models.BooleanField(default=False)
    # The three named exceptions to §1.3, written by the reviews trigger and a
    # nightly job in Supabase. Nothing in this module writes them (020 owns
    # the review-side recompute; it reads this row through its own gateway).
    rating_avg_cache = models.DecimalField(max_digits=2, decimal_places=1, null=True, blank=True)
    rating_count_cache = models.IntegerField(default=0)
    # numeric with no precision in Postgres; the placeholder precision is a
    # SQLite artefact — nothing reads this column yet (007, verbatim).
    rank_score_cache = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    legacy_id = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Status = ConsultantStatus

    class Meta:
        db_table = "consultants"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=ConsultantStatus.values),
                name="consultants_status_check",
            ),
        ]
        indexes = [
            models.Index(fields=["status"], name="consultants_status_idx"),
        ]


class ServiceMode(models.TextChoices):
    CALL = "call", "Call"
    CHAT = "chat", "Chat"
    LIVE = "live", "Live"
    BOOKING = "booking", "Booking"


class ServiceBilling(models.TextChoices):
    FIXED = "fixed", "Fixed"
    PER_MINUTE = "per_minute", "Per minute"


class PriceBand(models.Model):
    """One row of `price_bands` (007, prices corrected by 011): the
    platform's catalogue, not a typed number. A price change is an INSERT
    here and a flip of `active`, never a migration against live bookings —
    bookings freeze their own amount (007, verbatim). The catalogue is
    public read (007's only policy: select where active), write-restricted
    to the service layer (`seed_price_bands`); the app has no admin console
    yet, so no endpoint writes it."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tier = models.SmallIntegerField()
    billing = models.CharField(max_length=16, choices=ServiceBilling.choices)
    duration_mins = models.SmallIntegerField()
    price_paise = models.IntegerField()
    active = models.BooleanField(default=True)
    sort = models.SmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    Billing = ServiceBilling

    class Meta:
        db_table = "price_bands"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(billing__in=ServiceBilling.values),
                name="price_bands_billing_check",
            ),
            models.CheckConstraint(
                condition=models.Q(duration_mins__gt=0),
                name="price_bands_duration_mins_check",
            ),
            models.CheckConstraint(
                condition=models.Q(price_paise__gte=0),
                name="price_bands_price_paise_check",
            ),
            models.UniqueConstraint(
                fields=["tier", "billing", "duration_mins"],
                name="price_bands_tier_billing_duration_mins_key",
            ),
        ]


class ConsultantService(models.Model):
    """One row of `consultant_services` (007): the noun rule 3 is unobeyable
    without. `price_paise` is a COPY of the band row — the RLS policy in prod
    pins the two together (009 check assertion 9: a service priced off no
    band is refused by the policy, not the UI). In Django the band check is
    structural: the only write path (`services.apply`) copies the price from
    the band row, never from a request body."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultant = models.ForeignKey(
        Consultant,
        to_field="profile_id",
        db_column="consultant_id",
        on_delete=models.CASCADE,
        related_name="services",
    )
    band_id = models.UUIDField()  # price_bands.id; FK within the module's schema
    mode = models.CharField(max_length=16, choices=ServiceMode.choices)
    billing = models.CharField(
        max_length=16, choices=ServiceBilling.choices, default=ServiceBilling.FIXED
    )
    duration_mins = models.SmallIntegerField()
    price_paise = models.IntegerField()
    active = models.BooleanField(default=True)
    sort = models.SmallIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    Mode = ServiceMode
    Billing = ServiceBilling

    class Meta:
        db_table = "consultant_services"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(mode__in=ServiceMode.values),
                name="consultant_services_mode_check",
            ),
            models.CheckConstraint(
                condition=models.Q(billing__in=ServiceBilling.values),
                name="consultant_services_billing_check",
            ),
            models.CheckConstraint(
                condition=models.Q(price_paise__gte=0),
                name="consultant_services_price_paise_check",
            ),
            # unique(consultant_id, mode, billing, duration_mins) — the name
            # Postgres carries, truncated to its 63-byte identifier limit.
            models.UniqueConstraint(
                fields=["consultant_id", "mode", "billing", "duration_mins"],
                name="consultant_services_consultant_id_mode_billing_duration_mins_ke",
            ),
        ]
        indexes = [
            models.Index(
                fields=["consultant_id"],
                name="consultant_services_consultant_idx",
                condition=models.Q(active=True),
            ),
        ]


class ConsultantAvailability(models.Model):
    """One row of `consultant_availability` (007): one row per OPEN cell of
    the 7 x 6 grid, so a tap is one INSERT or one DELETE and the table caps
    at 42 rows per consultant. `weekday` is Postgres dow — 0 = Sunday; the
    front end's weekDays starts Monday and maps, so the database carries no
    second convention (009, verbatim). `slot_time` is IST."""

    consultant = models.ForeignKey(
        Consultant,
        to_field="profile_id",
        db_column="consultant_id",
        on_delete=models.CASCADE,
        related_name="availability",
    )
    weekday = models.SmallIntegerField()
    slot_time = models.TimeField()

    class Meta:
        db_table = "consultant_availability"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weekday__gte=0) & models.Q(weekday__lte=6),
                name="consultant_availability_weekday_check",
            ),
        ]
        indexes = []  # the PK (consultant_id, weekday, slot_time) is the index


class ConsultantTimeOff(models.Model):
    """One row of `consultant_time_off` (007). Own-read as well as own-write:
    a seeker learns a slot is gone, never why — the slots function subtracts
    it as the owner (009)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultant = models.ForeignKey(
        Consultant,
        to_field="profile_id",
        db_column="consultant_id",
        on_delete=models.CASCADE,
        related_name="time_off",
    )
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    reason = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "consultant_time_off"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")),
                name="consultant_time_off_ordered",
            ),
        ]
        indexes = [
            models.Index(
                fields=["consultant_id", "starts_at"],
                name="consultant_time_off_consultant_idx",
            ),
        ]


class BookingStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    COMPLETED = "completed", "Completed"
    DECLINED = "declined", "Declined"
    CANCELLED = "cancelled", "Cancelled"
    RESCHEDULED = "rescheduled", "Rescheduled"
    NO_SHOW = "no_show", "No show"


class Booking(models.Model):
    """One row of `bookings` (008, order_id layer from 012). `duration_mins`
    and `amount_paise` are FROZEN COPIES, not joins: a consultant changing
    band must not move a booking already paid for (012, verbatim).

    The conflict check IS the partial unique index: two clients requesting
    the same slot at the same instant produce one booking and one refusal —
    not application logic. The claim is at `pending`, not `confirmed`: a
    request holds the slot while the consultant decides (009)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    seeker_id = models.UUIDField()  # profiles id; FK deferred to the profile module
    consultant = models.ForeignKey(
        Consultant,
        to_field="profile_id",
        db_column="consultant_id",
        on_delete=models.CASCADE,
        related_name="bookings",
    )
    service = models.ForeignKey(
        ConsultantService,
        on_delete=models.CASCADE,
        related_name="bookings",
    )
    order_id = models.UUIDField(null=True, blank=True)  # orders.id; FK deferred to module 8
    starts_at = models.DateTimeField()
    duration_mins = models.SmallIntegerField()
    amount_paise = models.IntegerField()
    mode = models.TextField()
    status = models.CharField(
        max_length=16, choices=BookingStatus.choices, default=BookingStatus.PENDING
    )
    rescheduled_to = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL
    )
    note = models.TextField(null=True, blank=True)
    legacy_id = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    Status = BookingStatus

    class Meta:
        db_table = "bookings"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=BookingStatus.values),
                name="bookings_status_check",
            ),
            # THE conflict check (008): one live claim per (consultant, slot).
            models.UniqueConstraint(
                fields=["consultant_id", "starts_at"],
                condition=models.Q(status__in=(BookingStatus.PENDING, BookingStatus.CONFIRMED)),
                name="bookings_slot_claim",
            ),
        ]
        indexes = [
            models.Index(fields=["consultant_id", "starts_at"], name="bookings_consultant_starts_idx"),
            models.Index(fields=["seeker_id", "-starts_at"], name="bookings_seeker_starts_idx"),
        ]


FEE_BPS = 1800  # 18% in basis points, named once (012 / 01-PRD §4.1; rule 1)


class EarningsLedger(models.Model):
    """One row of `earnings_ledger` (012) — the consultant's book. The CHECK
    is the whole invariant: gross - fee = net on every row, including the
    negative rows a reversal writes. Append-only by trigger in prod
    (rule 2); the model refuses UPDATE/DELETE the same way, so a mistake can
    only be corrected by a reversing entry, never an edit."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultant = models.ForeignKey(
        Consultant,
        to_field="profile_id",
        db_column="consultant_id",
        on_delete=models.CASCADE,
        related_name="earnings",
    )
    booking = models.ForeignKey(
        Booking, null=True, blank=True, on_delete=models.SET_NULL
    )
    gross_paise = models.IntegerField()
    fee_bps = models.SmallIntegerField()
    fee_paise = models.IntegerField()
    net_paise = models.IntegerField()
    kind = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "earnings_ledger"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(net_paise=models.F("gross_paise") - models.F("fee_paise")),
                name="earnings_ledger_nets",
            ),
        ]
        indexes = [
            models.Index(
                fields=["consultant_id", "-created_at"],
                name="earnings_ledger_consultant_created_idx",
            ),
        ]

    def _refuse_mutation(self):
        raise IntegrityError(
            "earnings_ledger is append-only: write a reversing entry, never an edit (rule 2)"
        )

    def save(self, *args, **kwargs):
        if not self._state.adding:
            self._refuse_mutation()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        self._refuse_mutation()
