"""Raw-SQL gateway to the tables Django does not own yet.

Module 5's rules live on top of tables that belong to other modules:
`profiles` (the profile module — still a raw table), `consultants` and
`bookings` (module 6 made those real Django tables; this gateway keeps
reading them through SQL, no ORM ownership of someone else's models, with
the replace(cast(...)) UUID normalisation the cross-boundary joins need on
SQLite — HANDOFF §10d). A query ERROR here propagates on purpose: the views
must not conflate a failed read with an absent row (the astro gateway
carries the same warning, from an incident where that conflation sent a
working consultant to a signup form).
"""

from django.db import connection


def _xid(left, right):
    """Format-agnostic UUID comparison: Django tables store UUIDFields
    dashless on SQLite while Postgres compares native uuids (HANDOFF §10d);
    normalising both sides reads identically on both backends. Needed since
    module 6 made `consultants` and `bookings` real Django tables — this
    gateway's lookups cross the ORM/raw boundary."""
    return (
        f"replace(cast({left} as text), '-', '')"
        f" = replace(cast({right} as text), '-', '')"
    )


def _canon(value):
    """Canonical dashed UUID text. Raw reads of Django-managed UUIDFields
    come back dashless on SQLite; services compare against str(uuid) from
    the request/JWT, so the gateway returns one canonical form."""
    import uuid

    text = str(value)
    return text if "-" in text else str(uuid.UUID(text))


def profile_name(profile_id):
    """The public name of a profile, or None when there is no row.

    `profiles` is own-row-only in the source schema; a name may leave this
    module only through the public projections (content_public's author_name,
    reviews_public's reviewer_name) exactly as the 020/025 views grant.
    """
    with connection.cursor() as cursor:
        cursor.execute("select name from profiles where id = %s", [str(profile_id)])
        row = cursor.fetchone()
    return row[0] if row else None


def profile_names(profile_ids):
    """Bulk read for shaping lists without an N+1: {uuid_str: name}."""
    ids = [str(p) for p in profile_ids]
    if not ids:
        return {}
    with connection.cursor() as cursor:
        cursor.execute(
            "select id, name from profiles where id in ({})".format(
                ", ".join(["%s"] * len(ids))
            ),
            ids,
        )
        return {str(pk): name for pk, name in cursor.fetchall()}


def consultant_status(profile_id):
    """'pending' | 'approved' | 'blocked', or None when not a consultant."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"select status from consultants where {_xid('profile_id', '%s')}",
            [str(profile_id)],
        )
        row = cursor.fetchone()
    return row[0] if row else None


def is_approved_consultant(profile_id):
    return consultant_status(profile_id) == "approved"


def write_rating_cache(consultant_id, avg, count):
    """The write half of the 020 trigger, under a row lock.

    refresh_rating_cache() in 020_content_reviews.sql updates
    consultants.rating_avg_cache = round(avg(rating)::numeric, 1) and
    rating_count_cache = count(*) over the consultant's LIVE reviews. The
    arithmetic itself lives in services.py (computed from the Review rows in
    the same transaction, with Postgres's half-away-from-zero rounding); this
    gateway is the dumb, checkable write, locked to serialize racing
    recomputations on Postgres. SQLite has no row locks — its file lock is the
    serializer, so the FOR UPDATE is skipped there.

    Returns True when a consultants row was updated.
    """
    with connection.cursor() as cursor:
        if connection.vendor == "postgresql":
            cursor.execute(
                f"select 1 from consultants where {_xid('profile_id', '%s')} for update",
                [str(consultant_id)],
            )
            if cursor.fetchone() is None:
                return False
        cursor.execute(
            "update consultants set rating_avg_cache = %s, rating_count_cache = %s"
            f" where {_xid('profile_id', '%s')}",
            [avg, count, str(consultant_id)],
        )
        return cursor.rowcount > 0


def booking_for_review(booking_id):
    """The booking a review claims, as the 020 insert policy reads it."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"select id, seeker_id, consultant_id, status from bookings"
            f" where {_xid('id', '%s')}",
            [str(booking_id)],
        )
        row = cursor.fetchone()
    if row is None:
        return None
    booking_id, seeker_id, consultant_id, status = row
    return {
        "id": _canon(booking_id),
        "seeker_id": _canon(seeker_id),
        "consultant_id": _canon(consultant_id),
        "status": status,
    }


def reviewable_bookings(seeker_id):
    """Bookings this seeker completed and has not reviewed — the 020 gate's
    positive half, in the order the client renders (starts_at desc)."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            select b.id, b.consultant_id, b.starts_at
              from bookings b
             where {_xid('b.seeker_id', '%s')}
               and b.status = 'completed'
               and not exists (select 1 from reviews r
                                where replace(cast(r.booking_id as text), '-', '')
                                    = replace(cast(b.id as text), '-', ''))
             order by b.starts_at desc
            """,
            [str(seeker_id)],
        )
        return [
            {"id": _canon(bid), "consultant_id": _canon(cid), "starts_at": starts_at}
            for bid, cid, starts_at in cursor.fetchall()
        ]


def update_booking_status(booking_id, status):
    """Test/admin seam for moving a booking (e.g. pending -> completed).

    Bookings belong to module 6 now (they became a real table there); this
    raw seam is unchanged — it exists so the review gate's lifecycle can be
    exercised exactly as the 020 check exercises it with SQL updates.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            f"update bookings set status = %s where {_xid('id', '%s')}",
            [status, str(booking_id)],
        )
