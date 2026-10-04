from django.urls import path

from . import views

urlpatterns = [
    path("", views.list_consultants, name="consultants-list"),
    path("price-bands/", views.price_bands, name="consultants-price-bands"),
    path("apply/", views.apply, name="consultants-apply"),
    path("me/", views.me, name="consultants-me"),
    path("me/payout-details/", views.my_payout_details, name="consultants-payout-details"),
    path("me/insights/", views.my_insights, name="consultants-insights"),
    path("presence/", views.presence, name="consultants-presence"),
    path("bookings/", views.book, name="consultants-book"),
    path("bookings/mine/", views.my_bookings, name="consultants-my-bookings"),
    path(
        "bookings/<uuid:booking_id>/decide/",
        views.decide,
        name="consultants-decide",
    ),
    path("<uuid:consultant_id>/", views.detail, name="consultants-detail"),
    path("<uuid:consultant_id>/services/", views.service_list, name="consultants-services"),
    path("<uuid:consultant_id>/slots/", views.slots, name="consultants-slots"),
    path(
        "<uuid:consultant_id>/availability/",
        views.availability,
        name="consultants-availability",
    ),
    path(
        "<uuid:consultant_id>/availability/set/",
        views.set_availability,
        name="consultants-set-availability",
    ),
    path(
        "<uuid:consultant_id>/bookings/",
        views.consultant_bookings,
        name="consultants-bookings",
    ),
    path(
        "<uuid:consultant_id>/earnings/",
        views.earnings,
        name="consultants-earnings",
    ),
    path(
        "<uuid:consultant_id>/earnings/summary/",
        views.earnings_summary,
        name="consultants-earnings-summary",
    ),
]
