"""Raw-SQL gateway to the tables Django does not own yet.

Module 5's rules live on top of three tables that belong to later modules:
`profiles` (the profile module), `consultants` (the consultants module) and
`bookings` (the bookings module). Exactly as apps/astro reads birth details
through a raw-SQL gateway that the profile module replaces, this module reads
names, consultant statuses and booking rows through SQL — no Django models for
tables other modules will claim, and no ORM ownership of someone else's schema.

A query ERROR here propagates on purpose: the views must not conflate a failed
read with an absent row (the astro gateway carries the same warning, from an
incident where that conflation sent a working consultant to a signup form).
"""

from django.db import connection


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
            "select status from consultants where profile_id = %s", [str(profile_id)]
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
                "select 1 from consultants where profile_id = %s for update",
                [str(consultant_id)],
            )
            if cursor.fetchone() is None:
                return False
        cursor.execute(
            "update consultants set rating_avg_cache = %s, rating_count_cache = %s"
            " where profile_id = %s",
            [avg, count, str(consultant_id)],
        )
        return cursor.rowcount > 0


def booking_for_review(booking_id):
    """The booking a review claims, as the 020 insert policy reads it."""
    with connection.cursor() as cursor:
        cursor.execute(
            "select id, seeker_id, consultant_id, status from bookings where id = %s",
            [str(booking_id)],
        )
        row = cursor.fetchone()
    if row is None:
        return None
    booking_id, seeker_id, consultant_id, status = row
    return {
        "id": str(booking_id),
        "seeker_id": str(seeker_id),
        "consultant_id": str(consultant_id),
        "status": status,
    }


def reviewable_bookings(seeker_id):
    """Bookings this seeker completed and has not reviewed — the 020 gate's
    positive half, in the order the client renders (starts_at desc)."""
    with connection.cursor() as cursor:
        cursor.execute(
            """
            select b.id, b.consultant_id, b.starts_at
              from bookings b
             where b.seeker_id = %s
               and b.status = 'completed'
               and not exists (select 1 from reviews r
                                where replace(cast(r.booking_id as text), '-', '')
                                    = replace(cast(b.id as text), '-', ''))
             order by b.starts_at desc
            """,
            [str(seeker_id)],
        )
        return [
            {"id": str(bid), "consultant_id": str(cid), "starts_at": starts_at}
            for bid, cid, starts_at in cursor.fetchall()
        ]


def update_booking_status(booking_id, status):
    """Test/admin seam for moving a booking (e.g. pending -> completed).

    Bookings belong to the bookings module; nothing in this module's URL
    surface calls this — it exists so the review gate's lifecycle can be
    exercised exactly as the 020 check exercises it with SQL updates.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "update bookings set status = %s where id = %s",
            [status, str(booking_id)],
        )
