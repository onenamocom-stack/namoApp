"""Raw-SQL gateway to the tables module 6 rules stand on but do not own.

  profiles        — the profile module (9); read for names and birth details
                    exactly as the 007/010 views join them
  wallets, ledger — the wallet module (8); prod carries the phase-2 triggers
                    (balance follows ledger; refuse_mutation makes the ledger
                    append-only) until that cutover
  orders,
  order_items     — 012's order layer; the booking transaction writes them
                    here exactly as 012's function does, inside the same
                    transaction

A query ERROR here propagates on purpose: the views must not conflate a
failed read with an absent row (the astro/content gateways carry the same
warning).

Two prod-trigger behaviours are emulated on SQLite, whose test fixtures have
no triggers — both are the honest shape for that backend, documented at the
site of each:

  * lock_wallet_balance skips FOR UPDATE (SQLite's file lock is the
    serializer), mirroring content's write_rating_cache
  * insert_ledger carries the balance into wallets itself; on Postgres the
    phase-2 trigger does that, so the gateway must NOT double-write it
"""

import uuid

from django.db import connection
from django.utils import timezone


def _xid(left, right):
    """Format-agnostic UUID comparison across Django UUIDFields (dashless on
    SQLite) and raw text/uuid columns — the content gateway's helper."""
    return (
        f"replace(cast({left} as text), '-', '')"
        f" = replace(cast({right} as text), '-', '')"
    )


# ── profiles (profile module) ────────────────────────────────────────────────


def profile_name(profile_id):
    with connection.cursor() as cursor:
        cursor.execute("select name from profiles where id = %s", [str(profile_id)])
        row = cursor.fetchone()
    return row[0] if row else None


# ── wallets / ledger (wallet module) ─────────────────────────────────────────


def lock_wallet_balance(profile_id):
    """The seeker's balance under a row lock (012 step 1: two debits by the
    same seeker serialise here; the check is against the LOCKED number, never
    a client's copy). None when there is no wallet on this account."""
    sql = "select balance_paise from wallets where profile_id = %s"
    if connection.vendor == "postgresql":
        sql += " for update"
    with connection.cursor() as cursor:
        cursor.execute(sql, [str(profile_id)])
        row = cursor.fetchone()
    return row[0] if row else None


def insert_ledger(wallet_id, delta_paise, kind, ref_type=None, ref_id=None, note=None):
    """One ledger row (012 step 5). Append-only in prod by 003's
    refuse_mutation trigger; on SQLite, where the test fixture has no
    trigger, the gateway also carries the balance — the phase-2 trigger's
    exact job — so wallets stay correct by construction on both backends."""
    row_id = str(uuid.uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into ledger (id, wallet_id, delta_paise, kind, ref_type, ref_id,"
            " note, created_at) values (%s, %s, %s, %s, %s, %s, %s, %s)",
            [row_id, str(wallet_id), delta_paise, kind, ref_type,
             (str(ref_id) if ref_id is not None else None), note, timezone.now()],
        )
        if connection.vendor != "postgresql":
            cursor.execute(
                "update wallets set balance_paise = balance_paise + %s"
                " where profile_id = %s",
                [delta_paise, str(wallet_id)],
            )
    return row_id


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
