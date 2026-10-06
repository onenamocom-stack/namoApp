"""The products spreadsheet: download, upload, and the SKU as the key
(6 Oct 2026, owner's request: no two products under one id; upload many at
once; download for audit)."""

import io
import uuid

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from openpyxl import load_workbook

from apps.console.models import AdminAction, Tier
from apps.shop import sheet
from apps.shop.models import Product, ShopCategory, ShopSubcategory

from .test_shop_console import _admin


@pytest.fixture
def shelf(db):
    gems = ShopCategory.objects.create(name="Gemstones", sort=1)
    ShopSubcategory.objects.create(category=gems, name="Neelam", sort=1)
    ShopCategory.objects.create(name="Rudraksha", sort=2)
    ruby = Product.objects.create(
        name="Ruby", category=gems, price_paise=100_000, mrp_paise=120_000, stock=4,
        weight_grams=10, image_url="https://cdn.example/ruby.jpg",
        gallery=["https://cdn.example/ruby-2.jpg", "https://cdn.example/ruby.mp4"],
        faq=[{"q": "Certified?", "a": "Yes."}], description="A ruby.\nFrom Burma.",
        brand="NH",
    )
    return gems, ruby


def _rows(data):
    ws = load_workbook(io.BytesIO(data))["Products"]
    rows = list(ws.iter_rows(values_only=True))
    return rows[0], rows[1:]


def _sheet(header, rows):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Products"
    ws.append(header)
    for r in rows:
        ws.append(r)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _row(header, **values):
    return [values.get(h) for h in header]


@pytest.mark.django_db
class TestTheSku:
    def test_every_product_gets_one(self, shelf):
        _, ruby = shelf
        assert ruby.sku == "NAMO-0001"
        assert Product.objects.create(name="Pearl", category=shelf[0], price_paise=1,
                                      stock=1, weight_grams=1).sku == "NAMO-0002"

    def test_the_database_refuses_a_second_product_under_one_sku(self, shelf):
        with pytest.raises(IntegrityError), transaction.atomic():
            Product.objects.create(sku="namo-0001", name="Copy", category=shelf[0],
                                   price_paise=1, stock=1, weight_grams=1)


@pytest.mark.django_db
class TestDownloadThenUpload:
    def test_the_download_is_the_upload_and_changes_nothing(self, shelf):
        _, ruby = shelf
        data = sheet.export_workbook(Product.objects.all())
        header, rows = _rows(data)
        assert list(header) == sheet.HEADERS
        assert rows[0][0] == "NAMO-0001" and rows[0][6] == 1000
        plans, errors = sheet.read_workbook(data)
        assert errors == []
        added, updated, changes = sheet.apply(plans)
        assert (added, updated) == (0, 0), changes
        ruby.refresh_from_db()
        assert ruby.gallery == ["https://cdn.example/ruby-2.jpg", "https://cdn.example/ruby.mp4"]
        assert ruby.faq == [{"q": "Certified?", "a": "Yes."}]

    def test_a_known_sku_updates_and_a_new_one_adds(self, shelf):
        header = sheet.HEADERS
        data = _sheet(header, [
            _row(header, sku="NAMO-0001", name="Ruby (Manik)", category="Gemstones",
                 price_rupees=1100, stock=3, weight_grams=10, gst_percent=3),
            _row(header, sku="NAMO-0101", name="Blue Sapphire", category="gemstones",
                 subcategory="Neelam", price_rupees="18,500", mrp_rupees=24000, stock=2,
                 weight_grams=12, featured="yes", gallery="https://a/1.jpg\nhttps://a/2.mp4",
                 faq="Which finger? | Middle\nWhen? | Saturday"),
        ])
        plans, errors = sheet.read_workbook(data)
        assert errors == []
        added, updated, _ = sheet.apply(plans)
        assert (added, updated) == (1, 1)
        ruby = Product.objects.get(sku="NAMO-0001")
        assert ruby.name == "Ruby (Manik)" and ruby.price_paise == 110_000 and ruby.tax_rate_bps == 300
        new = Product.objects.get(sku="NAMO-0101")
        assert new.price_paise == 1_850_000 and new.subcategory.name == "Neelam" and new.featured
        assert new.faq == [{"q": "Which finger?", "a": "Middle"}, {"q": "When?", "a": "Saturday"}]
        assert new.slug == "blue-sapphire"
        # The same sheet again changes nothing and adds nothing.
        plans, errors = sheet.read_workbook(data)
        assert sheet.apply(plans)[:2] == (0, 0)
        assert Product.objects.count() == 2

    def test_one_bad_row_and_nothing_is_saved(self, shelf):
        header = sheet.HEADERS
        data = _sheet(header, [
            _row(header, sku="NAMO-0001", name="Ruby renamed", category="Gemstones",
                 price_rupees=900, stock=1, weight_grams=10),
            _row(header, sku="", name="No key", category="Gemstones", price_rupees=1, stock=1, weight_grams=1),
            _row(header, sku="NAMO-0200", name="Twin", category="Gemstones", price_rupees=1, stock=1, weight_grams=1),
            _row(header, sku="namo-0200", name="Twin again", category="Gemstones", price_rupees=1, stock=1, weight_grams=1),
            _row(header, sku="NAMO-0300", name="Lost", category="Crystals", price_rupees=1, stock=1, weight_grams=1),
            _row(header, sku="NAMO-0400", name="Cheap MRP", category="Gemstones", price_rupees=100,
                 mrp_rupees=50, stock=1, weight_grams=1, faq="no bar here"),
        ])
        plans, errors = sheet.read_workbook(data)
        text = " ".join(m for _, m in errors)
        assert "SKU is required" in text
        assert "also on row 4" in text
        assert "Crystals" in text and "does not exist" in text
        assert "MRP must be above" in text and "needs a |" in text
        assert Product.objects.get(sku="NAMO-0001").name == "Ruby"

    def test_a_row_cannot_take_another_products_id(self, shelf):
        _, ruby = shelf
        header = sheet.HEADERS
        data = _sheet(header, [_row(header, sku="NAMO-0999", id=str(ruby.id), name="Ruby",
                                    category="Gemstones", price_rupees=1, stock=1, weight_grams=1)])
        _, errors = sheet.read_workbook(data)
        assert any("belongs to NAMO-0001" in m for _, m in errors)

    def test_not_a_spreadsheet(self, db):
        _, errors = sheet.read_workbook(b"not a zip")
        assert errors and "not an .xlsx" in errors[0][1]


@pytest.mark.django_db
class TestTheConsolePages:
    def test_download_and_upload_through_the_console(self, shelf):
        client, _ = _admin(Tier.FULFILMENT)
        response = client.get(reverse("admin:shop_product_export"))
        assert response.status_code == 200
        assert response["Content-Disposition"].startswith('attachment; filename="namo-products-')
        page = client.get(reverse("admin:shop_product_changelist"))
        assert b"Download sheet" in page.content and b"Upload sheet" in page.content
        upload = io.BytesIO(response.content)
        upload.name = "products.xlsx"
        done = client.post(reverse("admin:shop_product_import"), {"sheet": upload})
        assert done.status_code == 200 and b"0 added, 0 changed, 1 unchanged" in done.content
        assert AdminAction.objects.filter(action="product.sheet_upload").exists()
        assert AdminAction.objects.filter(action="product.sheet_download").exists()

    def test_support_can_download_but_not_upload(self, shelf):
        client, _ = _admin(Tier.SUPPORT)
        assert client.get(reverse("admin:shop_product_export")).status_code == 200
        assert client.get(reverse("admin:shop_product_import")).status_code == 403

    def test_the_product_form_page_renders(self, shelf):
        client, _ = _admin(Tier.FULFILMENT)
        page = client.get(reverse("admin:shop_product_change", args=[shelf[1].pk]))
        assert page.status_code == 200
        for label in (b"Add photos or videos", b"Gallery", b"FAQ", b"Search and sharing", b"NAMO-0001"):
            assert label in page.content
        assert uuid  # imported for the id column fixtures
