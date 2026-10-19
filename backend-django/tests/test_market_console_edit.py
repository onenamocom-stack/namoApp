"""The console corrects a seller's listing itself (19 Oct 2026, Rahul:
"admin can change the product field ... otherwise for every change he has
to send product back to seller")."""

import pytest

from apps.console.models import AdminAction, Tier
from apps.market import services
from apps.market.models import Listing
from apps.shop.models import Product, ShopCategory

from .test_console import _admin
from .test_market import CREATOR, _download, creator  # noqa: F401

URL = "/console/market/listing/{}/change/"


def _product():
    ShopCategory.objects.create(name="Maalas", sort=1)
    ShopCategory.objects.create(name="Bracelets", sort=2)
    row = services.create(CREATOR, {"kind": "product", "title": "Tulsi Mala", "cover_url": "https://x/c.jpg",
                                    "price_paise": 89000, "stock": 10, "weight_grams": 150,
                                    "category_name": "Maalas"})
    return services.approve(row, "admin")


def _post(client, row, **over):
    form = {"title_text": row.title, "price_rupees": str(row.price_paise / 100),
            "mrp_rupees": str(row.mrp_paise / 100) if row.mrp_paise else "",
            "description_box": row.description, "cover_box": row.cover_url,
            "category_box": row.category_name, "stock_box": row.stock or "", "weight_box": row.weight_grams or "",
            "review_note": "", "decision": ""}
    form.update(over)
    return client.post(URL.format(row.pk), form)


@pytest.mark.django_db
class TestConsoleEdit:
    def test_an_approved_product_changes_at_once_and_stays_live(self, creator):  # noqa: F811
        row = _product()
        Product.objects.filter(pk=row.product_id).update(stock=4)  # four sold since
        client, _ = _admin(Tier.FULFILMENT)
        got = _post(client, row, title_text="Tulsi Mala, 108 beads", price_rupees="799", mrp_rupees="1299",
                    category_box="Bracelets", description_box="Hand made.")
        assert got.status_code == 302
        row.refresh_from_db()
        assert (row.status, row.title, row.price_paise, row.mrp_paise) == ("approved", "Tulsi Mala, 108 beads",
                                                                          79900, 129900)
        p = Product.objects.get(pk=row.product_id)
        assert (p.name, p.price_paise, p.mrp_paise, p.category.name, p.description, p.active, p.stock) == (
            "Tulsi Mala, 108 beads", 79900, 129900, "Bracelets", "Hand made.", True, 4)
        assert AdminAction.objects.filter(action="market_listing.edit").exists()

    def test_the_sellers_rules_still_hold(self, creator):  # noqa: F811
        row = _product()
        client, _ = _admin(Tier.FULFILMENT)
        got = _post(client, row, mrp_rupees="500")  # below the price
        assert got.status_code == 200 and b"The MRP must be above the price" in got.content
        row.refresh_from_db()
        assert row.mrp_paise is None

    def test_a_pending_download_is_fixed_and_approved_in_one_save(self, creator):  # noqa: F811
        row = _download(price=9900)
        client, _ = _admin(Tier.SUPPORT)
        page = client.get(URL.format(row.pk))
        assert page.status_code == 200 and b"price_rupees" in page.content and b"stock_box" not in page.content
        got = _post(client, row, title_text="Navgraha Mantra Book (Hindi)", price_rupees="0", decision="approve")
        assert got.status_code == 302
        row = Listing.objects.get(pk=row.pk)
        assert (row.status, row.title, row.price_paise) == ("approved", "Navgraha Mantra Book (Hindi)", 0)

    def test_saving_untouched_changes_nothing(self, creator):  # noqa: F811
        row = _product()
        client, _ = _admin(Tier.FULFILMENT)
        assert _post(client, row).status_code == 302
        assert not AdminAction.objects.filter(action="market_listing.edit").exists()
