"""The darshan page from the console (8 Oct 2026): the seed reproduces the
app's eight deities, and the endpoint shows only what is switched on."""

import io

import pytest
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.bhakti.admin import DarshanImageForm
from apps.bhakti.models import DarshanDeity, DarshanImage


@pytest.mark.django_db
def test_seeded_as_the_app_was(client):
    rows = client.get("/v1/bhakti/darshan/").json()
    assert [d["name"] for d in rows][:2] == ["Ganesh", "Shiva"]
    assert len(rows) == 8 and sum(len(d["images"]) for d in rows) == 28
    first = rows[0]["images"][0]
    assert first["image_url"] == "/deities/ganesh-1.webp"
    assert first["title"] == "Seated with attendants" and "Raja Ravi Varma" in first["credit"]


@pytest.mark.django_db
def test_only_what_is_switched_on(client):
    ganesh = DarshanDeity.objects.get(name="Ganesh")
    DarshanImage.objects.filter(deity=ganesh).update(active=False)
    DarshanDeity.objects.filter(name="Shiva").update(active=False)
    lakshmi = DarshanImage.objects.filter(deity__name="Lakshmi").order_by("sort").first()
    lakshmi.temple, lakshmi.location = "Shri Mahalakshmi Mandir", "Kolhapur, Maharashtra"
    lakshmi.save()
    rows = client.get("/v1/bhakti/darshan/").json()
    names = [d["name"] for d in rows]
    assert "Ganesh" not in names and "Shiva" not in names  # no murtis / switched off
    lk = rows[names.index("Lakshmi")]["images"][0]
    assert (lk["temple"], lk["location"]) == ("Shri Mahalakshmi Mandir", "Kolhapur, Maharashtra")


@pytest.mark.django_db
def test_console_needs_a_photo_or_a_link():
    deity = DarshanDeity.objects.first()
    base = {"deity": str(deity.pk), "temple": "Shri X Mandir", "sort": "0", "active": "on"}
    assert not DarshanImageForm(data={**base, "image_url": ""}).is_valid()
    buf = io.BytesIO()
    Image.new("RGB", (3, 4), "orange").save(buf, "PNG")
    png = buf.getvalue()
    form = DarshanImageForm(data={**base, "image_url": ""},
                            files={"upload": SimpleUploadedFile("m.png", png, content_type="image/png")})
    assert form.is_valid(), form.errors
