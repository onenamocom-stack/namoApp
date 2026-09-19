"""Module 4 — bhakti (docs/07 §6 step 4): the pytest port of the
`bhakti_assets` invariants in backend/schema/024_bhakti_assets.sql (as
amended by 026_bhakti_status_kind.sql), plus the module's endpoint contract:
the exact shape src/lib/bhakti.js (and its staged Django rewrite,
cutovers/bhakti.clientlib.js) sends and renders.

No *_check.sql covers bhakti, so the SQL itself is the specification: the
kind vocabulary of 026 (ringtone merged into tune, status added), the
nullable-positive price, the NOT NULL attribution triplet, the btrim(title)
check, the legacy_id unique key, and the partial (kind, sort) index.

The RLS-equivalent matrix (policy `bhakti_assets_public_read`, 024):
  read  -> anonymous allowed, ACTIVE ROWS ONLY (using (active)); a session
           changes nothing — "signed in or not" is the policy's own words
  write -> NO endpoint at all: 024 grants no insert/update/delete policy and
           the absence of the policy IS the rule ("only the service role
           writes here"). The seed-script write path lives in services and
           is reached by no URL.
"""

import threading

import pytest
from django.db import IntegrityError, connection

from apps.bhakti.models import BhaktiAsset
from apps.bhakti.services import list_assets, seed_asset

from .conftest import make_claims

V = {"artist": "Raja Ravi Varma", "licence": "Public domain", "source": "Wikimedia Commons"}


def make_asset(**overrides):
    fields = dict(
        kind="wallpaper", title="Seated with attendants", deity="Ganesh",
        media_url="/deities/ganesh-1.webp", price_paise=None, sort=0, **V,
    )
    fields.update(overrides)
    return BhaktiAsset.objects.create(**fields)


@pytest.fixture
def library():
    """A small catalogue across all four 026 kinds, out of sort order on
    purpose so ordering is asserted, not assumed."""
    make_asset(kind="wallpaper", title="W1", sort=2, legacy_id="wp-1")
    make_asset(kind="status", title="S1", sort=1, legacy_id="st-1")
    make_asset(kind="wallpaper", title="W0", sort=1, legacy_id="wp-0")
    make_asset(kind="tune", title="T1", deity=None, sort=1, legacy_id="tu-1")
    make_asset(kind="bhajan", title="B1", price_paise=4900, sort=1, legacy_id="bh-1")


@pytest.mark.django_db
class TestFetchAssets:
    """GET /v1/bhakti/assets/ — what fetchAssets reads, and all it reads."""

    def test_anonymous_read_returns_active_rows(self, api_client, library):
        response = api_client.get("/v1/bhakti/assets/")

        assert response.status_code == 200
        titles = [r["title"] for r in response.json()]
        # kind ascending (text order: bhajan < status < tune < wallpaper),
        # then the curated sort — exactly the Supabase query's two .order()s.
        assert titles == ["B1", "S1", "T1", "W0", "W1"]

    def test_row_shape_is_what_toasset_consumes(self, api_client, library):
        body = api_client.get("/v1/bhakti/assets/").json()

        assert body == [
            {
                "id": r["id"],
                "kind": r["kind"],
                "title": r["title"],
                "deity": r["deity"],
                "media_url": r["media_url"],
                "preview_url": r["preview_url"],
                "price_paise": r["price_paise"],
                "artist": r["artist"],
                "licence": r["licence"],
                "source": r["source"],
            }
            for r in body
        ]
        wallpaper = next(r for r in body if r["kind"] == "wallpaper")
        assert wallpaper["media_url"] == "/deities/ganesh-1.webp"  # client prefixes BASE_URL
        assert wallpaper["price_paise"] is None  # not priced yet, not free
        tune = next(r for r in body if r["kind"] == "tune")
        assert tune["deity"] is None  # generic mantra
        assert next(r for r in body if r["kind"] == "bhajan")["price_paise"] == 4900

    def test_authenticated_read_same_as_anonymous(self, api_client, library, sign_hs256, hs256_mode):
        # The policy's own words: anyone may read, "signed in or not" — a
        # session must not change the answer or its shape.
        token = sign_hs256(claims=make_claims())
        response = api_client.get("/v1/bhakti/assets/", HTTP_AUTHORIZATION=f"Bearer {token}")

        assert response.status_code == 200
        assert [r["title"] for r in response.json()] == ["B1", "S1", "T1", "W0", "W1"]

    def test_inactive_rows_are_withdrawn(self, api_client, library):
        # RLS `using (active)`: soft withdrawal hides the row from everybody.
        BhaktiAsset.objects.filter(title="W0").update(active=False)

        response = api_client.get("/v1/bhakti/assets/")

        assert "W0" not in [r["title"] for r in response.json()]
        assert BhaktiAsset.objects.count() == 5  # nothing is hard-deleted (024)

    def test_empty_library_is_an_empty_array(self, api_client):
        response = api_client.get("/v1/bhakti/assets/")

        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
    def test_no_write_endpoints_exist(self, api_client, library, method):
        # 024's deliberate gap: no insert/update/delete policy. The Django
        # equivalent is that no write route exists at all — 405, not 403,
        # and the table is untouched.
        response = getattr(api_client, method)("/v1/bhakti/assets/", format="json")

        assert response.status_code == 405
        assert BhaktiAsset.objects.count() == 5


@pytest.mark.django_db
class TestKindVocabulary:
    """026: ringtone merged into tune; status is a first-class leading kind.
    The surviving vocabulary is the check constraint's — the database
    refuses anything else, from any writer."""

    @pytest.mark.parametrize("kind", ["status", "wallpaper", "tune", "bhajan"])
    def test_026_kinds_accepted(self, kind):
        row = make_asset(kind=kind)
        assert row.kind == kind

    def test_ringtone_is_refused(self):
        # 026 migrated every 'ringtone' row to 'tune' BEFORE narrowing the
        # check — a surviving one would have failed the migration, so none
        # may ever be insertable again.
        with pytest.raises(IntegrityError):
            make_asset(kind="ringtone")

    def test_unknown_kind_refused(self):
        with pytest.raises(IntegrityError):
            make_asset(kind="mantra")


@pytest.mark.django_db
class TestColumnRules:
    """024's remaining checks: price nullable-but-positive, title non-blank,
    attribution NOT NULL, legacy_id unique, honest defaults."""

    def test_price_null_means_not_priced_yet(self):
        assert make_asset(price_paise=None).price_paise is None

    def test_price_zero_refused(self):
        # "0 would say decided, and it is free — the screen can tell the
        # difference" (024): 0 never appears, the column refuses it.
        with pytest.raises(IntegrityError):
            make_asset(price_paise=0)

    def test_negative_price_refused(self):
        with pytest.raises(IntegrityError):
            make_asset(price_paise=-100)

    def test_blank_title_refused(self):
        with pytest.raises(IntegrityError):
            make_asset(title="   ")

    @pytest.mark.parametrize("field", ["artist", "licence", "source"])
    def test_attribution_not_null(self, field):
        with pytest.raises(IntegrityError):
            make_asset(**{field: None})

    def test_duplicate_legacy_id_refused(self):
        make_asset(legacy_id="wp-ganesh-1")
        with pytest.raises(IntegrityError):
            make_asset(legacy_id="wp-ganesh-1", title="Another")

    def test_defaults_are_honest(self):
        row = BhaktiAsset.objects.create(
            kind="wallpaper", title="T", media_url="/x.webp", **V,
        )
        assert row.active is True  # rows land live; withdrawal is a decision
        assert row.sort == 0
        assert row.legacy_id is None  # optional outside the seed path
        assert row.created_at is not None


@pytest.mark.django_db
class TestSeedService:
    """services.seed_asset — bhakti.mjs's `upsert(onConflict: 'legacy_id')`
    as the only write path. Idempotent by the unique key: re-running the
    manifest updates rather than duplicates."""

    def test_first_seed_creates(self):
        asset, created = seed_asset(
            legacy_id="st-ganesh-1", kind="status", title="Good beginnings",
            deity="Ganesh", media_url="/deities/ganesh-1.webp", sort=0, **V,
        )

        assert created is True
        assert asset.active is True
        assert list_assets().get().pk == asset.pk

    def test_reseed_updates_instead_of_duplicating(self):
        args = dict(legacy_id="st-ganesh-1", kind="status", title="Good beginnings",
                    deity="Ganesh", media_url="/deities/ganesh-1.webp", sort=0, **V)
        seed_asset(**args)

        again, created = seed_asset(**dict(args, title="Better beginnings", sort=3))

        assert created is False
        assert BhaktiAsset.objects.count() == 1
        assert again.title == "Better beginnings"
        assert again.sort == 3

    def test_seeded_rows_serve_in_curation_order(self, api_client):
        for i, (kind, title) in enumerate(
            [("wallpaper", "W-old"), ("status", "S-new"), ("wallpaper", "W-new")]
        ):
            seed_asset(legacy_id=f"id-{i}", kind=kind, title=title,
                       media_url="/deities/x.webp", sort=i, **V)

        titles = [r["title"] for r in api_client.get("/v1/bhakti/assets/").json()]
        assert titles == ["S-new", "W-old", "W-new"]

    def test_seed_respects_the_same_constraints(self):
        # The service has no back door around the table's rules: a bad row
        # is a refusal here exactly as it is from SQL.
        with pytest.raises(IntegrityError):
            seed_asset(legacy_id="bad-1", kind="ringtone", title="Old kind",
                       media_url="/x.m4a", **V)


@pytest.mark.django_db(transaction=True)
class TestConcurrentSeed:
    """Real threads, one database file: the legacy_id unique key is the
    idempotency backstop for the service-role script racing itself."""

    def _fire(self, barrier, results):
        connection.close()  # each thread gets its own connection
        barrier.wait(timeout=10)
        try:
            seed_asset(legacy_id="st-race-1", kind="status", title="Raced",
                       media_url="/deities/race.webp", sort=0, **V)
            results.append("ok")
        except Exception as exc:  # noqa: BLE001 — the test asserts on outcomes
            results.append(exc)

    def test_two_racing_seeds_are_one_row(self):
        barrier = threading.Barrier(2)
        results = []
        threads = [threading.Thread(target=self._fire, args=(barrier, results)) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert all(not t.is_alive() for t in threads)

        assert results == ["ok", "ok"]
        # One row, and both writers' updates landed — last write wins, the
        # same semantics as upsert(onConflict) under Postgres.
        assert BhaktiAsset.objects.count() == 1
        assert BhaktiAsset.objects.get().legacy_id == "st-race-1"
