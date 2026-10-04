"""Banners and themes set from the console (4 Oct 2026)."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.appearance.models import Banner, Theme
from apps.console.models import AdminAction, Tier

from .test_console import _admin

URL = "/v1/appearance/"


def _banner(**kw):
    data = {"placement": "consult", "title": "Diwali offer", "cta": "See it", "link": "/shop"}
    data.update(kw)
    return Banner.objects.create(**data)


@pytest.mark.django_db
class TestPublicRead:
    def test_only_live_banners_in_order(self, api_client):
        now = timezone.now()
        second = _banner(title="Second", sort=2)
        first = _banner(title="First", sort=1, title_hi="पहला")
        _banner(title="Off", active=False)
        _banner(title="Later", starts_at=now + timedelta(days=1))
        _banner(title="Over", ends_at=now - timedelta(minutes=1))
        _banner(title="Shop one", placement="shop")

        body = api_client.get(URL).json()
        consult = [b for b in body["banners"] if b["placement"] == "consult"]
        assert [b["title"] for b in consult] == ["First", "Second"]
        assert consult[0]["hi"]["title"] == "पहला"
        assert consult[0]["link"] == "/shop" and consult[0]["from"].startswith("#")
        assert {b["title"] for b in body["banners"]} == {"First", "Second", "Shop one"}
        assert str(first.id) in {b["id"] for b in consult} and str(second.id) in {b["id"] for b in consult}

    def test_no_theme_is_null(self, api_client):
        assert api_client.get(URL).json()["theme"] is None

    def test_the_newest_live_theme_wins(self, api_client):
        now = timezone.now()
        Theme.objects.create(name="Navratri", accent="#c2185b", starts_at=now - timedelta(days=5))
        Theme.objects.create(name="Diwali", accent="#d4a017", greeting="Shubh Deepavali", starts_at=now - timedelta(days=1))
        Theme.objects.create(name="Holi", accent="#8e44ad", starts_at=now + timedelta(days=30))
        Theme.objects.create(name="Old", accent="#000000", ends_at=now - timedelta(days=1))
        theme = api_client.get(URL).json()["theme"]
        assert theme["name"] == "Diwali" and theme["accent"] == "#d4a017"
        assert theme["greeting"] == "Shubh Deepavali"


@pytest.mark.django_db
class TestConsole:
    def _form(self, **kw):
        data = {
            "placement": "shop", "kicker": "NEW", "title": "Festive gemstones", "note": "", "cta": "Shop now",
            "kicker_hi": "", "title_hi": "", "note_hi": "", "cta_hi": "", "link": "/shop",
            "colour_from": "#7c2d12", "colour_to": "#c2410c", "image_url": "", "sort": "0",
            "replace_defaults": "", "active": "on", "starts_at_0": "", "starts_at_1": "", "ends_at_0": "", "ends_at_1": "",
        }
        data.update(kw)
        return data

    def test_fulfilment_adds_a_banner_and_it_is_audited(self):
        client, admin_id = _admin(Tier.FULFILMENT)
        response = client.post(reverse("namo:appearance_banner_add"), self._form())
        assert response.status_code == 302, response.content.decode()[:2000]
        banner = Banner.objects.get()
        assert banner.title == "Festive gemstones"
        assert AdminAction.objects.filter(action="banner.create", admin_id=admin_id).exists()

    def test_a_link_must_be_an_app_path_or_https(self):
        client, _ = _admin(Tier.FULFILMENT)
        response = client.post(reverse("namo:appearance_banner_add"), self._form(link="javascript:alert(1)"))
        assert response.status_code == 200
        assert not Banner.objects.exists()

    def test_support_cannot_change_the_look(self):
        client, _ = _admin(Tier.SUPPORT)
        assert client.get(reverse("namo:appearance_banner_changelist")).status_code in (302, 403)
