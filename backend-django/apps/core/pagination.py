"""Service-layer keyset helper (docs/07 §3.1): every list that can grow
paginates by (created_at, id) — offsets die at scale.

DRF list endpoints use CursorPagination (see REST_FRAMEWORK defaults in
config.settings.base). This helper is for service-layer loops and the
modules' hand-rolled hot queries: pass the last row of the previous page,
get the next `limit` rows.
"""

from django.db import models


def keyset_page(queryset, after_id=None, limit=100):
    """Return (rows, next_after_id).

    Ordering convention, fixed here so every module's lists sort identically:
    `-created_at, -id`, descending — newest first. `after_id` is the id of
    the last row the caller saw; the bookmark keyset is the row's
    (created_at, id) pair, which callers that need resumable pagination can
    persist by re-fetching the anchor row.
    """
    ordering = ("-created_at", "-id")
    qs = queryset.order_by(*ordering)
    if after_id is not None:
        try:
            anchor = queryset.model._default_manager.get(pk=after_id)
        except queryset.model.DoesNotExist:
            anchor = None
        if anchor is not None:
            created, pk = anchor.created_at, anchor.pk
            conditions = models.Q(created_at__lt=created) | (
                models.Q(created_at=created) & models.Q(pk__lt=pk)
            )
            qs = qs.filter(conditions)
    rows = list(qs[:limit])
    next_after_id = rows[-1].pk if len(rows) == limit else None
    return rows, next_after_id
