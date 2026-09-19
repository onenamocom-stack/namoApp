"""Raw-SQL gateway to the tables module 6 rules stand on but do not own.

  profiles        — READS RE-POINTED to apps.profiles.services in module 9
                    (the profile module owns the table; `profile_name` below
                    is the delegating seam the booking/chat labels and the
                    010 view join read through)
  orders,
  order_items     — 012's order layer; the booking transaction writes them
                    here exactly as 012's function does, inside the same
                    transaction

wallets/ledger were here until module 8 claimed them: the wallet lock and
the ledger append moved to apps.wallet.services (THE only mutation path,
rule 2) and this module's services import them from there — one
implementation of the money primitives, not two. A query ERROR here
propagates on purpose: the views must not conflate a failed read with an
absent row (the astro/content gateways carry the same warning).
"""

import uuid

from django.db import connection
from django.utils import timezone

from apps.profiles import services as profile_services


def _xid(left, right):
    """Format-agnostic UUID comparison across Django UUIDFields (dashless on
    SQLite) and raw text/uuid columns — the content gateway's helper."""
    return (
        f"replace(cast({left} as text), '-', '')"
        f" = replace(cast({right} as text), '-', '')"
    )


# ── profiles (module 9 owns the table; this is the delegating seam) ──────────


def profile_name(profile_id):
    """A profile's name for the booking/chat labels and the 010 view join —
    read through the profile module now, same answer as the raw
    `select name from profiles` it replaces."""
    return profile_services.profile_name(profile_id)


# ── orders / order_items (012's order layer) ─────────────────────────────────


def insert_order(profile_id, total_paise):
    """One order row; the booking transaction's step 3 (the ledger row needs
    the order id for ref_id). Status defaults to 'paid', exactly 012."""
    order_id = str(uuid.uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into orders (id, profile_id, status, total_paise, created_at)"
            " values (%s, %s, 'paid', %s, %s)",
            [order_id, str(profile_id), total_paise, timezone.now()],
        )
    return order_id


def insert_order_item(order_id, *, item_type, item_id, title, unit_price_paise, qty=1):
    row_id = str(uuid.uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into order_items (id, order_id, item_type, item_id, title, qty,"
            " unit_price_paise, tax_rate_bps) values (%s, %s, %s, %s, %s, %s, %s, 0)",
            [row_id, str(order_id), item_type, str(item_id), title, qty, unit_price_paise],
        )
    return row_id


def set_order_refunded(order_id):
    with connection.cursor() as cursor:
        cursor.execute(
            "update orders set status = 'refunded' where id = %s", [str(order_id)]
        )


def set_order_total(order_id, total_paise):
    """014's settle step: the order opened at the hold is restated at what
    was actually charged (`update orders set total_paise = ...` in
    session_end). Used by the chat module (7); the orders table stays the
    wallet module's (8)."""
    with connection.cursor() as cursor:
        cursor.execute(
            "update orders set total_paise = %s where id = %s",
            [total_paise, str(order_id)],
        )
