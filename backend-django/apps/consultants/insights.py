"""A consultant's Insights tab, from real rows (4 Oct 2026).

Replaces the prototype's numbers ("3,12,000 views" on reels nobody posted).
Everything here is the caller's own and is read, never stored:

- **Last 7 days:** views of their posts (`content_views`, one per person per
  post per day), people who started following them, saves of their posts,
  comments on their posts. Follows and saves are net — an unfollow deletes
  the row.
- **Pieces:** every live post of theirs (reels, photos, blogs) with its
  totals and its views in the last 7 days. The app draws a thumbnail from
  `media_url` and opens the piece; nobody else's content is in this list.
- **Shop:** products bought by people who used their A code, counted per
  product. A coupon only works on a buyer's first order, so every coupon
  sale is one `referrals` row of kind `purchase` pointing at its order.
  Refunded and cancelled orders are left out.

What the prototype also showed — reach, profile views, cities, the hour
the audience is awake — has no source anywhere, so it is gone rather than
invented.
"""

from datetime import timedelta

from django.db.models import Count, Max, Sum
from django.utils import timezone

from apps.content.models import Comment, CommentStatus, ContentView
from apps.content import services as content_services
from apps.reactions.models import Reaction
from apps.referrals.models import Referral, ReferralKind
from apps.shop.models import Order, OrderItem, Product

WINDOW_DAYS = 7
PIECES = 100


def insights(consultant_id, now=None):
    now = now or timezone.now()
    since = now - timedelta(days=WINDOW_DAYS)

    rows, _ = content_services.by_author_page(consultant_id, limit=PIECES)
    ids = [r.id for r in rows]

    views_7d = dict(
        ContentView.objects.filter(content_id__in=ids, created_at__gte=since)
        .values("content_id")
        .annotate(n=Count("id"))
        .values_list("content_id", "n")
    )

    week = {
        "views": sum(views_7d.values()),
        "new_followers": Reaction.objects.filter(
            kind=Reaction.Kind.FOLLOW,
            target_type__in=[Reaction.TargetType.PROFILE, Reaction.TargetType.CONSULTANT],
            target_id=consultant_id,
            created_at__gte=since,
        ).count(),
        "saves": Reaction.objects.filter(
            kind=Reaction.Kind.SAVE,
            target_type=Reaction.TargetType.CONTENT,
            target_id__in=ids,
            created_at__gte=since,
        ).count(),
        "comments": Comment.objects.filter(
            content_id__in=ids, created_at__gte=since, status=CommentStatus.LIVE
        ).count(),
    }

    pieces = [
        {
            "id": str(r.id),
            "kind": r.kind,
            "title": r.title or "",
            "caption": r.caption or "",
            "media_url": r.media_url,
            "published_at": r.published_at,
            "views": r.view_count,
            "views_7d": views_7d.get(r.id, 0),
            "likes": r.like_count,
            "comments": r.comment_count,
            "saves": r.save_count,
        }
        for r in rows
    ]

    return {
        "window_days": WINDOW_DAYS,
        "week": week,
        "totals": {
            "pieces": len(pieces),
            "views": sum(p["views"] for p in pieces),
        },
        "pieces": pieces,
        "shop": shop_sales(consultant_id),
    }


def shop_sales(consultant_id):
    """Products bought with this consultant's coupon, most bought first."""
    orders = Referral.objects.filter(
        kind=ReferralKind.PURCHASE, referrer_id=consultant_id, order__isnull=False
    ).exclude(
        order__status__in=[Order.Status.REFUNDED, Order.Status.CANCELLED]
    ).values_list("order_id", flat=True)

    lines = (
        OrderItem.objects.filter(order_id__in=list(orders), item_type="product")
        .values("item_id")
        .annotate(
            units=Sum("qty"),
            buyers=Count("order__profile_id", distinct=True),
            last=Max("order__created_at"),
            title=Max("title"),
        )
        .order_by("-units", "-last")
    )
    images = dict(
        Product.objects.filter(id__in=[line["item_id"] for line in lines]).values_list("id", "image_url")
    )
    products = [
        {
            "product_id": str(line["item_id"]),
            "name": line["title"],
            "image_url": images.get(line["item_id"]),
            "units": line["units"],
            "buyers": line["buyers"],
            "last_bought_at": line["last"],
        }
        for line in lines
    ]
    return {
        "orders": len(set(orders)),
        "units": sum(p["units"] for p in products),
        "products": products,
    }

