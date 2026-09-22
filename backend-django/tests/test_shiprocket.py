"""Shiprocket (stage 5).

Never talks to Shiprocket. Every test patches the client, because the
point is not that their API works — it is that ours behaves when theirs
does not, and that a borrowed account cannot dispatch a real parcel by
accident.
"""

import uuid
from unittest import mock

import pytest
import requests
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.console.models import AdminAction, AdminUser, Tier
from apps.profiles.models import Profile
from apps.shop import shiprocket
from apps.shop.models import Order, OrderItem, Shipment


@pytest.fixture(autouse=True)
def configured(settings):
    settings.SHIPROCKET_EMAIL = "ops@example.test"
    settings.SHIPROCKET_PASSWORD = "not-a-real-password"
    settings.SHIPROCKET_PICKUP = "Primary"
    cache.clear()


def _admin(tier=Tier.FULFILMENT):
    profile_id = uuid.uuid4()
    Profile.objects.create(id=profile_id, phone=str(profile_id)[:15], name="Ops")
    user = User.objects.create_user(username=f"op{profile_id.hex[:8]}", is_staff=True)
    AdminUser.objects.create(profile_id=profile_id, tier=tier, active=True, operator=user)
    client = Client()
    client.force_login(user)
    return client, profile_id


@pytest.fixture
def shipment(db):
    order = Order.objects.create(
        profile_id=uuid.uuid4(), status=Order.Status.PAID, total_paise=185_000
    )
    OrderItem.objects.create(
        order=order, item_type="product", item_id=uuid.uuid4(),
        title="Blue Sapphire", qty=1, unit_price_paise=185_000,
    )
    return Shipment.objects.create(
        order=order,
        address={"name": "A Seeker", "line1": "12 Some Road", "city": "Jaipur",
                 "state": "Rajasthan", "phone": "919999900001"},
        pincode="302001", weight_grams=120, shipping_paise=9000,
        status=Shipment.Status.AWAITING_PAYMENT,
    )


class TestClient:
    def test_a_token_is_cached_not_fetched_every_call(self, settings):
        with mock.patch("apps.shop.shiprocket.requests.post") as post:
            post.return_value.json.return_value = {"token": "t0"}
            post.return_value.raise_for_status.return_value = None
            assert shiprocket._token() == "t0"
            assert shiprocket._token() == "t0"
        assert post.call_count == 1

    def test_a_401_refreshes_the_token_exactly_once(self):
        """Their token can die before the cache does. One forced refresh
        turns that into a hiccup; looping on it would turn a genuine
        credential problem into a hammering."""
        cache.set(shiprocket.TOKEN_KEY, "stale", 60)
        unauthorised = mock.Mock(status_code=401)
        with mock.patch("apps.shop.shiprocket.requests.request",
                        return_value=unauthorised) as request, \
             mock.patch("apps.shop.shiprocket.requests.post") as post:
            post.return_value.json.return_value = {"token": "fresh"}
            post.return_value.raise_for_status.return_value = None
            with pytest.raises(shiprocket.ShiprocketError):
                shiprocket._call("GET", "/anything")
        assert request.call_count == 2

    def test_a_network_failure_is_a_reason_not_a_traceback(self):
        cache.set(shiprocket.TOKEN_KEY, "t", 60)
        with mock.patch("apps.shop.shiprocket.requests.request",
                        side_effect=requests.ConnectionError("down")):
            with pytest.raises(shiprocket.ShiprocketError) as exc:
                shiprocket._call("GET", "/x")
        assert "reach Shiprocket" in str(exc.value)

    def test_their_error_body_never_reaches_our_message(self):
        """A 422 from Shiprocket repeats the customer's address back."""
        cache.set(shiprocket.TOKEN_KEY, "t", 60)
        bad = mock.Mock(status_code=422)
        bad.text = "12 Some Road, Jaipur, 919999900001"
        with mock.patch("apps.shop.shiprocket.requests.request", return_value=bad):
            with pytest.raises(shiprocket.ShiprocketError) as exc:
                shiprocket._call("POST", "/orders/create/adhoc", {})
        assert "Some Road" not in str(exc.value)
        assert "422" in str(exc.value)


@pytest.mark.django_db
class TestPayload:
    def test_the_address_is_the_snapshot_not_the_saved_one(self, shipment):
        """A seeker who moves house must not rewrite where a parcel already
        went — which is why `shipments.address` is jsonb and not a link."""
        body = shiprocket._order_payload(shipment)
        assert body["billing_address"] == "12 Some Road"
        assert body["billing_pincode"] == "302001"

    def test_rupees_on_the_wire_paise_in_the_database(self, shipment):
        body = shiprocket._order_payload(shipment)
        assert body["sub_total"] == "1850.00"
        assert body["order_items"][0]["selling_price"] == "1850.00"

    def test_only_physical_items_are_shipped(self, shipment):
        """An order can hold a chat hold and a gemstone at once — one table,
        `item_type` tells them apart. A courier cannot deliver a session."""
        OrderItem.objects.create(
            order=shipment.order, item_type="session", item_id=uuid.uuid4(),
            title="Namo AI · chat", qty=1, unit_price_paise=900,
        )
        body = shiprocket._order_payload(shipment)
        assert [i["name"] for i in body["order_items"]] == ["Blue Sapphire"]

    def test_everything_is_prepaid(self, shipment):
        """The wallet was already debited. A courier collecting cash for
        something already paid for is a refund conversation."""
        assert shiprocket._order_payload(shipment)["payment_method"] == "Prepaid"


@pytest.mark.django_db
class TestConsoleActions:
    def _run(self, client, action, shipment):
        return client.post(
            reverse("namo:shop_shipment_changelist"),
            {"action": action, "_selected_action": [str(shipment.pk)]},
            follow=True,
        )

    def test_pushing_records_the_provider_id_and_audits_it(self, shipment):
        client, admin_id = _admin()
        with mock.patch("apps.shop.shiprocket.push", return_value="77123"):
            self._run(client, "push_to_shiprocket", shipment)
        shipment.refresh_from_db()
        assert shipment.provider_order_id == "77123"
        assert shipment.status == Shipment.Status.READY
        entry = AdminAction.objects.get(action="shipment.pushed")
        assert entry.detail["provider_order_id"] == "77123"

    def test_a_shipment_is_never_pushed_twice(self, shipment):
        """Two clicks would be two real parcels booked against one order."""
        client, _ = _admin()
        Shipment.objects.filter(pk=shipment.pk).update(provider_order_id="77123")
        with mock.patch("apps.shop.shiprocket.push") as push:
            self._run(client, "push_to_shiprocket", shipment)
        push.assert_not_called()

    def test_support_cannot_dispatch_a_parcel(self, shipment):
        client, _ = _admin(Tier.SUPPORT)
        with mock.patch("apps.shop.shiprocket.push") as push:
            self._run(client, "push_to_shiprocket", shipment)
        push.assert_not_called()

    def test_an_awb_needs_a_push_first(self, shipment):
        client, _ = _admin()
        with mock.patch("apps.shop.shiprocket.assign_awb") as assign:
            self._run(client, "assign_awb", shipment)
        assign.assert_not_called()

    def test_tracking_only_ever_moves_a_parcel_forward(self, shipment):
        """A blip must not walk a shipment backwards out of a status
        somebody already acted on."""
        client, _ = _admin()
        Shipment.objects.filter(pk=shipment.pk).update(
            awb="AWB1", status=Shipment.Status.DELIVERED,
            delivered_at=timezone.now(),
        )
        with mock.patch("apps.shop.shiprocket.track",
                        return_value={"status": "In Transit", "delivered_date": None}):
            self._run(client, "refresh_tracking", shipment)
        shipment.refresh_from_db()
        assert shipment.status == Shipment.Status.DELIVERED

    def test_shiprocket_being_down_reports_and_changes_nothing(self, shipment):
        client, _ = _admin()
        with mock.patch("apps.shop.shiprocket.push",
                        side_effect=shiprocket.ShiprocketError("Could not reach Shiprocket")):
            self._run(client, "push_to_shiprocket", shipment)
        shipment.refresh_from_db()
        assert shipment.provider_order_id is None
        assert shipment.status == Shipment.Status.AWAITING_PAYMENT

    def test_unconfigured_credentials_stop_before_any_call(self, shipment, settings):
        settings.SHIPROCKET_EMAIL = ""
        client, _ = _admin()
        with mock.patch("apps.shop.shiprocket.push") as push:
            self._run(client, "push_to_shiprocket", shipment)
        push.assert_not_called()
