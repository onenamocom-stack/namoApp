"""Phase 10 — the shop and the Academy on the Django API: the seeker half.

Unlike modules 2-9, nothing here re-implements a rule in Python. The money
and access logic stays in the SQL it was written and race-tested in
(backend/schema/028, 030, 031: shop_checkout, academy_enrol, the
settle/release/refund family, the RLS gates on lessons, links and PDFs), and
Django does what PostgREST did for the browser: it runs each statement AS THE
CALLER. `as_caller` is that seam. Everything a seeker reaches goes through
it; only what was service-role before — writing a delivery quote — runs as
the owner. (The webhook's settle lives in apps.wallet.services.)

The operator half is the console: models.py and admin.py beside this file
(HANDOFF §22) read the same tables through Django models, behind their own
login. No admin action is reachable from /v1. That separation is the
console's design, and this file keeps it.

Postgres only: none of these tables or functions exist on SQLite, so the
pytest suite mocks this module at its DB edges. The SQL itself is covered by
028_shop_check.sql and 031_academy_check.sql, run in the SQL editor.
"""

import json
import logging
import uuid
from contextlib import contextmanager

from django.conf import settings
from django.db import IntegrityError, connection, transaction

from apps.media.providers import presign_get

logger = logging.getLogger(__name__)

MAX_QTY = 10  # shop_checkout's c_max_qty


class Refusal(Exception):
    """A sentence for the person, and the status it travels with — the
    `{ok: false, reason}` bodies the edge functions answered with."""

    def __init__(self, status, reason):
        super().__init__(reason)
        self.status = status
        self.reason = reason


@contextmanager
def as_caller(uid=None):
    """PostgREST's per-request setup, done by hand: one transaction, the role
    the browser reached the database as (`authenticated`, or `anon` with no
    uid), and the caller's claims — so auth.uid(), every RLS policy and every
    grant in 028/030/031 decide exactly what they decided when the browser
    asked directly.

    The transaction is the point. `SET LOCAL` outside one does nothing but
    warn, and the query after it would run as the table owner, past every
    policy. Checked on the dev database, 21 Sep: as an enrolled and a
    non-enrolled account, 2 and 0 lesson rows; as the owner, all 3."""
    role = "authenticated" if uid else "anon"
    claims = {"sub": str(uid), "role": role} if uid else {"role": role}
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(f"set local role {role}")
        cursor.execute("select set_config('request.jwt.claims', %s, true)", [json.dumps(claims)])
        yield cursor
        # Inside an outer transaction this block is a savepoint, and a released
        # savepoint keeps SET LOCAL until the outer one ends. Put the owner back
        # so nothing after this runs as the caller by accident.
        cursor.execute("reset role")
        cursor.execute("select set_config('request.jwt.claims', '', true)")


def _rows(cursor):
    columns = [c[0] for c in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _scalar(cursor):
    row = cursor.fetchone()
    return row[0] if row else None


# ── Catalogue ────────────────────────────────────────────────────────────────


def catalogue():
    """Signed out is fine: `products_read_active` and the category reads are
    open to anon, and the role is what applies them."""
    with as_caller() as cursor:
        cursor.execute(
            "select c.name,"
            "       coalesce(array_agg(s.name order by s.sort)"
            "                filter (where s.id is not null), '{}') as subcategories"
            "  from shop_categories c"
            "  left join shop_subcategories s on s.category_id = c.id"
            " group by c.id, c.name, c.sort"
            " order by c.sort"
        )
        categories = _rows(cursor)
        cursor.execute(
            "select p.id, p.name, p.subtitle, p.image_url, p.price_paise, p.mrp_paise,"
            "       p.stock, p.featured, c.name as category, s.name as subcategory"
            "  from products p"
            "  join shop_categories c on c.id = p.category_id"
            "  left join shop_subcategories s on s.id = p.subcategory_id"
            " order by p.created_at"
        )
        return {"categories": categories, "products": _rows(cursor)}


# ── Addresses ────────────────────────────────────────────────────────────────

ADDRESS_COLUMNS = "id, name, phone, line1, line2, city, state, pincode"


def list_addresses(uid):
    with as_caller(uid) as cursor:
        cursor.execute(f"select {ADDRESS_COLUMNS} from shipping_addresses order by created_at desc")
        return _rows(cursor)


def save_address(uid, fields):
    """`profile_id` is the column default, auth.uid(); the insert policy
    checks it. The CHECKs on phone and pincode are the validation."""
    try:
        with as_caller(uid) as cursor:
            cursor.execute(
                "insert into shipping_addresses (name, phone, line1, line2, city, state, pincode)"
                " values (%(name)s, %(phone)s, %(line1)s, %(line2)s, %(city)s, %(state)s, %(pincode)s)"
                f" returning {ADDRESS_COLUMNS}",
                fields,
            )
            return _rows(cursor)[0]
    except IntegrityError as exc:
        if getattr(exc.__cause__, "sqlstate", None) == "23514":
            raise Refusal(400, "Check the phone number and pincode.") from None
        raise


# ── Delivery quote (the shop-quote Edge Function) ────────────────────────────


def merge_items(items):
    """Repeats merged the way shop_checkout merges them, so the weight quoted
    is the weight checkout recomputes."""
    if not isinstance(items, list):
        raise Refusal(400, "That cart could not be read.")
    qty = {}
    for item in items:
        try:
            product_id = uuid.UUID(str(item["product_id"]))
            n = item["qty"]
        except (TypeError, KeyError, ValueError):
            raise Refusal(400, "That cart could not be read.") from None
        if not isinstance(n, int) or isinstance(n, bool):
            raise Refusal(400, "That cart could not be read.")
        qty[product_id] = qty.get(product_id, 0) + n
    if not qty:
        raise Refusal(400, "Your cart is empty.")
    if any(n < 1 or n > MAX_QTY for n in qty.values()):
        raise Refusal(400, f"You can order up to {MAX_QTY} of each item.")
    return qty


def _cart_for_quote(uid, product_ids, address_id):
    """As the caller: RLS is what makes the address theirs and the products
    on sale. Returns (pincode or None, {product_id: weight_grams})."""
    with as_caller(uid) as cursor:
        cursor.execute("select pincode from shipping_addresses where id = %s", [address_id])
        pincode = _scalar(cursor)
        cursor.execute(
            "select id, weight_grams from products where id = any(%s)", [list(product_ids)]
        )
        return pincode, {uuid.UUID(str(pid)): grams for pid, grams in cursor.fetchall()}


def _store_quote(uid, pincode, grams, amount_paise):
    """As the owner: quotes have no client policy (028); checkout spends them."""
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute(
            "insert into shipping_quotes (profile_id, pincode, weight_grams, amount_paise, expires_at)"
            " values (%s, %s, %s, %s, now() + interval '30 minutes')"
            " returning id, amount_paise, courier, etd_days",
            [str(uid), pincode, grams, amount_paise],
        )
        return _rows(cursor)[0]


def quote(uid, items, address_id):
    qty = merge_items(items)
    pincode, weights = _cart_for_quote(uid, qty.keys(), address_id)
    if pincode is None:
        raise Refusal(400, "Pick a delivery address.")
    if len(weights) != len(qty):
        raise Refusal(400, "Something in your cart is no longer sold.")
    grams = sum(weights[pid] * n for pid, n in qty.items())

    # ponytail: flat rate only. shop-quote's Shiprocket branch was written
    # before an account existed and never ran; port it when one does — the
    # rate goes here, and nothing downstream changes.
    flat = settings.SHIPPING_FLAT_PAISE
    if flat is None:
        logger.error("[quote] not configured: set SHIPPING_FLAT_PAISE")
        raise Refusal(500, "Delivery is not available yet.")

    row = _store_quote(uid, pincode, grams, flat)
    return {
        "ok": True,
        "quote_id": row["id"],
        "amount_paise": row["amount_paise"],
        "courier": row["courier"],
        "etd_days": row["etd_days"],
    }


# ── Checkout, cancel, orders ─────────────────────────────────────────────────


def checkout(uid, items, address_id, quote_id, pay):
    """028's shop_checkout, as the caller. Its jsonb is the answer, refusal
    sentences and all; nothing here sends a price."""
    with as_caller(uid) as cursor:
        cursor.execute(
            "select public.shop_checkout(%s::jsonb, %s, %s, %s)",
            [json.dumps(items), address_id, quote_id, pay],
        )
        return _scalar(cursor)


def cancel_order(uid, order_id):
    with as_caller(uid) as cursor:
        cursor.execute("select public.shop_order_cancel(%s)", [order_id])
        return _scalar(cursor)


def order_status(uid, order_id):
    """None when the order is not the caller's — orders_select_own."""
    with as_caller(uid) as cursor:
        cursor.execute("select status from orders where id = %s", [order_id])
        return _scalar(cursor)


def my_orders(uid):
    """Shop orders only: an order with a shipment. Sessions are orders too."""
    with as_caller(uid) as cursor:
        cursor.execute(
            "select o.id, o.status as order_status, o.total_paise, o.created_at,"
            "       s.status as shipment_status, s.courier, s.awb, s.shipping_paise, s.address,"
            "       coalesce((select json_agg(json_build_object("
            "                   'id', i.id, 'title', i.title, 'qty', i.qty,"
            "                   'unit_price_paise', i.unit_price_paise) order by i.id)"
            "                   from order_items i"
            "                  where i.order_id = o.id and i.item_type = 'product'), '[]') as lines"
            "  from shipments s"
            "  join orders o on o.id = s.order_id"
            " order by o.created_at desc"
        )
        return _rows(cursor)


# ── Academy ──────────────────────────────────────────────────────────────────


def academy(uid):
    """The catalogue for anyone, plus what the caller is actively enrolled in.
    Lesson and join links are not here: they are gated reads of their own."""
    with as_caller(uid) as cursor:
        cursor.execute(
            "select id, title, tutor, level, summary, cover_url, price_paise"
            "  from courses order by sort"
        )
        courses = _rows(cursor)
        cursor.execute(
            "select id, course_id, sort, title, minutes from course_outline order by sort"
        )
        outline = _rows(cursor)
        cursor.execute(
            "select id, title, host, kind, summary, starts_at, minutes, seats, seats_left,"
            "       price_paise, status"
            "  from academy_events order by starts_at"
        )
        events = _rows(cursor)
        enrolled = []
        if uid:
            cursor.execute("select item_type, item_id from enrolments where status = 'active'")
            enrolled = [f"{kind}:{item}" for kind, item in cursor.fetchall()]
    return {"courses": courses, "outline": outline, "events": events, "enrolled": enrolled}


def lessons(uid, course_id):
    """Empty unless enrolled — course_lessons_enrolled, not a filter here."""
    with as_caller(uid) as cursor:
        cursor.execute(
            "select id, sort, title, minutes, video_url from course_lessons"
            " where course_id = %s order by sort",
            [course_id],
        )
        return _rows(cursor)


def event_links(uid):
    with as_caller(uid) as cursor:
        cursor.execute("select event_id, join_url from academy_event_links")
        return {str(event_id): url for event_id, url in cursor.fetchall()}


def materials(uid):
    with as_caller(uid) as cursor:
        cursor.execute(
            "select m.id, m.title, m.storage_path, m.size_bytes, c.title as course"
            "  from course_materials m join courses c on c.id = m.course_id"
            " order by m.sort"
        )
        return _rows(cursor)


def material_url(uid, path):
    """A ten-minute link to one PDF. The row being readable as the caller IS
    the enrolment check (course_materials_enrolled); the bytes sit in a
    private R2 bucket, which replaces 031's Supabase `course-materials`."""
    with as_caller(uid) as cursor:
        cursor.execute("select 1 from course_materials where storage_path = %s", [path])
        if cursor.fetchone() is None:
            raise Refusal(404, "Enrol in the course to open this.")
    if not settings.R2_PRIVATE_BUCKET:
        logger.error("[academy] R2_PRIVATE_BUCKET is not set")
        raise Refusal(503, "Downloads are not available yet.")
    return {"ok": True, "url": presign_get(settings.R2_PRIVATE_BUCKET, path, 600)}


def enrol(uid, item_type, item_id, pay):
    """031's academy_enrol, as the caller: what, and how it pays — no price."""
    with as_caller(uid) as cursor:
        cursor.execute("select public.academy_enrol(%s, %s, %s)", [item_type, item_id, pay])
        return _scalar(cursor)
