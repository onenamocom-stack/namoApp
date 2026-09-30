"""Things bought from the wallet that stay bought (30 Sep 2026), and the
free reading that replaced the personal one on the free side.

  the money      -> TestBuy: the price is the server's, the charge and the
                    grant are one write, a forever-thing is never charged
                    twice, a month bought early starts where the last ends,
                    and an empty wallet writes nothing
  the gates      -> TestGates: the personal reading and a muhurat judged
                    against your chart answer 402 with the price until
                    bought; a muhurat is bought per purpose per month
  the free side  -> TestRashifal: twelve readings a day for everybody,
                    anonymous, and a canonical birth whose Moon is not in
                    its sign refuses instead of serving the neighbour's
  the charts     -> TestVargas: every division in one upstream call, once
  the e-book     -> TestEbook: a priced book never shows its file in the
                    list; its link is for the buyer only
  sign-up        -> TestGender
"""

from datetime import timedelta

import pytest
from django.db import connection
from django.utils import timezone

from apps.astro import services as astro
from apps.astro.models import AstroCache
from apps.bhakti.models import BhaktiAsset
from apps.profiles.models import Profile
from apps.wallet import services as wallet
from apps.wallet.models import Entitlement

from .conftest import TEST_USER, make_claims
from .test_astro import BIRTH, CountingProvider, auth, insert_profile

PREDICTION = 9900
MUHURAT = 4900


def _wallet(balance):
    with connection.cursor() as cursor:
        cursor.execute(
            "insert into wallets (profile_id, balance_paise, created_at) values (%s, %s, %s)",
            [TEST_USER, 0, timezone.now()],
        )
    if balance:
        wallet.insert_ledger(TEST_USER, balance, "Added money", ref_type="adjustment")


def _ledger():
    with connection.cursor() as cursor:
        cursor.execute(
            "select delta_paise, kind, ref_id from ledger where wallet_id = %s and delta_paise < 0",
            [TEST_USER],
        )
        return cursor.fetchall()


@pytest.fixture(autouse=True)
def prices(settings):
    settings.PREDICTION_PRICE_PAISE = PREDICTION
    settings.PREDICTION_DAYS = 30
    settings.MUHURAT_ME_PRICE_PAISE = MUHURAT
    settings.MEDIA_PROVIDER = "local"
    settings.R2_PRIVATE_BUCKET = "namo-docs"


@pytest.fixture
def provider(monkeypatch):
    counting = CountingProvider()
    monkeypatch.setattr(astro, "get_provider", lambda: counting)
    return counting


@pytest.fixture
def token(sign_hs256, hs256_mode):
    return sign_hs256(claims=make_claims())


@pytest.mark.django_db
class TestBuy:
    def test_a_month_of_predictions_is_charged_once_and_granted(self):
        _wallet(20000)
        result = wallet.buy(TEST_USER, "prediction")
        assert result["ok"] is True and result["balance_paise"] == 20000 - PREDICTION
        assert wallet.owns(TEST_USER, "prediction")
        [(delta, kind, ref_id)] = _ledger()
        row = Entitlement.objects.get()
        assert delta == -PREDICTION and kind == "Predictions · 30 days"
        # the charge names what it bought
        assert str(ref_id).replace("-", "") == str(row.id).replace("-", "")
        assert (row.expires_at - row.starts_at).days == 30

    def test_buying_again_early_starts_where_the_last_one_ends(self):
        _wallet(30000)
        wallet.buy(TEST_USER, "prediction")
        wallet.buy(TEST_USER, "prediction")
        first, second = Entitlement.objects.order_by("starts_at")
        assert second.starts_at == first.expires_at
        state = wallet.entitlement_state(TEST_USER, "prediction")
        assert state["owned"] is True
        assert state["expires_at"] == second.expires_at.isoformat()
        assert len(_ledger()) == 2

    def test_an_expired_month_is_not_owned(self):
        _wallet(20000)
        wallet.buy(TEST_USER, "prediction")
        Entitlement.objects.update(
            starts_at=timezone.now() - timedelta(days=40),
            expires_at=timezone.now() - timedelta(days=10),
        )
        assert not wallet.owns(TEST_USER, "prediction")

    def test_a_forever_thing_is_never_charged_twice(self):
        _wallet(20000)
        assert wallet.buy(TEST_USER, "muhurat", "vehicle_purchase:2026-10")["already"] is False
        again = wallet.buy(TEST_USER, "muhurat", "vehicle_purchase:2026-10")
        assert again["ok"] is True and again["already"] is True
        assert len(_ledger()) == 1
        assert wallet.balance_of(TEST_USER) == 20000 - MUHURAT

    def test_a_short_wallet_writes_nothing(self):
        _wallet(1000)
        result = wallet.buy(TEST_USER, "prediction")
        assert result == {"ok": False, "reason": wallet.REFUSAL_SHORT_BALANCE, "balance_paise": 1000}
        assert Entitlement.objects.count() == 0 and _ledger() == []

    def test_things_we_do_not_sell(self):
        _wallet(20000)
        assert wallet.buy(TEST_USER, "gold")["reason"] == wallet.REFUSAL_UNKNOWN_SKU
        # a free book, or no book at all, is not for sale
        assert wallet.buy(TEST_USER, "ebook", "not-a-uuid")["ok"] is False
        assert Entitlement.objects.count() == 0

    def test_the_endpoint_takes_no_price_from_the_client(self, api_client, token):
        _wallet(20000)
        response = api_client.post(
            "/v1/wallet/buy/", {"sku": "prediction", "price_paise": 1}, format="json", **auth(token)
        )
        assert response.status_code == 200 and response.json()["ok"] is True
        assert wallet.balance_of(TEST_USER) == 20000 - PREDICTION
        state = api_client.get("/v1/wallet/entitlement/?sku=prediction", **auth(token)).json()
        assert state["owned"] is True and state["price_paise"] == PREDICTION


@pytest.mark.django_db
class TestGates:
    URL = "/v1/astro/muhurat/?purpose=griha_pravesh&lat=18.5&lng=73.9&month=2026-10"

    def test_the_personal_reading_is_402_until_bought(self, api_client, provider, token):
        insert_profile()
        _wallet(20000)
        refused = api_client.get("/v1/astro/horoscope/", **auth(token))
        assert refused.status_code == 402
        assert refused.json()["reason"] == "needs_purchase"
        assert refused.json()["price_paise"] == PREDICTION
        assert provider.calls["daily_horoscope"] == 0  # nothing spent upstream on a refusal

        wallet.buy(TEST_USER, "prediction")
        assert api_client.get("/v1/astro/horoscope/", **auth(token)).status_code == 200

    def test_a_muhurat_is_bought_per_purpose_per_month(self, api_client, provider, token,
                                                       monkeypatch):
        monkeypatch.setattr(astro, "ist_today", lambda: "2026-09-30")
        insert_profile()
        _wallet(20000)
        refused = api_client.get(f"{self.URL}&mine=1", **auth(token))
        assert refused.status_code == 402
        assert refused.json()["ref"] == "griha_pravesh:2026-10"
        assert refused.json()["price_paise"] == MUHURAT
        # the shared, un-judged search stays free
        assert api_client.get(self.URL, **auth(token)).status_code == 200

        wallet.buy(TEST_USER, "muhurat", "griha_pravesh:2026-10")
        assert api_client.get(f"{self.URL}&mine=1", **auth(token)).status_code == 200
        # another month is another purchase
        other = self.URL.replace("2026-10", "2026-11")
        assert api_client.get(f"{other}&mine=1", **auth(token)).status_code == 402


@pytest.mark.django_db
class TestRashifal:
    def test_anybody_reads_a_sign_and_twelve_rows_serve_everybody(self, api_client, provider,
                                                                  monkeypatch):
        monkeypatch.setattr(astro, "ist_today", lambda: "2026-09-30")
        for _ in range(3):
            response = api_client.get("/v1/astro/rashifal/?sign=leo")
            assert response.status_code == 200, response.content
        body = response.json()
        assert body["rashi"] == "Leo" and body["date"] == "2026-09-30"
        assert body["data"]["theme"]["headline"]
        keys = set(AstroCache.objects.values_list("key", flat=True))
        assert keys == {"canon-chart:Leo", "rashifal:Leo:2026-09-30"}
        assert provider.calls["daily_horoscope"] == 1

    def test_every_canonical_moon_is_in_its_own_sign(self, provider):
        # The mock's Moon is a real (truncated) lunar series, so this is
        # the table checked by arithmetic, not by the vendor.
        for sign in astro.RASHIS:
            chart = provider.chart(astro.canonical_body(sign))
            assert astro.moon_sign(chart) == sign, sign

    def test_a_wrong_canonical_birth_refuses(self, api_client, provider, monkeypatch):
        monkeypatch.setitem(astro.CANONICAL_BIRTHS, "Leo", astro.CANONICAL_BIRTHS["Virgo"])
        response = api_client.get("/v1/astro/rashifal/?sign=Leo")
        assert response.status_code == 500
        assert provider.calls["daily_horoscope"] == 0

    def test_a_sign_must_be_a_sign(self, api_client, provider):
        assert api_client.get("/v1/astro/rashifal/?sign=Ophiuchus").status_code == 400


@pytest.mark.django_db
class TestVargas:
    def test_every_division_in_one_call_cached_forever(self, api_client, provider, token):
        insert_profile()
        first = api_client.get("/v1/astro/vargas/", **auth(token))
        assert first.status_code == 200, first.content
        vargas = first.json()["data"]["vargas"]
        assert set(vargas) == {f"D{n}" for n in astro.VARGA_DIVISIONS}
        assert len(vargas["D9"]["planets"]) == 9 and len(vargas["D9"]["houses"]) == 12
        assert api_client.get("/v1/astro/vargas/", **auth(token)).json()["cached"] is True
        assert AstroCache.objects.filter(
            key=f"vargas:{TEST_USER}:{astro.birth_digest(BIRTH)}").count() == 1


@pytest.mark.django_db
class TestEbook:
    def _book(self, price):
        return BhaktiAsset.objects.create(
            kind="ebook", title="A Complete Guide to Beej Mantra", media_url="ebooks/beej.pdf",
            price_paise=price, artist="Namo", licence="All rights reserved", source="Namo original",
        )

    def test_a_priced_file_never_appears_in_the_list(self, api_client):
        self._book(9900)
        [row] = api_client.get("/v1/bhakti/assets/").json()
        assert row["media_url"] is None and row["price_paise"] == 9900

    def test_the_link_is_for_the_buyer(self, api_client, token):
        book = self._book(9900)
        _wallet(20000)
        refused = api_client.get(f"/v1/bhakti/assets/{book.id}/file/", **auth(token))
        assert refused.status_code == 402 and refused.json()["price_paise"] == 9900
        assert wallet.buy(TEST_USER, "ebook", str(book.id))["ok"] is True
        got = api_client.get(f"/v1/bhakti/assets/{book.id}/file/", **auth(token))
        assert got.status_code == 200
        assert got.json()["url"].endswith("/local-private/ebooks/beej.pdf")


@pytest.mark.django_db
class TestGender:
    def test_asked_at_sign_up_and_checked(self, api_client, token):
        ok = api_client.patch("/v1/profiles/me/", {"gender": "female"}, format="json", **auth(token))
        assert ok.status_code == 200 and ok.json()["gender"] == "female"
        assert Profile.objects.get(pk=TEST_USER).gender == "female"
        bad = api_client.patch("/v1/profiles/me/", {"gender": "robot"}, format="json", **auth(token))
        assert bad.status_code == 400
