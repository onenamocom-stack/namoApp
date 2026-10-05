import logging
from datetime import datetime

from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.status import HTTP_201_CREATED, HTTP_409_CONFLICT

from apps.core.views import refusal_body

from . import earnings as earnings_reads
from . import payout_details
from . import services
from .models import Booking
from .services import AlreadyApplied

logger = logging.getLogger(__name__)


class ServiceRow(serializers.Serializer):
    """A consultant_services row, snake_case exactly as the client reads it
    (shape() in src/lib/consultants.js)."""

    id = serializers.UUIDField()
    consultant_id = serializers.UUIDField()
    band_id = serializers.UUIDField()
    mode = serializers.CharField()
    billing = serializers.CharField()
    duration_mins = serializers.IntegerField()
    price_paise = serializers.IntegerField()
    active = serializers.BooleanField()
    sort = serializers.IntegerField()


def _consultant_row(consultant, service_rows):
    """The consultants_public row plus its active prices — what shape() in
    src/lib/consultants.js consumes (initials and the fixed/perMinute split
    stay client-side rendering, exactly as the current lib's docstring
    says)."""
    return {
        "profile_id": str(consultant.profile_id),
        "name": consultant.name,  # the 007 view's join
        "category": consultant.category,
        "specialization": consultant.specialization or "",
        "languages": consultant.languages or [],
        "experience_yrs": consultant.experience_yrs,
        "bio": consultant.bio or "",
        "credentials": consultant.credentials or [],
        # Tags are for search and the profile, so they are public. The
        # DEGREE TEXT is public too — it is a credential, and a credential
        # nobody can read is not one. `degree_asset_id` is deliberately
        # absent from both shapes: the scan of a certificate carries a name,
        # a date of birth and a registration number, and its only reader is
        # the console operator deciding the application.
        "tags": consultant.tags or [],
        "degree": consultant.degree or "",
        "verified": consultant.verified,
        # Presence, derived server-side — never the client's arithmetic on a
        # last_seen timestamp, because two devices with two clocks would
        # disagree about the same dot.
        "online": bool(getattr(consultant, "online", False)),
        "rating_avg_cache": consultant.rating_avg_cache,
        "rating_count_cache": consultant.rating_count_cache,
        # Paid sessions given — the milestone badges read it (3 Oct 2026).
        "sessions_done": getattr(consultant, "sessions_done", 0),
        "services": service_rows,
    }


def _service_rows(services_qs):
    return [ServiceRow(row).data for row in services_qs]


# ── listings and profiles (007's view) ───────────────────────────────────────


@api_view(["GET"])
@permission_classes([AllowAny])
def list_consultants(request):
    """The approved consultants, best rating first, NULLs last — the same
    order the client's PostgREST query asked for. Anonymous, per the view's
    grant to anon and authenticated (007)."""
    # Two queries, not two per consultant (5 Oct 2026). The database is in
    # Singapore and the API in Mumbai, so each query is a round trip abroad;
    # the old loop made the list slower with every consultant approved.
    # Every row here is approved, so `active_services`' "pending is
    # visible to its owner" branch cannot apply and one IN query is the same
    # answer.
    consultants = list(services.public_consultants())
    by_owner = services.active_services_for([c.profile_id for c in consultants])
    return Response([
        _consultant_row(c, _service_rows(by_owner.get(c.profile_id, [])))
        for c in consultants
    ])


@api_view(["GET"])
@permission_classes([AllowAny])
def detail(request, consultant_id):
    """One consultant, or a 404 that is also the answer for 'not approved
    yet' and 'blocked' — an unapproved consultant is invisible, not
    forbidden, and ids do not leak existence (007)."""
    consultant = services.public_consultant(consultant_id)
    if consultant is None:
        return Response(
            refusal_body("not_found", "That consultant is not available."), status=404
        )
    return Response(
        _consultant_row(
            consultant,
            _service_rows(services.active_services(consultant.profile_id)),
        )
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def service_list(request, consultant_id):
    """A consultant's active price list (007's services policy: approved, or
    the consultant's own while pending). Anyone else gets an empty list —
    RLS parity: the policy answers an empty set, not an error."""
    return Response(_service_rows(services.active_services(consultant_id, request.user.pk if request.user else None)))


# ── slots and availability (009) ─────────────────────────────────────────────


class SlotsQuery(serializers.Serializer):
    date = serializers.DateField()


@api_view(["GET"])
@permission_classes([AllowAny])
def slots(request, consultant_id):
    """The open slots for one consultant on one date — the one subtraction
    (009). Anonymous, per the RPC's grant to anon and authenticated; an
    unapproved consultant offers nothing, and a date outside the horizon
    returns an empty day rather than an error."""
    query = SlotsQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    offered = services.open_slots(consultant_id, query.validated_data["date"])
    return Response(
        [
            {"slot_time": o["slot_time"].strftime("%H:%M:%S"), "starts_at": o["starts_at"]}
            for o in offered
        ]
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def availability(request, consultant_id):
    """The 7 x 6 grid rules (007's policy: approved or own; anyone else gets
    an empty grid, RLS parity)."""
    consultant = services.my_consultant(consultant_id)
    if consultant is None or (
        consultant.status != "approved" and not _owns(request, consultant_id)
    ):
        return Response([])
    return Response(services.list_availability(consultant_id))


def _owns(request, consultant_id):
    return bool(
        request.user
        and request.user.is_authenticated
        and str(request.user.pk) == str(consultant_id)
    )


class AvailabilityInput(serializers.Serializer):
    """One cell of the grid, on or off — the whole write vocabulary (007:
    the write policy is own-row; there is deliberately no bulk shape)."""

    weekday = serializers.IntegerField(min_value=0, max_value=6)
    slot = serializers.RegexField(r"^\d{2}:\d{2}$")
    open = serializers.BooleanField()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_availability(request, consultant_id):
    """One INSERT or one DELETE (007). Own practice only — consultant-ness
    is the row, and the consultant_id in the URL is scoped to the caller,
    never the body (rule 4)."""
    if not _owns(request, consultant_id):
        return Response(
            refusal_body("forbidden", "That is not your practice."), status=403
        )
    serializer = AvailabilityInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    services.set_availability(
        consultant_id,
        data["weekday"],
        datetime.strptime(data["slot"], "%H:%M").time(),
        data["open"],
    )
    return Response({"ok": True})


# ── the caller's own consultant row (007's consultants_select_own) ───────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """The caller's own consultants row — pending included, it is THEIR row
    (007's two select policies OR together). A non-consultant gets a 404:
    not being a consultant is the common case, not an error. This is the
    bare-gateway read store.jsx's refreshConsultant does until the profile
    module lands; profiles-table ownership is unchanged by this module."""
    consultant = services.my_consultant(request.user.pk)
    if consultant is None:
        return Response(
            refusal_body("not_consultant", "No practice on this account."), status=404
        )
    return Response(
        {
            "profile_id": str(consultant.profile_id),
            "category": consultant.category,
            "specialization": consultant.specialization,
            "languages": consultant.languages or [],
            "experience_yrs": consultant.experience_yrs,
            "bio": consultant.bio,
            "credentials": consultant.credentials or [],
            "tags": consultant.tags or [],
            "degree": consultant.degree,
            "status": consultant.status,
            "verified": consultant.verified,
            "rating_avg_cache": consultant.rating_avg_cache,
            "rating_count_cache": consultant.rating_count_cache,
            "sessions_done": services.sessions_done(consultant.profile_id),
            "created_at": consultant.created_at,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_insights(request):
    """The caller's Insights tab (4 Oct 2026): last 7 days, their own posts
    with views, and products sold with their coupon. Consultants only."""
    from . import insights

    if services.my_consultant(request.user.pk) is None:
        return Response(
            refusal_body("not_consultant", "No practice on this account."), status=404
        )
    return Response(insights.insights(request.user.pk))


@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def my_payout_details(request):
    """The caller's PAN and bank account (payouts P2). GET never returns a
    full number; PUT replaces the details and sends them back for a check.
    The input is validated field by field so the form can point at the one
    that is wrong."""
    consultant = services.my_consultant(request.user.pk)
    if consultant is None:
        return Response(
            refusal_body("not_consultant", "No practice on this account."), status=404
        )
    if request.method == "GET":
        return Response(payout_details.read(consultant.profile_id))
    try:
        return Response(payout_details.save(consultant, request.data))
    except payout_details.Refused as exc:
        return Response(refusal_body("invalid", str(exc), field=exc.field), status=400)
    except payout_details.NotOpen:
        logger.error("payout details refused: PAYOUT_ENCRYPTION_KEY is not set")
        return Response(
            refusal_body("not_open", "Payout details cannot be saved yet. Try again later."),
            status=503,
        )


class ApplyInput(serializers.Serializer):
    """The application. EXACTLY 007's insert-grant columns minus profile_id
    (the JWT's, rule 3) plus the tier pick — no status, no verified, no
    price: the row lands pending and the services copy their prices off the
    band rows (009 check assertions 8 and 9 are structural here)."""

    category = serializers.CharField()
    specialization = serializers.CharField(allow_blank=True, required=False, default="")
    languages = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    experience_yrs = serializers.IntegerField(required=False, allow_null=True, default=None)
    bio = serializers.CharField(allow_blank=True, required=False, default="")
    credentials = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    tags = serializers.ListField(child=serializers.CharField(), required=False, default=list)
    degree = serializers.CharField(allow_blank=True, required=False, default="")
    # The asset id of a certificate the applicant already uploaded through
    # /v1/media/presign (kind "document"). A URL is not accepted and could
    # not be used: the file is in the private bucket and the console signs
    # its own link to read it.
    degree_asset_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    tier = serializers.IntegerField(min_value=1, max_value=6)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def apply(request):
    """The whole application in ONE transaction (rule 5): the consultants
    row and the tier's service rows land together or not at all. A second
    application is a 409 — the consultants primary key's refusal."""
    serializer = ApplyInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        consultant = services.apply(
            request.user.pk,
            category=data["category"],
            specialization=data["specialization"] or None,
            languages=data["languages"],
            experience_yrs=data["experience_yrs"],
            bio=data["bio"] or None,
            credentials=data["credentials"],
            tags=data["tags"],
            degree=data["degree"] or None,
            degree_asset_id=data["degree_asset_id"],
            tier=data["tier"],
        )
    except AlreadyApplied as exc:
        return Response(refusal_body("already_applied", str(exc)), status=HTTP_409_CONFLICT)
    return Response({"profile_id": str(consultant.profile_id), "status": consultant.status}, status=HTTP_201_CREATED)


class PriceBandRow(serializers.Serializer):
    id = serializers.UUIDField()
    tier = serializers.IntegerField()
    billing = serializers.CharField()
    duration_mins = serializers.IntegerField()
    price_paise = serializers.IntegerField()
    active = serializers.BooleanField()
    sort = serializers.IntegerField()


@api_view(["GET"])
@permission_classes([AllowAny])
def price_bands(request):
    """The active catalogue (007's only policy is select where active,
    granted to anon as well). ProApply's six buttons read this."""
    return Response([PriceBandRow(b).data for b in services.list_price_bands()])


# ── bookings (008/010/012/013) ───────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_bookings(request):
    """Every booking this seeker has made, newest slot first, through the
    bookings_view shape — carrying the consultant's name (010)."""
    return Response(services.list_bookings_by(request.user.pk))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def consultant_bookings(request, consultant_id):
    """The consultant's own queue, through the same view — carrying the
    seeker's name AND birth details, which a reading cannot be done without
    (010). Owner-scoped: another consultant's queue is a 403."""
    if not _owns(request, consultant_id):
        return Response(
            refusal_body("forbidden", "That is not your practice."), status=403
        )
    return Response(services.list_bookings_for(consultant_id))


class BookInput(serializers.Serializer):
    """What the client sends — { consultantId, serviceId, startsAt } and NO
    PRICE (rule 3). The seeker is the JWT's sub; the total is looked up on
    this side of the wire from the service row."""

    consultant_id = serializers.UUIDField()
    service_id = serializers.UUIDField()
    starts_at = serializers.DateTimeField()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def book(request):
    """One call, one transaction on the server: the price lookup, the slot
    claim, the wallet debit, both ledgers, the order and the booking
    (012). The answer is always the server's own { ok, reason } — a refusal
    is shown in the words the server chose (INSTRUCTIONS §2). The
    Idempotency-Key middleware replays a retried create; the partial unique
    index is the backstop."""
    serializer = BookInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    return Response(
        services.book_session(
            request.user.pk,
            consultant_id=data["consultant_id"],
            service_id=data["service_id"],
            starts_at=data["starts_at"],
        )
    )


class DecideInput(serializers.Serializer):
    status = serializers.ChoiceField(choices=(Booking.Status.CONFIRMED, Booking.Status.DECLINED))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decide(request, booking_id):
    """Accept or decline — a real status write, exactly the pending ->
    confirmed | declined edge (008's policy). A decline reverses the money
    in the SAME transaction, so there is no second call anybody can forget
    (012's trigger, re-expressed)."""
    serializer = DecideInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    result = services.decide_booking(
        request.user.pk, booking_id, serializer.validated_data["status"]
    )
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def earnings(request, consultant_id):
    """The consultant's own book, newest first (012's read policy). A
    declined session reads as two rows that cancel, never zero rows.

    With `?range=` it is one page of a period (`earnings.rows`) —
    `{rows, next_offset}`; without, the newest fifty as a bare list, which
    is what apps built before 3 Oct still read."""
    if not _owns(request, consultant_id):
        return Response(
            refusal_body("forbidden", "That is not your practice."), status=403
        )
    q = request.query_params
    if "range" not in q:
        return Response(services.list_earnings(consultant_id))
    try:
        return Response(
            earnings_reads.rows(
                consultant_id,
                q["range"],
                q.get("from"),
                q.get("to"),
                offset=q.get("offset", 0),
                limit=q.get("limit", earnings_reads.PAGE),
            )
        )
    except (earnings_reads.BadRange, ValueError) as exc:
        return Response(refusal_body("bad_range", str(exc)), status=400)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def earnings_summary(request, consultant_id):
    """Totals for a period — this month, last month, this or last financial
    year, lifetime, or `custom` with `from` and `to` — by source, plus what
    is booked but not yet earned and the last seven days."""
    if not _owns(request, consultant_id):
        return Response(
            refusal_body("forbidden", "That is not your practice."), status=403
        )
    q = request.query_params
    try:
        return Response(
            earnings_reads.summary(
                consultant_id, q.get("range", "this_month"), q.get("from"), q.get("to")
            )
        )
    except earnings_reads.BadRange as exc:
        return Response(refusal_body("bad_range", str(exc)), status=400)


# ── presence ────────────────────────────────────────────────────────────────


class PresenceInput(serializers.Serializer):
    """`accepting` is optional: a bare POST is a heartbeat and leaves the
    switch where it is. Sending it is the toggle."""

    accepting = serializers.BooleanField(required=False, allow_null=True)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presence(request):
    """The pro app checking in — every thirty seconds, and on every flip of
    the switch.

    Always about the CALLER. There is no consultant_id in the body, because
    a route that lets one account mark another online is a route that lets
    anyone put a green dot on somebody who has gone home.
    """
    serializer = PresenceInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    state = services.touch_presence(
        request.user.pk, accepting=serializer.validated_data.get("accepting")
    )
    if state is None:
        return Response(
            refusal_body("not_a_consultant", "You are not an approved consultant."),
            status=403,
        )
    return Response(state)
