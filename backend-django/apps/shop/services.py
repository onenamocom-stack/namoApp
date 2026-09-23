"""The catalogue, and buying from it.

── THE ONE HARD PART: TWO PEOPLE, ONE ITEM ─────────────────────────────────
The question this module exists to answer is the one that gets asked about
every shop: there is one Blue Sapphire left and two people tap Buy in the
same tick. Exactly one may get it; the other must be told it is gone, and
must not be charged.

The naive shape is read-then-write:

    if product.stock >= qty:        # both read 1
        product.stock -= qty        # both write 0
        charge(...)                 # both charged

Both pass the check, because the gap between the read and the write is
where the other transaction lives. Two orders, one gemstone.

**What this does instead is a conditional UPDATE:**

    update products set stock = stock - %s
     where id = %s and active and stock >= %s

The database evaluates `stock >= qty` and applies the subtraction in ONE
statement, holding the row lock for its duration. Whoever arrives second
finds `stock >= 1` false and the statement matches nothing — `rowcount` is
0, and that zero IS the answer. There is no gap to lose a race in.

Chosen over `select … for update` because it is one round trip instead of
two, and because the check cannot drift from the write: they are the same
statement. Postgres and SQLite both give an exact rowcount, so the test
suite exercises the real mechanism rather than a mock.

**Lock ordering.** Rows are claimed in sorted id order, always. Two carts
holding the same two products in opposite orders would otherwise each hold
what the other wants — a deadlock the database resolves by killing one
transaction, which a seeker experiences as a random failure. Sorting makes
that impossible rather than rare.

**What bigger shops add on top.** Blinkit and Zomato hold a reservation
with a short expiry while checkout is open, usually in Redis, so an item
in your basket is not sold from under you mid-payment. That matters when
payment is a redirect taking thirty seconds. Here the wallet is debited in
the same transaction as the decrement — there is no window to reserve
across — so a reservation layer would be machinery guarding a gap that
does not exist. It becomes worth building the day checkout leaves the
server, and `hold_stock` below is where it would go.
"""

import logging
import uuid

from django.db import transaction
from django.db.models import F

from apps.wallet import services as wallet_services

from .models import Coupon, Order, OrderItem, Product

logger = logging.getLogger("apps.shop")

REFUSAL_EMPTY = "Nothing in the order."
REFUSAL_GONE = "That is no longer for sale."
REFUSAL_OUT_OF_STOCK = "Out of stock."
REFUSAL_SHORT = "Not enough left."
REFUSAL_COUPON_UNKNOWN = "That code does not work."
REFUSAL_COUPON_EXPIRED = "That code has expired."
REFUSAL_COUPON_SPENT = "That code has been used up."
REFUSAL_COUPON_TOO_SMALL = "Your order is below this code's minimum."

MAX_QTY_PER_LINE = 10


# ── reading the catalogue ────────────────────────────────────────────────────


def list_products(*, category=None, include_sold_out=True):
    """What the shop screen renders.

    Inactive products are never returned — `active=False` is the console's
    delete, and a product taken down must vanish from the app. Sold-out
    ones ARE returned: a shelf with a greyed-out label is a shop; a shelf
    that silently loses items is a bug report.
    """
    rows = Product.objects.filter(active=True).select_related("category", "subcategory")
    if category:
        rows = rows.filter(category__name__iexact=category)
    if not include_sold_out:
        rows = rows.filter(stock__gt=0)
    return list(rows)


def product_row(product):
    return {
        "id": str(product.id),
        "name": product.name,
        "subtitle": product.subtitle or "",
        "category": product.category.name if product.category_id else "",
        "subcategory": product.subcategory.name if product.subcategory_id else "",
        "image_url": product.image_url or "",
        "price_paise": product.price_paise,
        "mrp_paise": product.mrp_paise,
        "stock": product.stock,
        "in_stock": product.stock > 0,
        "featured": product.featured,
        "weight_grams": product.weight_grams,
    }


# ── buying ───────────────────────────────────────────────────────────────────


def claim_stock(product_id, qty):
    """Take `qty` off the shelf, or return False.

    ONE statement. The database evaluates `stock >= qty` and applies the
    subtraction together, holding the row lock for its duration, so there
    is no moment between them for a second buyer to occupy. The returned
    row count of 0 means the condition failed — sold out, not enough left,
    or withdrawn between the screen rendering and the tap.

    Written through the ORM rather than as raw SQL, and that is not
    tidiness. The first cut was raw SQL comparing `id = %s` against a
    dashed uuid string; Postgres accepts that and SQLite does not, because
    Django stores a UUIDField there as 32 hex characters with no dashes.
    It would have worked in production and matched nothing in the tests —
    the worst arrangement available, since the test suite would have been
    proving nothing about the one mechanism it exists to prove.
    """
    return Product.objects.filter(
        pk=product_id, active=True, stock__gte=qty
    ).update(stock=F("stock") - qty) == 1


def release_stock(product_id, qty):
    """Put it back. Belt to the transaction's braces, for a caller that is
    not inside one."""
    Product.objects.filter(pk=product_id).update(stock=F("stock") + qty)


def check_coupon(code, subtotal_paise, now=None):
    """-> (discount_paise, coupon) or (0, None), with a reason on refusal."""
    from django.utils import timezone

    now = now or timezone.now()
    if not code:
        return 0, None, None
    coupon = Coupon.objects.filter(code__iexact=code.strip(), active=True).first()
    if coupon is None:
        return 0, None, REFUSAL_COUPON_UNKNOWN
    if coupon.starts_at and now < coupon.starts_at:
        return 0, None, REFUSAL_COUPON_EXPIRED
    if coupon.ends_at and now >= coupon.ends_at:
        return 0, None, REFUSAL_COUPON_EXPIRED
    if coupon.max_redemptions is not None and coupon.used_count >= coupon.max_redemptions:
        return 0, None, REFUSAL_COUPON_SPENT
    if subtotal_paise < (coupon.min_order_paise or 0):
        return 0, None, REFUSAL_COUPON_TOO_SMALL
    return coupon.discount_on(subtotal_paise), coupon, None


class Refused(Exception):
    """A refusal, raised rather than returned.

    `transaction.atomic()` rolls back on an EXCEPTION. A plain `return`
    from inside the block commits everything done so far — so an early
    return after a stock claim silently sold an item nobody paid for. It
    happened: a refused coupon left the shelf one short.

    Returning the refusal is the obvious way to write this and the wrong
    one, and the wrongness is invisible at the call site. Raising makes
    the correct thing the default, so a refusal added a year from now
    cannot reintroduce the bug by being written the obvious way.
    """

    def __init__(self, reason, **extra):
        super().__init__(reason)
        self.payload = {"ok": False, "reason": reason, **extra}


def buy(profile_id, lines, coupon_code=None):
    """One purchase: stock, money, order — all of it or none of it.

    `lines` is [{product_id, qty}].

    The order of operations is deliberate. **Stock is claimed before the
    wallet is touched**, because an unaffordable order that already took
    the last gemstone off the shelf is worse than a rejected one: the
    seeker who could pay is then told it is sold out.
    """
    if not lines:
        return {"ok": False, "reason": REFUSAL_EMPTY}

    # Sorted, always. Two carts holding the same two products in opposite
    # orders would each hold what the other wants; the database breaks the
    # deadlock by killing one, which a seeker sees as a random failure.
    wanted = sorted(
        ((str(line["product_id"]), int(line.get("qty") or 1)) for line in lines),
        key=lambda pair: pair[0],
    )
    for _id, qty in wanted:
        if qty < 1 or qty > MAX_QTY_PER_LINE:
            return {"ok": False, "reason": f"Between 1 and {MAX_QTY_PER_LINE} of each."}

    try:
        with transaction.atomic():
            return _purchase(profile_id, wanted, coupon_code)
    except Refused as refusal:
        return refusal.payload


def _purchase(profile_id, wanted, coupon_code):
    products = {}
    for product_id, qty in wanted:
        product = Product.objects.filter(pk=product_id, active=True).first()
        if product is None:
            raise Refused(REFUSAL_GONE)
        if not claim_stock(product_id, qty):
            # Re-read rather than trust the row we loaded: the number that
            # mattered was the one at the moment of the update.
            left = Product.objects.filter(pk=product_id).values_list("stock", flat=True).first() or 0
            raise Refused(
                REFUSAL_OUT_OF_STOCK if left == 0 else REFUSAL_SHORT,
                product_id=product_id, stock=left,
            )
        products[product_id] = (product, qty)

    subtotal = sum(p.price_paise * q for p, q in products.values())
    discount, coupon, refusal = check_coupon(coupon_code, subtotal)
    if refusal:
        raise Refused(refusal)
    total = max(0, subtotal - discount)

    # The wallet takes its own row lock inside this transaction. It is the
    # LAST lock taken, after every product row, which is what keeps the
    # ordering consistent across every purchase in the system.
    paid = wallet_services.debit(profile_id, total, _label(products)) if total else {"ok": True}
    if not paid.get("ok"):
        raise Refused(paid.get("reason"), balance_paise=paid.get("balance_paise"))

    order = Order.objects.create(
        id=uuid.uuid4(), profile_id=profile_id,
        status=Order.Status.PAID, total_paise=total,
    )
    for product, qty in products.values():
        OrderItem.objects.create(
            order=order, item_type="product", item_id=product.id,
            title=product.name, qty=qty,
            unit_price_paise=product.price_paise,
            tax_rate_bps=product.tax_rate_bps,
        )

    if coupon is not None:
        # Counted, not derived. An order later refunded still consumed the
        # coupon, so `used_count` cannot be a query over orders.
        Coupon.objects.filter(pk=coupon.pk).update(used_count=coupon.used_count + 1)

    return {
        "ok": True, "order_id": str(order.id),
        "subtotal_paise": subtotal, "discount_paise": discount,
        "total_paise": total, "balance_paise": paid.get("balance_paise"),
    }


def _label(products):
    """What the seeker reads on their statement. The ledger's `kind` is
    the only description of the purchase they ever see."""
    names = [p.name for p, _ in products.values()]
    if len(names) == 1:
        return names[0]
    return f"{names[0]} and {len(names) - 1} more"
