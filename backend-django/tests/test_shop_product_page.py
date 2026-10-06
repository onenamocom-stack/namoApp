"""The product page and the categories the app draws (6 Oct 2026).

Owner's list: a product needs a description, FAQ, search/share text, more
than one photo and a brand, on a page of its own — and a category renamed
in the console must be renamed in the app.
"""

import pytest
from rest_framework.test import APIClient

from apps.shop.admin import ProductForm, text_to_faq
from apps.shop.models import Product, ShopCategory, ShopSubcategory


@pytest.fixture
def category(db):
    return ShopCategory.objects.create(name="Gemstones", sort=1)


def _form(category, **extra):
    data = {
        "name": "Blue Sapphire (Neelam)", "category": category.pk, "price": "1850",
        "stock": "5", "weight_grams": "12", "tax_rate_bps": "0", "active": "on",
    }
    data.update(extra)
    return ProductForm(data=data)


@pytest.mark.django_db
class TestTheForm:
    def test_the_page_fields_are_saved(self, category):
        form = _form(
            category,
            brand="Navratna House",
            description="Ceylon sapphire, 5.25 ratti.\n\nWear on the middle finger.",
            gallery_text="https://cdn.example/a.jpg\nhttps://cdn.example/b.jpg\n",
            faq_text="Is it certified?\nYes, with a lab card.\n\nWhich finger?\nThe middle finger, on a Saturday.",
            seo_title="Blue Sapphire 5.25 ratti",
        )
        assert form.is_valid(), form.errors
        product = form.save()
        assert product.brand == "Navratna House"
        assert product.gallery == ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]
        assert product.faq == [
            {"q": "Is it certified?", "a": "Yes, with a lab card."},
            {"q": "Which finger?", "a": "The middle finger, on a Saturday."},
        ]
        assert product.slug == "blue-sapphire-neelam"

    def test_a_question_without_an_answer_is_refused(self, category):
        form = _form(category, faq_text="Is it certified?")
        assert not form.is_valid()
        assert "faq_text" in form.errors

    def test_a_gallery_line_that_is_not_an_address_is_refused(self, category):
        form = _form(category, gallery_text="not a url")
        assert not form.is_valid()
        assert "gallery_text" in form.errors

    def test_a_taken_slug_typed_by_hand_is_refused(self, category):
        assert _form(category, slug="neelam").save()
        form = _form(category, name="Another", slug="neelam")
        assert not form.is_valid()
        assert "slug" in form.errors

    def test_the_edit_form_shows_gallery_and_faq_as_text(self, category):
        product = _form(category, gallery_text="https://cdn.example/a.jpg",
                        faq_text="Q1\nA1").save()
        form = ProductForm(instance=product)
        assert form.fields["gallery_text"].initial == "https://cdn.example/a.jpg"
        assert form.fields["faq_text"].initial == "Q1\nA1"

    def test_faq_text_parses_crlf(self):
        assert text_to_faq("Q\r\nA\r\n\r\nQ2\r\nA2") == [{"q": "Q", "a": "A"}, {"q": "Q2", "a": "A2"}]


@pytest.mark.django_db
class TestTheEndpoints:
    def test_the_page_by_slug_and_by_id(self, category):
        product = _form(category, description="Line one.\nLine two.", brand="NH",
                        gallery_text="https://cdn.example/b.jpg",
                        image_url="https://cdn.example/a.jpg",
                        faq_text="Q\nA").save()
        api = APIClient()
        by_slug = api.get(f"/v1/shop/p/{product.slug}/").json()
        by_id = api.get(f"/v1/shop/p/{product.id}/").json()
        assert by_slug == by_id
        assert by_slug["images"] == ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"]
        assert by_slug["brand"] == "NH"
        assert by_slug["faq"] == [{"q": "Q", "a": "A"}]
        # Nobody wrote search text: it falls back to the name and the
        # description's first line.
        assert by_slug["seo_title"] == product.name
        assert by_slug["seo_description"] == "Line one."

    def test_a_product_taken_down_is_not_found(self, category):
        product = _form(category).save()
        Product.objects.filter(pk=product.pk).update(active=False)
        assert APIClient().get(f"/v1/shop/p/{product.slug}/").status_code == 404
        assert APIClient().get("/v1/shop/p/no-such-thing/").status_code == 404

    def test_categories_follow_the_console(self, category):
        ShopSubcategory.objects.create(category=category, name="Neelam", sort=2)
        ShopSubcategory.objects.create(category=category, name="Pukhraj", sort=1)
        ShopCategory.objects.create(name="Rudraksha", sort=2)
        api = APIClient()
        rows = api.get("/v1/shop/categories/").json()
        assert [r["name"] for r in rows] == ["Gemstones", "Rudraksha"]
        assert rows[0]["subcategories"] == ["Pukhraj", "Neelam"]
        # A rename in the console is a rename in the app, and the products
        # carry the new name.
        ShopCategory.objects.filter(pk=category.pk).update(name="Gems")
        _form(category).save()
        assert api.get("/v1/shop/categories/").json()[0]["name"] == "Gems"
        assert {p["category"] for p in api.get("/v1/shop/").json()} == {"Gems"}
