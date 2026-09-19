"""Module 6 — consultants (docs/07 §6 step 6): the pytest port of
backend/schema/009_slots_check.sql and 012_bookings_transaction_check.sql
(as amended by 013_booking_review_fixes.sql), plus the module's endpoint
contract: the exact shapes src/lib/consultants.js (and its staged Django
rewrite, cutovers/consultants.clientlib.js) send and render.

The RLS-equivalent matrix (007/008/010/012 policies):
  listings, slots, price bands     -> anonymous (the views'/RPC's grants)
  consultant detail                -> anonymous; unapproved is a 404, not a
                                      403 — invisible, not forbidden
  availability read                -> approved or own; anyone else []
  availability write               -> own practice only
  bookings read                    -> seeker reads own, consultant reads own
                                      queue (the bookings_view predicate)
  booking create                   -> authenticated seeker; the ONLY write
                                      path (a client-insertable booking is a
                                      free session — 008 grants no INSERT)
  booking decide                   -> the booking's consultant, pending ->
                                      confirmed | declined, nothing else
  earnings read                    -> the consultant's own rows only
  approval                         -> nobody through the API: the request
                                      shape has no status/verified fields
                                      (009 check assertion 8)

wallets/ledger/orders/order_items are raw tables the gateway owns reads and
writes of (they belong to module 8); profiles is the profile module's (9).
Tests stand them up by hand on SQLite, the test_content.py pattern, with two
prod behaviours the fixtures DO reproduce: the ledger's refuse_mutation
trigger (SQLite can raise in triggers) and 013's
ledger_one_refund_per_order partial unique index.
"""

import json
import threading
import uuid
from datetime import time as dtime
from datetime import timedelta

import pytest
from django.test import Client
from django.utils import timezone

from apps.consultants import gateway, services
from apps.consultants.models import (
    FEE_BPS,
    Booking,
    Consultant,
    ConsultantAvailability,
    ConsultantService,
    EarningsLedger,
    PriceBand,
)
from apps.consultants.services import (
    REFUSAL_NOT_AVAILABLE,
    REFUSAL_NOT_BOOKABLE,
    REFUSAL_SHORT_BALANCE,
    REFUSAL_SLOT_TAKEN,
    ist_today,
)

from .conftest import OTHER_USER, TEST_USER, make_claims

SEEKER = TEST_USER
SECOND_SEEKER = OTHER_USER
ADMIN = "aaaaaaaa-5555-6666-7777-888888888888"
PRO = "bbbbbbbb-5555-6666-7777-888888888888"
PENDING_PRO = "cccccccc-5555-6666-7777-888888888888"

SIX_SLOTS = ["09:30", "11:00", "13:30", "16:00", "18:30", "20:00"]


def auth(token):
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def seeker_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=SEEKER))


@pytest.fixture
def second_seeker_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=SECOND_SEEKER))


@pytest.fixture
def pro_token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims(sub=PRO, role="consultant"))


@pytest.fixture
def money_tables():
    """The raw tables module 6's gateway touches but module 8/9 own. On
    SQLite tests stand them up by hand (test_content.py's pattern) — with
    two prod behaviours reproduced for real: 003's refuse_mutation trigger
    on the ledger (SQLite raises in triggers) and 013's
    ledger_one_refund_per_order partial unique index."""
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "create table profiles (id text primary key, name text,"
            " birth_date text, birth_time text, birth_place text)"
        )
        cursor.execute(
            "create table wallets (profile_id text primary key,"
            " balance_paise integer not null default 0)"
        )
        cursor.execute(
            "create table ledger (id text primary key, wallet_id text not null,"
            " delta_paise integer not null check (delta_paise <> 0),"
            " kind text, ref_type text, ref_id text, note text, created_at text)"
        )
        cursor.execute(
            "create trigger ledger_immutable before update on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
        cursor.execute(
            "create trigger ledger_immutable_delete before delete on ledger"
            " for each row begin select raise(abort, 'refuse_mutation'); end"
        )
        cursor.execute(
            "create unique index ledger_one_refund_per_order on ledger (ref_id)"
            " where ref_type = 'refund' and ref_id is not null"
        )
        cursor.execute(
            "create table orders (id text primary key, profile_id text not null,"
            " status text not null default 'paid', total_paise integer not null,"
            " created_at text)"
        )
        cursor.execute(
            "create table order_items (id text primary key, order_id text not null,"
            " item_type text not null, item_id text not null, title text not null,"
            " qty smallint not null default 1, unit_price_paise integer not null,"
            " tax_rate_bps smallint not null default 0)"
        )
    yield
    with connection.cursor() as cursor:
        for table in ("order_items", "orders", "ledger", "wallets", "profiles"):
            cursor.execute(f"drop table {table}")


def _profile(cursor, pid, name, birth_date=None, birth_time=None, birth_place=None):
    cursor.execute(
        "insert into profiles (id, name, birth_date, birth_time, birth_place)"
        " values (%s, %s, %s, %s, %s)",
        [str(pid), name, birth_date, birth_time, birth_place],
    )


def _wallet(pid, balance=0):
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise) values (%s, %s)",
            [str(pid), balance],
        )


def _fund(pid, amount):
    gateway.insert_ledger(pid, amount, "Added money", ref_type="adjustment")


def _counts(seeker_id):
    from django.db import connection

    with connection.cursor() as cursor:
        cursor.execute(
            "select balance_paise from wallets where profile_id = %s", [str(seeker_id)]
        )
        balance = cursor.fetchone()[0]
        cursor.execute("select count(*) from ledger where wallet_id = %s", [str(seeker_id)])
        ledger = cursor.fetchone()[0]
        cursor.execute(
            "select count(*) from orders where profile_id = %s", [str(seeker_id)]
        )
        orders = cursor.fetchone()[0]
    return {"balance": balance, "ledger": ledger, "orders": orders,
            "bookings": Booking.objects.filter(seeker_id=seeker_id).count()}


def _service(consultant_id, *, tier=1, billing="fixed", duration_mins=20, mode="call",
             price=None, active=True):
    band = PriceBand.objects.get(tier=tier, billing=billing, duration_mins=duration_mins)
    return ConsultantService.objects.create(
        consultant_id=consultant_id,
        band_id=band.id,
        mode=mode,
        billing=billing,
        duration_mins=duration_mins,
        price_paise=band.price_paise if price is None else price,
        active=active,
    )


def _availability(consultant_id, slots=SIX_SLOTS, weekdays=range(7)):
    for dow in weekdays:
        for slot in slots:
            hh, mm = (int(p) for p in slot.split(":"))
            ConsultantAvailability.objects.get_or_create(
                consultant_id=consultant_id, weekday=dow, slot_time=dtime(hh, mm)
            )


def _open_day(pro, offset=1):
    """A date `offset` days out on which the consultant offers every slot
    (anything past today has no past-filtering)."""
    return ist_today() + timedelta(days=offset)


def _combine(day, slot):
    hh, mm = (int(p) for p in slot.split(":"))
    return services._combine_ist(day, dtime(hh, mm))


@pytest.fixture
def catalogue():
    """The platform's six tiers, 011's prices — idempotent, so a second
    call refreshes rather than duplicates."""
    created, refreshed = services.seed_price_bands()
    assert created == 24 and refreshed == 0
    again = services.seed_price_bands()
    assert again == (0, 0)
    return PriceBand.objects.all()


@pytest.fixture
def roster(money_tables, catalogue):
    """A funded seeker, a second seeker, an approved consultant open at all
    six times on all seven days with one fixed service — the cast both SQL
    checks build."""
    from django.db import connection

    with connection.cursor() as cursor:
        _profile(cursor, SEEKER, "Tara Verma", "1994-03-12", "07:40", "Jaipur")
        _profile(cursor, SECOND_SEEKER, "Arjun Nair", "1990-11-02", "14:05", "Pune")
        _profile(cursor, PRO, "Ritu Kashyap")
        _profile(cursor, PENDING_PRO, "Wannabe Pro")
    _wallet(SEEKER)
    _wallet(SECOND_SEEKER)
    consultant = Consultant.objects.create(
        profile_id=PRO, category="Astrologer", status="approved"
    )
    Consultant.objects.create(profile_id=PENDING_PRO, category="Astrologer", status="pending")
    _availability(PRO)
    service = _service(PRO, tier=1)
    return consultant, service


# ── 011's rounding arithmetic ────────────────────────────────────────────────


@pytest.mark.django_db
class TestPriceBandArithmetic:
    """011's correction vectors: the 20-minute price is the PRD's number
    restored, never rounded; only the derived lengths round, half away from
    zero like Postgres numeric round — never Python banker's rounding."""

    @pytest.mark.parametrize(
        "tier,rupees,fixed15,fixed20,fixed30,per_minute",
        [
            (1, 749, 56000, 74900, 112000, 3700),
            (2, 899, 67000, 89900, 135000, 4500),
            (3, 999, 75000, 99900, 150000, 5000),
            (4, 1299, 97000, 129900, 195000, 6500),
            (5, 1499, 112000, 149900, 225000, 7500),
            (6, 2200, 165000, 220000, 330000, 11000),
        ],
    )
    def test_derive_band_price_matches_011(self, tier, rupees, fixed15, fixed20,
                                           fixed30, per_minute):
        assert services.derive_band_price(rupees, "fixed", 20) == fixed20
        assert services.derive_band_price(rupees, "fixed", 15) == fixed15
        assert services.derive_band_price(rupees, "fixed", 30) == fixed30
        assert services.derive_band_price(rupees, "per_minute", 1) == per_minute

    def test_half_up_not_bankers(self):
        # 112425 / 1000 = 112.425 -> 112 either way; the disagreeing case is
        # x.5 exactly: 250 -> 250000 grid 1000... use the per-minute grid:
        # 3745 / 100 = 37.45 (not x.5). The banker's case: 50/100 = 0.5 ->
        # Postgres round says 1, banker's says 0.
        assert services._round_to_grid(50, 100) == 100
        assert services._round_to_grid(150, 100) == 200  # 1.5 -> 2 both ways
        assert services._round_to_grid(250, 100) == 300  # 2.5 -> 3, not 2

    def test_seeded_catalogue_carries_011_prices(self, catalogue):
        band = PriceBand.objects.get(tier=5, billing="fixed", duration_mins=30)
        assert band.price_paise == 225000  # not 007's exact 224850
        band = PriceBand.objects.get(tier=1, billing="per_minute", duration_mins=1)
        assert band.price_paise == 3700  # not 007's exact 3745

    def test_reseed_refreshes_a_drifted_price(self, catalogue):
        band = PriceBand.objects.get(tier=5, billing="fixed", duration_mins=30)
        band.price_paise = 224850  # 007's un-rounded number, as if 011 never ran
        band.active = False
        band.save()
        created, refreshed = services.seed_price_bands()
        assert created == 0 and refreshed == 1
        band.refresh_from_db()
        assert band.price_paise == 225000
        assert band.active is True

    def test_price_bands_endpoint_is_anonymous(self, api_client, catalogue):
        response = api_client.get("/v1/consultants/price-bands/")
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 24
        assert all(r["active"] for r in rows)
        assert rows[0]["tier"] == 1


# ── 009 check assertions 1-7: the one slots source ───────────────────────────


@pytest.mark.django_db
class TestOpenSlots:
    def test_fully_open_day_offers_every_rule(self, roster):
        # Assertion 1: a day offers something, and every time it offers is
        # one this consultant actually opened. (Anything past today has no
        # past-filtering, so all six.)
        day = _open_day(PRO)
        offered = services.open_slots(PRO, day)
        assert [o["slot_time"].strftime("%H:%M") for o in offered] == SIX_SLOTS

    def test_pending_booking_removes_exactly_its_slot(self, roster):
        # Assertion 2: the claim is at pending, not at confirmed.
        day = _open_day(PRO)
        pick = SIX_SLOTS[2]
        at = _combine(day, pick)
        _, service = roster
        Booking.objects.create(
            seeker_id=SEEKER, consultant_id=PRO, service_id=service.id,
            starts_at=at, duration_mins=20, amount_paise=service.price_paise,
            mode="call", status="pending",
        )
        offered = services.open_slots(PRO, day)
        assert pick not in [o["slot_time"].strftime("%H:%M") for o in offered]
        assert len(offered) == len(SIX_SLOTS) - 1

    def test_confirmed_booking_also_holds(self, roster):
        day = _open_day(PRO)
        _, service = roster
        Booking.objects.create(
            seeker_id=SEEKER, consultant_id=PRO, service_id=service.id,
            starts_at=_combine(day, SIX_SLOTS[0]), duration_mins=20,
            amount_paise=service.price_paise, mode="call", status="confirmed",
        )
        assert len(services.open_slots(PRO, day)) == len(SIX_SLOTS) - 1

    def test_declined_booking_frees_its_slot(self, roster):
        # Assertion 3.
        day = _open_day(PRO)
        _, service = roster
        booking = Booking.objects.create(
            seeker_id=SEEKER, consultant_id=PRO, service_id=service.id,
            starts_at=_combine(day, SIX_SLOTS[1]), duration_mins=20,
            amount_paise=service.price_paise, mode="call", status="pending",
        )
        Booking.objects.filter(pk=booking.id).update(status="declined")
        assert len(services.open_slots(PRO, day)) == len(SIX_SLOTS)

    def test_time_off_removes_only_the_slots_inside_it(self, roster):
        # Assertion 4.
        day = _open_day(PRO)
        at = _combine(day, SIX_SLOTS[3])
        services.add_time_off(PRO, at - timedelta(minutes=1), at + timedelta(minutes=1), "check")
        offered = services.open_slots(PRO, day)
        assert len(offered) == len(SIX_SLOTS) - 1
        assert SIX_SLOTS[3] not in [o["slot_time"].strftime("%H:%M") for o in offered]

    def test_the_subtraction_holds_on_all_seven_weekdays(self, roster):
        # Assertion 5, THE ONE THAT MATTERS: the same subtraction on every
        # weekday — the phase-4 bug passed on Thursday and failed on six
        # other days.
        _, service = roster
        for offset in range(1, 8):
            day = ist_today() + timedelta(days=offset)
            base = services.open_slots(PRO, day)
            assert len(base) == len(SIX_SLOTS), f"day {day} offered nothing to test with"
            pick = base[0]
            Booking.objects.create(
                seeker_id=SEEKER, consultant_id=PRO, service_id=service.id,
                starts_at=pick["starts_at"], duration_mins=20,
                amount_paise=service.price_paise, mode="call", status="confirmed",
            )
            after = services.open_slots(PRO, day)
            assert len(after) == len(base) - 1
            assert pick["starts_at"] not in [o["starts_at"] for o in after]

    def test_pending_consultant_has_no_slots_at_all(self, roster):
        # Assertion 6: the approval gate, checked where it is enforced.
        _availability(PENDING_PRO)
        _service(PENDING_PRO)
        day = _open_day(PRO)
        assert services.open_slots(PENDING_PRO, day) == []
        # And approval restores them — both directions.
        Consultant.objects.filter(profile_id=PENDING_PRO).update(status="approved")
        assert len(services.open_slots(PENDING_PRO, day)) == len(SIX_SLOTS)

    def test_the_horizon_holds_at_both_ends(self, roster):
        # Assertion 7.
        assert services.open_slots(PRO, ist_today() + timedelta(days=15)) == []
        assert services.open_slots(PRO, ist_today() - timedelta(days=1)) == []

    def test_today_offers_only_future_slots(self, roster):
        today = ist_today()
        offered = services.open_slots(PRO, today)
        assert all(o["starts_at"] > timezone.now() for o in offered)


# ── availability endpoints (007's grid) ──────────────────────────────────────


@pytest.mark.django_db
class TestAvailabilityEndpoints:
    def test_grid_round_trip_and_idempotency(self, api_client, pro_token, roster):
        url = f"/v1/consultants/{PRO}/availability/set/"
        on = api_client.post(url, data={"weekday": 2, "slot": "10:00", "open": True},
                             format="json", **auth(pro_token))
        assert on.status_code == 200
        again = api_client.post(url, data={"weekday": 2, "slot": "10:00", "open": True},
                                format="json", **auth(pro_token))
        assert again.status_code == 200  # a double-tap is a no-op, not an error
        rows = api_client.get(f"/v1/consultants/{PRO}/availability/").json()
        assert {"weekday": 2, "slot_time": "10:00:00"} in [
            {"weekday": r["weekday"], "slot_time": r["slot_time"]} for r in rows
        ]
        off = api_client.post(url, data={"weekday": 2, "slot": "10:00", "open": False},
                              format="json", **auth(pro_token))
        assert off.status_code == 200
        rows = api_client.get(f"/v1/consultants/{PRO}/availability/").json()
        assert all(not (r["weekday"] == 2 and r["slot_time"].startswith("10:00"))
                   for r in rows)

    def test_write_is_owner_scoped(self, api_client, seeker_token, roster):
        url = f"/v1/consultants/{PRO}/availability/set/"
        response = api_client.post(url, data={"weekday": 2, "slot": "10:00", "open": True},
                                   format="json", **auth(seeker_token))
        assert response.status_code == 403
        assert ConsultantAvailability.objects.filter(
            consultant_id=PRO, weekday=2, slot_time=dtime(10, 0)
        ).count() == 0

    def test_read_is_approved_or_own(self, api_client, sign_hs256, hs256_mode, roster):
        # An approved consultant's grid is public (007's policy); a pending
        # consultant's grid is invisible to strangers but visible to them.
        assert api_client.get(f"/v1/consultants/{PRO}/availability/").json() != []
        _availability(PENDING_PRO, slots=["09:30"], weekdays=[1])
        assert api_client.get(f"/v1/consultants/{PENDING_PRO}/availability/").json() == []
        token = sign_hs256(claims=make_claims(sub=PENDING_PRO, role="consultant"))
        own = api_client.get(f"/v1/consultants/{PENDING_PRO}/availability/", **auth(token))
        assert own.json() == [{"weekday": 1, "slot_time": "09:30:00"}]


# ── listings and profiles (007's view) ───────────────────────────────────────


@pytest.mark.django_db
class TestListings:
    def test_only_approved_consultants_are_listed(self, api_client, roster):
        rows = api_client.get("/v1/consultants/").json()
        assert [r["profile_id"] for r in rows] == [PRO]

    def test_unapproved_is_invisible_not_forbidden(self, api_client, sign_hs256,
                                                   hs256_mode, roster):
        detail = api_client.get(f"/v1/consultants/{PENDING_PRO}/")
        assert detail.status_code == 404
        assert detail.json()["reason"] == "not_found"
        # But the applicant reads their own row through /me/.
        token = sign_hs256(claims=make_claims(sub=PENDING_PRO, role="consultant"))
        me = api_client.get("/v1/consultants/me/", **auth(token))
        assert me.status_code == 200
        assert me.json()["status"] == "pending"

    def test_listing_row_carries_prices_off_the_bands(self, api_client, roster):
        (row,) = api_client.get("/v1/consultants/").json()
        assert row["name"] == "Ritu Kashyap"
        assert row["rating_avg_cache"] is None  # nobody has reviewed them yet
        assert row["rating_count_cache"] == 0
        by_duration = {s["duration_mins"]: s["price_paise"] for s in row["services"]
                       if s["billing"] == "fixed"}
        assert by_duration == {20: 74900}  # tier 1, the PRD's price, not 75000

    def test_ordering_is_rating_desc_nulls_last(self, api_client, money_tables, catalogue):
        from django.db import connection
        from decimal import Decimal

        with connection.cursor() as cursor:
            for pid, name in ((PRO, "Ritu Kashyap"), (PENDING_PRO, "Wannabe Pro")):
                _profile(cursor, pid, name)
        Consultant.objects.create(profile_id=PRO, category="Astrologer", status="approved",
                                  rating_avg_cache=Decimal("4.5"), rating_count_cache=3)
        Consultant.objects.create(profile_id=PENDING_PRO, category="Astrologer",
                                  status="approved")
        rows = api_client.get("/v1/consultants/").json()
        assert [r["profile_id"] for r in rows] == [PRO, PENDING_PRO]

    def test_services_endpoint_matches_the_client_shape(self, api_client, roster):
        rows = api_client.get(f"/v1/consultants/{PRO}/services/").json()
        assert len(rows) == 1
        assert set(rows[0]) == {
            "id", "consultant_id", "band_id", "mode", "billing", "duration_mins",
            "price_paise", "active", "sort",
        }
        pending = api_client.get(f"/v1/consultants/{PENDING_PRO}/services/")
        assert pending.json() == []


# ── the application (007's insert grant; 009 assertions 8-9) ─────────────────


@pytest.mark.django_db
class TestApply:
    def test_application_lands_pending_with_band_priced_services(
        self, api_client, sign_hs256, hs256_mode, money_tables, catalogue
    ):
        from django.db import connection

        with connection.cursor() as cursor:
            _profile(cursor, SEEKER, "Tara Verma")
        token = sign_hs256(claims=make_claims(sub=SEEKER))
        response = api_client.post(
            "/v1/consultants/apply/",
            data={
                "category": "Astrologer",
                "specialization": "Vedic · Career",
                "languages": ["Hindi", "English"],
                "experience_yrs": 12,
                "bio": "I read charts the way a doctor reads a scan.",
                "credentials": ["Jyotish Visharad"],
                "tier": 5,
                # Rule 3 probes: none of these can move, whatever the body says.
                "status": "approved",
                "verified": True,
                "price_paise": 100,
                "profile_id": str(uuid.uuid4()),
            },
            format="json",
            **auth(token),
        )
        assert response.status_code == 201
        assert response.json()["status"] == "pending"
        row = Consultant.objects.get(profile_id=SEEKER)
        assert row.status == "pending"  # assertion 8: a consultant cannot
        assert row.verified is False    # approve themselves — structurally
        assert row.experience_yrs == 12
        assert row.languages == ["Hindi", "English"]
        services_rows = list(ConsultantService.objects.filter(consultant_id=SEEKER))
        assert len(services_rows) == 4  # 15/20/30 fixed + per-minute, mode call
        assert {s.mode for s in services_rows} == {"call"}
        prices = {(s.billing, s.duration_mins): s.price_paise for s in services_rows}
        # Assertion 9: priced off the band, never the typed 100.
        assert prices == {
            ("fixed", 15): 112000,
            ("fixed", 20): 149900,
            ("fixed", 30): 225000,
            ("per_minute", 1): 7500,
        }

    def test_second_application_is_a_409(self, api_client, sign_hs256, hs256_mode,
                                         money_tables, catalogue):
        from django.db import connection

        with connection.cursor() as cursor:
            _profile(cursor, SEEKER, "Tara Verma")
        token = sign_hs256(claims=make_claims(sub=SEEKER))
        body = {"category": "Astrologer", "specialization": "s", "bio": "b", "tier": 2}
        first = api_client.post("/v1/consultants/apply/", data=body, format="json", **auth(token))
        assert first.status_code == 201
        second = api_client.post("/v1/consultants/apply/", data=body, format="json", **auth(token))
        assert second.status_code == 409
        assert second.json()["reason"] == "already_applied"
        assert Consultant.objects.count() == 1

    def test_unavailable_tier_refused(self, api_client, sign_hs256, hs256_mode,
                                      money_tables, catalogue):
        # A tier whose bands are all withdrawn is not choosable — the
        # service's refusal, below the serializer's 1-6 shape check.
        PriceBand.objects.filter(tier=5).update(active=False)
        token = sign_hs256(claims=make_claims(sub=SEEKER))
        response = api_client.post(
            "/v1/consultants/apply/",
            data={"category": "Astrologer", "tier": 5},
            format="json",
            **auth(token),
        )
        assert response.status_code == 403
        assert response.json()["message"] == "That price band is not available."
        assert Consultant.objects.count() == 0
        assert ConsultantService.objects.count() == 0

    def test_me_is_404_for_a_non_consultant(self, api_client, seeker_token, money_tables):
        response = api_client.get("/v1/consultants/me/", **auth(seeker_token))
        assert response.status_code == 404
        assert response.json()["reason"] == "not_consultant"


# ── the booking transaction: 012 check assertions 1-5 ────────────────────────


def _book(api_client, token, consultant_id, service_id, starts_at):
    return api_client.post(
        "/v1/consultants/bookings/",
        data={
            "consultant_id": str(consultant_id),
            "service_id": str(service_id),
            "starts_at": starts_at.isoformat(),
        },
        format="json",
        **auth(token),
    )


@pytest.mark.django_db
class TestBookSession:
    def test_one_booking_is_one_transaction(self, api_client, seeker_token, roster):
        # Assertion 1: one order, one line, one booking, one debit, one
        # earnings row, and a balance short by exactly the SERVER's price.
        _, service = roster
        _fund(SEEKER, service.price_paise * 3)
        before = _counts(SEEKER)
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        response = _book(api_client, seeker_token, PRO, service.id, at)
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["balance_paise"] == service.price_paise * 2
        after = _counts(SEEKER)
        assert after["balance"] == before["balance"] - service.price_paise
        assert after["ledger"] == before["ledger"] + 1
        assert after["orders"] == before["orders"] + 1
        assert after["bookings"] == before["bookings"] + 1

        booking = Booking.objects.get(pk=body["booking_id"])
        assert booking.status == "pending"  # the claim holds the slot
        assert booking.amount_paise == service.price_paise  # frozen copy
        assert booking.duration_mins == 20
        assert str(booking.order_id) == body["order_id"]

        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select title, unit_price_paise from order_items where order_id = %s",
                [body["order_id"]],
            )
            (title, unit), = cursor.fetchall()
            assert title == "Ritu Kashyap · 20 min"
            assert unit == service.price_paise
            cursor.execute(
                "select delta_paise, kind, ref_type from ledger where ref_id = %s"
                " and ref_type = 'order'",
                [body["order_id"]],
            )
            (delta, kind, ref_type), = cursor.fetchall()
            assert delta == -service.price_paise

    def test_earnings_row_is_gross_fee_net_at_1800_bps(self, api_client, seeker_token, roster):
        # Assertion 2, on this row and as the table-wide invariant.
        _, service = roster
        _fund(SEEKER, service.price_paise)
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        body = _book(api_client, seeker_token, PRO, service.id, at).json()
        row = EarningsLedger.objects.get(booking_id=body["booking_id"])
        expected_fee = services.fee_paise(service.price_paise)
        assert row.gross_paise == service.price_paise
        assert row.fee_bps == 1800
        assert row.fee_paise == expected_fee
        assert row.net_paise == service.price_paise - expected_fee
        assert row.kind == "Tara Verma · 20 min"  # 013 fix 4: the consultant's
        # book names the SEEKER.
        for r in EarningsLedger.objects.all():
            assert r.net_paise == r.gross_paise - r.fee_paise

    def test_the_same_slot_twice_is_refused_by_name_and_writes_nothing(
        self, api_client, seeker_token, roster
    ):
        # Assertion 3 (the pre-check half of done-condition 1): the second
        # caller arrives late enough to see the slot gone, and the one-slot
        # precheck refuses it — nothing written. The 23505 half, where both
        # pass the check and the unique index decides, is the race test.
        _, service = roster
        _fund(SEEKER, service.price_paise * 2)
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        first = _book(api_client, seeker_token, PRO, service.id, at)
        assert first.json()["ok"] is True
        before = _counts(SEEKER)
        second = _book(api_client, seeker_token, PRO, service.id, at)
        body = second.json()
        assert body["ok"] is False
        assert body["reason"] == "That time is no longer open. Pick another."
        after = _counts(SEEKER)
        assert after == before  # NO ORPHANED DEBIT, no leftover order

    def test_short_balance_is_refused_in_the_interface_words(self, api_client,
                                                             seeker_token, roster):
        # Assertion 4.
        _, service = roster
        _fund(SEEKER, service.price_paise - 1)  # one paise short
        at2 = _combine(_open_day(PRO, offset=1), SIX_SLOTS[1])
        before = _counts(SEEKER)
        response = _book(api_client, seeker_token, PRO, service.id, at2)
        body = response.json()
        assert body["ok"] is False
        assert body["reason"] == REFUSAL_SHORT_BALANCE
        assert body["balance_paise"] == service.price_paise - 1
        after = _counts(SEEKER)
        assert after == before
        # And the slot stays on offer — a refusal held nothing.
        assert at2 in [o["starts_at"] for o in services.open_slots(PRO, at2.astimezone(
            services.IST).date())]

    def test_no_wallet_is_refused_by_name(self, api_client, sign_hs256, hs256_mode,
                                          roster):
        token = sign_hs256(claims=make_claims(sub=ADMIN))  # no wallet, no profile
        from django.db import connection

        with connection.cursor() as cursor:
            _profile(cursor, ADMIN, "Nobody")
        _, service = roster
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        body = _book(api_client, token, PRO, service.id, at).json()
        assert body == {"ok": False, "reason": "No wallet on this account."}

    def test_booking_yourself_is_refused(self, api_client, pro_token, roster):
        _, service = roster
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        body = _book(api_client, pro_token, PRO, service.id, at).json()
        assert body == {"ok": False, "reason": "You cannot book yourself."}

    def test_pending_consultants_service_is_not_available(self, api_client,
                                                          seeker_token, roster):
        _availability(PENDING_PRO, slots=["09:30"], weekdays=[1])
        pending_service = _service(PENDING_PRO)
        day = ist_today() + timedelta(days=(1 - services.dow_of(ist_today())) % 7 or 7)
        at = _combine(day, "09:30")
        body = _book(api_client, seeker_token, PENDING_PRO, pending_service.id, at).json()
        assert body == {"ok": False, "reason": REFUSAL_NOT_AVAILABLE}

    def test_per_minute_is_refused_by_name(self, api_client, seeker_token, roster):
        # Assertion 8: refused BY NAME, not merely refused — any unrelated
        # refusal would satisfy a bare `not ok` and prove nothing.
        _fund(SEEKER, 100000)
        per_minute = _service(PRO, billing="per_minute", duration_mins=1, mode="live")
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        body = _book(api_client, seeker_token, PRO, per_minute.id, at).json()
        assert body["ok"] is False
        assert body["reason"] == REFUSAL_NOT_BOOKABLE
        assert Booking.objects.count() == 0

    def test_zero_price_is_refused_by_name(self, api_client, seeker_token, roster):
        # 013 fix 3: a free service is a catalogue mistake, not a free session.
        _fund(SEEKER, 100000)
        free = _service(PRO, price=0, mode="chat")
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        body = _book(api_client, seeker_token, PRO, free.id, at).json()
        assert body["ok"] is False
        assert body["reason"] == "That session is not priced yet."
        assert Booking.objects.count() == 0

    def test_inactive_service_is_not_available(self, api_client, seeker_token, roster):
        _fund(SEEKER, 100000)
        inactive = _service(PRO, active=False, mode="chat")
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        body = _book(api_client, seeker_token, PRO, inactive.id, at).json()
        assert body["ok"] is False
        assert body["reason"] == REFUSAL_NOT_AVAILABLE

    def test_starts_at_not_on_offer_is_refused(self, api_client, seeker_token, roster):
        _, service = roster
        _fund(SEEKER, 100000)
        not_open = _combine(_open_day(PRO, offset=1), "10:15")  # no such rule
        body = _book(api_client, seeker_token, PRO, service.id, not_open).json()
        assert body["ok"] is False
        assert body["reason"] == "That time is no longer open. Pick another."

    def test_a_claim_moves_the_open_slots(self, api_client, seeker_token, roster):
        # 009 assertion 2 through the money path: the claim is at pending.
        _, service = roster
        _fund(SEEKER, service.price_paise)
        day = _open_day(PRO)
        at = _combine(day, SIX_SLOTS[2])
        assert at in [o["starts_at"] for o in services.open_slots(PRO, day)]
        _book(api_client, seeker_token, PRO, service.id, at)
        assert at not in [o["starts_at"] for o in services.open_slots(PRO, day)]

    def test_create_replays_on_idempotency_key(self, api_client, seeker_token, roster):
        _, service = roster
        _fund(SEEKER, service.price_paise * 2)
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        key = str(uuid.uuid4())
        first = api_client.post(
            "/v1/consultants/bookings/",
            data={"consultant_id": str(PRO), "service_id": str(service.id),
                  "starts_at": at.isoformat()},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
            **auth(seeker_token),
        )
        second = api_client.post(
            "/v1/consultants/bookings/",
            data={"consultant_id": str(PRO), "service_id": str(service.id),
                  "starts_at": at.isoformat()},
            format="json",
            HTTP_IDEMPOTENCY_KEY=key,
            **auth(seeker_token),
        )
        assert first.status_code == 200 and second.status_code == 200
        assert second["Idempotency-Replayed"] == "true"
        assert first.json() == second.json()
        assert Booking.objects.count() == 1  # one booking, not two


# ── the reversing credit: 012 check assertions 5-7, 10 ───────────────────────


@pytest.mark.django_db
class TestDeclineReverses:
    def _booked(self, api_client, seeker_token, roster, slot=0, offset=1):
        _, service = roster
        _fund(SEEKER, service.price_paise * 3)
        at = _combine(_open_day(PRO, offset=offset), SIX_SLOTS[slot])
        body = _book(api_client, seeker_token, PRO, service.id, at).json()
        assert body["ok"] is True
        return body, at

    def test_decline_restores_the_balance_via_a_new_row(self, api_client,
                                                        seeker_token, pro_token, roster):
        # Assertion 5: the original debit stands untouched; both books get a
        # NEW row; the order flips to refunded; the slot frees.
        body, at = self._booked(api_client, seeker_token, roster)
        order_id, booking_id = body["order_id"], body["booking_id"]
        price = Booking.objects.get(pk=booking_id).amount_paise
        before = _counts(SEEKER)
        earn0 = EarningsLedger.objects.filter(consultant_id=PRO).count()

        response = api_client.post(
            f"/v1/consultants/bookings/{booking_id}/decide/",
            data={"status": "declined"}, format="json", **auth(pro_token),
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True, "status": "declined", "reversed": True}

        after = _counts(SEEKER)
        assert after["balance"] == before["balance"] + price
        assert after["ledger"] == before["ledger"] + 1
        # The reversing row is a full credit against the order...
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select delta_paise, ref_type from ledger where ref_id = %s"
                " and ref_type = 'refund'",
                [order_id],
            )
            (delta, ref_type), = cursor.fetchall()
            assert delta == price
            # ...the original debit is exactly the row it was (append-only)...
            cursor.execute(
                "select count(*) from ledger where ref_id = %s and ref_type = 'order'"
                " and delta_paise = %s",
                [order_id, -price],
            )
            assert cursor.fetchone()[0] == 1
            # ...and the order is refunded.
            cursor.execute("select status from orders where id = %s", [order_id])
            assert cursor.fetchone()[0] == "refunded"

        # The consultant's book nets to zero, by a second row, not an edit.
        assert EarningsLedger.objects.filter(consultant_id=PRO).count() == earn0 + 1
        rows = EarningsLedger.objects.filter(booking_id=booking_id)
        assert rows.count() == 2
        assert sum(r.net_paise for r in rows) == 0
        assert rows.get(gross_paise__lt=0).kind == "Reversed · declined"
        # And the slot is free again (009 assertion 3 with money attached).
        day = at.astimezone(services.IST).date()
        assert at in [o["starts_at"] for o in services.open_slots(PRO, day)]

    def test_accept_holds_the_money_and_the_book(self, api_client, seeker_token,
                                                 pro_token, roster):
        _, service = roster
        body, _ = self._booked(api_client, seeker_token, roster)
        response = api_client.post(
            f"/v1/consultants/bookings/{body['booking_id']}/decide/",
            data={"status": "confirmed"}, format="json", **auth(pro_token),
        )
        assert response.json() == {"ok": True, "status": "confirmed", "reversed": False}
        booking = Booking.objects.get(pk=body["booking_id"])
        assert booking.status == "confirmed"
        assert EarningsLedger.objects.filter(booking_id=booking.id).count() == 1
        assert _counts(SEEKER)["balance"] == service.price_paise * 2

    def test_decide_is_the_consultants_pending_edge_only(self, api_client,
                                                         seeker_token, pro_token,
                                                         second_seeker_token, roster):
        body, _ = self._booked(api_client, seeker_token, roster)
        url = f"/v1/consultants/bookings/{body['booking_id']}/decide/"

        seeker = api_client.post(url, data={"status": "confirmed"}, format="json",
                                 **auth(seeker_token))
        assert seeker.status_code == 403  # not the consultant's row
        stranger = api_client.post(url, data={"status": "declined"}, format="json",
                                   **auth(second_seeker_token))
        assert stranger.status_code == 403

        api_client.post(url, data={"status": "confirmed"}, format="json", **auth(pro_token))
        # Resolved bookings cannot be reached back into: confirmed -> declined
        # is not an edge of the state machine (008's policy, verbatim).
        again = api_client.post(url, data={"status": "declined"}, format="json",
                                **auth(pro_token))
        assert again.status_code == 403
        assert Booking.objects.get(pk=body["booking_id"]).status == "confirmed"
        # completed is not a client decision at all
        api_client.post(url, data={"status": "completed"}, format="json", **auth(pro_token))
        booking = Booking.objects.get(pk=body["booking_id"])
        assert booking.status == "confirmed"
        assert EarningsLedger.objects.filter(booking_id=booking.id).count() == 1

    def test_reversing_twice_credits_once(self, api_client, seeker_token, roster):
        # Assertion 6: the retry is a no-op, and the refund row itself is the
        # guard — not a flag column.
        body, _ = self._booked(api_client, seeker_token, roster)
        first = services.booking_reverse(body["booking_id"], "declined")
        assert first == {"ok": True, "reversed": True,
                         "amount_paise": Booking.objects.get(pk=body["booking_id"]).amount_paise}
        before = _counts(SEEKER)
        second = services.booking_reverse(body["booking_id"], "declined")
        assert second == {"ok": True, "reversed": False}
        assert _counts(SEEKER) == before
        assert EarningsLedger.objects.filter(booking_id=body["booking_id"]).count() == 2

    def test_seeded_booking_with_no_order_is_not_a_failure(self, roster):
        _, service = roster
        booking = Booking.objects.create(
            seeker_id=SEEKER, consultant_id=PRO, service_id=service.id,
            starts_at=_combine(_open_day(PRO), SIX_SLOTS[0]), duration_mins=20,
            amount_paise=service.price_paise, mode="call", status="pending",
            order_id=None,
        )
        assert services.booking_reverse(booking.id, "no answer") == {
            "ok": True, "reversed": False,
        }

    def test_both_books_are_append_only(self, api_client, seeker_token, roster):
        # Assertion 7. earnings_ledger carries the refusal in the model layer
        # (its prod trigger's parity); the ledger fixture reproduces
        # refuse_mutation for real.
        from django.db import IntegrityError as DBIntegrityError

        body, _ = self._booked(api_client, seeker_token, roster)
        row = EarningsLedger.objects.get(booking_id=body["booking_id"])
        with pytest.raises(DBIntegrityError):
            row.save()
        with pytest.raises(DBIntegrityError):
            row.delete()
        from django.db import connection

        with connection.cursor() as cursor:
            with pytest.raises(Exception):
                cursor.execute("update ledger set delta_paise = 1")
            with pytest.raises(Exception):
                cursor.execute("delete from ledger")

    def test_reversal_without_a_seeker_wallet_raises(self, api_client,
                                                     seeker_token, roster):
        body, _ = self._booked(api_client, seeker_token, roster)
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("delete from wallets where profile_id = %s", [str(SEEKER)])
        with pytest.raises(ValueError, match="no seeker wallet"):
            services.booking_reverse(body["booking_id"], "declined")


# ── bookings_view: the read side and its permission matrix ───────────────────


@pytest.mark.django_db
class TestBookingsView:
    def _booked(self, api_client, seeker_token, roster):
        _, service = roster
        _fund(SEEKER, service.price_paise)
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        body = _book(api_client, seeker_token, PRO, service.id, at).json()
        return body["booking_id"]

    def test_consultants_queue_carries_the_seekers_birth_details(
        self, api_client, seeker_token, pro_token, roster
    ):
        bid = self._booked(api_client, seeker_token, roster)
        rows = api_client.get(f"/v1/consultants/{PRO}/bookings/", **auth(pro_token)).json()
        (row,) = rows
        assert row["id"] == bid
        assert row["seeker_name"] == "Tara Verma"
        assert row["birth_date"] == "1994-03-12"  # the 010 view's deliberate carry
        assert row["birth_time"] == "07:40"
        assert row["birth_place"] == "Jaipur"
        assert row["consultant_name"] == "Ritu Kashyap"
        assert row["status"] == "pending"

    def test_seekers_own_list_carries_the_consultants_name(
        self, api_client, seeker_token, roster
    ):
        bid = self._booked(api_client, seeker_token, roster)
        rows = api_client.get("/v1/consultants/bookings/mine/", **auth(seeker_token)).json()
        assert [r["id"] for r in rows] == [bid]
        assert rows[0]["consultant_name"] == "Ritu Kashyap"

    def test_queue_is_owner_scoped(self, api_client, seeker_token, roster):
        self._booked(api_client, seeker_token, roster)
        response = api_client.get(f"/v1/consultants/{PRO}/bookings/", **auth(seeker_token))
        assert response.status_code == 403  # the seeker has their own route
        anonymous = api_client.get(f"/v1/consultants/{PRO}/bookings/")
        assert anonymous.status_code == 401

    def test_earnings_are_owner_scoped(self, api_client, seeker_token, pro_token, roster):
        self._booked(api_client, seeker_token, roster)
        own = api_client.get(f"/v1/consultants/{PRO}/earnings/", **auth(pro_token))
        assert own.status_code == 200
        assert len(own.json()) == 1
        row = own.json()[0]
        assert row["gross_paise"] == row["net_paise"] + row["fee_paise"]
        assert row["fee_bps"] == FEE_BPS
        stranger = api_client.get(f"/v1/consultants/{PRO}/earnings/", **auth(seeker_token))
        assert stranger.status_code == 403
        anonymous = api_client.get(f"/v1/consultants/{PRO}/earnings/")
        assert anonymous.status_code == 401

    def test_a_declined_session_reads_as_two_rows_that_cancel(
        self, api_client, seeker_token, pro_token, roster
    ):
        bid = self._booked(api_client, seeker_token, roster)
        api_client.post(f"/v1/consultants/bookings/{bid}/decide/",
                        data={"status": "declined"}, format="json", **auth(pro_token))
        rows = api_client.get(f"/v1/consultants/{PRO}/earnings/", **auth(pro_token)).json()
        assert len(rows) == 2
        assert sum(r["net_paise"] for r in rows) == 0
        kinds = [r["kind"] for r in rows]
        assert any(k.startswith("Tara Verma") for k in kinds)
        assert any(k.startswith("Reversed ·") for k in kinds)


# ── races with real threads: done-condition 1 and 013's whole point ──────────


def _fire_book(token, body, barrier, results):
    from django.db import connection

    connection.close()
    client = Client()
    barrier.wait(timeout=10)
    response = client.post(
        "/v1/consultants/bookings/",
        data=json.dumps(body),
        content_type="application/json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )
    results.append(response)


@pytest.mark.django_db(transaction=True)
class TestBookingRace:
    """012_check's header: the 23505 path needs two CONNECTIONS, fired
    SIMULTANEOUSLY. One returns ok:true, the other 'Someone just took that
    time. Pick another.', and the refused one leaves no order, no booking
    and no ledger row."""

    def test_two_seekers_one_slot_exactly_one_holds(self, hs256_mode, sign_hs256, roster):
        _, service = roster
        _fund(SEEKER, service.price_paise)
        _fund(SECOND_SEEKER, service.price_paise)
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        tokens = [
            sign_hs256(claims=make_claims(sub=SEEKER)),
            sign_hs256(claims=make_claims(sub=SECOND_SEEKER)),
        ]
        body = {
            "consultant_id": str(PRO),
            "service_id": str(service.id),
            "starts_at": at.isoformat(),
        }
        barrier, results = threading.Barrier(2), []
        threads = [
            threading.Thread(target=_fire_book, args=(token, body, barrier, results))
            for token in tokens
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert len(results) == 2

        bodies = [r.json() for r in results]
        winners = [b for b in bodies if b.get("ok")]
        losers = [b for b in bodies if not b.get("ok")]
        assert len(winners) == 1 and len(losers) == 1
        assert losers[0]["reason"] == REFUSAL_SLOT_TAKEN

        # Exactly one of everything, on both books.
        assert Booking.objects.count() == 1
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute("select count(*) from orders")
            assert cursor.fetchone()[0] == 1
            cursor.execute("select count(*) from order_items")
            assert cursor.fetchone()[0] == 1
            cursor.execute("select count(*) from ledger where ref_type = 'order'")
            assert cursor.fetchone()[0] == 1
        assert EarningsLedger.objects.count() == 1
        # The loser's wallet is untouched; the winner's is spent.
        booking = Booking.objects.get()
        balances = {}
        for seeker in (SEEKER, SECOND_SEEKER):
            with connection.cursor() as cursor:
                cursor.execute(
                    "select balance_paise from wallets where profile_id = %s",
                    [str(seeker)],
                )
                balances[seeker] = cursor.fetchone()[0]
        winner_sub = str(booking.seeker_id)
        loser_sub = SECOND_SEEKER if winner_sub == SEEKER else SEEKER
        assert balances[winner_sub] == 0
        assert balances[loser_sub] == service.price_paise

    def test_two_reversals_of_one_booking_credit_once(self, hs256_mode, sign_hs256,
                                                      api_client, roster):
        # 012 check assertion 10 + 013 fix 1: the guarantee is the unique
        # index, not a check — two concurrent reversals both read no refund
        # row and both try to credit; exactly one wins.
        _, service = roster
        _fund(SEEKER, service.price_paise)
        token = sign_hs256(claims=make_claims(sub=SEEKER))
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        booked = _book(api_client, token, PRO, service.id, at).json()
        assert booked["ok"] is True
        booking_id = booked["booking_id"]

        barrier, results = threading.Barrier(2), []

        def fire():
            from django.db import connection

            connection.close()
            barrier.wait(timeout=10)
            results.append(services.booking_reverse(booking_id, "declined"))

        threads = [threading.Thread(target=fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert sorted(r["reversed"] for r in results) == [False, True]

        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "select count(*) from ledger where ref_type = 'refund'"
                " and ref_id = %s",
                [booked["order_id"]],
            )
            assert cursor.fetchone()[0] == 1
            cursor.execute("select status from orders where id = %s", [booked["order_id"]])
            assert cursor.fetchone()[0] == "refunded"
            cursor.execute(
                "select balance_paise from wallets where profile_id = %s", [str(SEEKER)]
            )
            assert cursor.fetchone()[0] == service.price_paise  # credited exactly once
        assert EarningsLedger.objects.filter(booking_id=booking_id).count() == 2

    def test_two_decides_of_one_booking_one_wins(self, hs256_mode, sign_hs256,
                                                 api_client, roster):
        # 018 fix 1's shape, applied where bookings live: the conditional
        # UPDATE decides the race; there is one winner and no double hold.
        _, service = roster
        _fund(SEEKER, service.price_paise)
        seeker_token = sign_hs256(claims=make_claims(sub=SEEKER))
        pro_token = sign_hs256(claims=make_claims(sub=PRO, role="consultant"))
        at = _combine(_open_day(PRO), SIX_SLOTS[0])
        booked = _book(api_client, seeker_token, PRO, service.id, at).json()
        booking_id = booked["booking_id"]

        barrier, results = threading.Barrier(2), []

        def fire():
            from django.db import connection

            connection.close()
            client = Client()
            barrier.wait(timeout=10)
            response = client.post(
                f"/v1/consultants/bookings/{booking_id}/decide/",
                data=json.dumps({"status": "confirmed"}),
                content_type="application/json",
                HTTP_AUTHORIZATION=f"Bearer {pro_token}",
            )
            results.append(response)

        threads = [threading.Thread(target=fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)
        assert sorted(r.status_code for r in results) == [200, 403]
        assert Booking.objects.get(pk=booking_id).status == "confirmed"
        assert EarningsLedger.objects.filter(booking_id=booking_id).count() == 1
