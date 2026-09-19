"""Bhakti services — the rules of backend/schema/024_bhakti_assets.sql (as
amended by 026) re-expressed in code.

Policy parity (024's RLS block):
  select: public — anyone may read what is active, signed in or not. There is
    nothing personal in a row, so the endpoint is AllowAny and the query
    itself carries the `active` filter (the policy's `using (active)`).
  insert / update / delete: NO POLICY, deliberately — "the absence of a
    policy IS the rule: only the service role writes here." The Django
    equivalent is that no endpoint accepts a write at all, and the only
    code path that writes is `seed_asset` below, the service-role seed
    script's (backend/seed/bhakti.mjs) replacement. If a client write
    endpoint ever appears here, the thing actually needed is the phase 13
    admin console (02-TRD.md §7 is why it cannot be a flag on a user).

Kind semantics (026): 'ringtone' merged into 'tune' — they were one file
doing one job under two names — and 'status' (WhatsApp status artwork) was
promoted from a composer card into a first-class leading kind. The check
constraint carries the vocabulary; nothing here invents one.
"""

from django.db import IntegrityError, transaction

from .models import BhaktiAsset


def list_assets():
    """Everything active, ordered exactly the way fetchAssets orders the
    Supabase query: kind ascending, then the curated `sort` (024's partial
    index serves precisely this read)."""
    return BhaktiAsset.objects.filter(active=True).order_by("kind", "sort")


def seed_asset(*, legacy_id, kind, title, deity=None, media_url, preview_url=None,
               price_paise=None, artist, licence, source, active=True, sort=0):
    """Insert or update one catalogue row keyed on legacy_id — the write path
    backend/seed/bhakti.mjs uses with the service role (`upsert(rows,
    { onConflict: 'legacy_id' })`). Running the manifest twice updates rather
    than duplicates, which is what makes it safe to re-run after editing a
    title or a licence.

    legacy_id is the idempotency key (024) and the unique constraint is the
    backstop: a racing double-seed loses the constraint race and reads the
    winner instead, then applies its own fields — one row, last write wins,
    no read-before-write.
    Returns (asset, created).
    """
    fields = dict(
        kind=kind, title=title, deity=deity, media_url=media_url,
        preview_url=preview_url, price_paise=price_paise, artist=artist,
        licence=licence, source=source, active=active, sort=sort,
    )
    with transaction.atomic():
        try:
            with transaction.atomic():  # savepoint: the losing race only rolls back the insert
                return BhaktiAsset.objects.create(legacy_id=legacy_id, **fields), True
        except IntegrityError as exc:
            # Only the legacy_id unique key losing a race is recoverable —
            # read the winner and apply our fields over it. Any other
            # constraint refusing the row (bad kind, blank title, a
            # non-positive price) is a bad manifest entry and must fail
            # loudly, exactly as bhakti.mjs's die() does.
            try:
                asset = BhaktiAsset.objects.get(legacy_id=legacy_id)
            except BhaktiAsset.DoesNotExist:
                raise exc
    for name, value in fields.items():
        setattr(asset, name, value)
    asset.save(update_fields=[*fields])
    return asset, False
