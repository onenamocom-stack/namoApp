from django.urls import path

from . import views

urlpatterns = [
    path("listings/", views.listings, name="market-listings"),
    path("listings/<uuid:listing_id>/", views.listing, name="market-listing"),
    path("listings/<uuid:listing_id>/take/", views.take, name="market-take"),
    path("listings/<uuid:listing_id>/access/", views.access, name="market-access"),
    path("listings/<uuid:listing_id>/preview/<int:index>/", views.preview, name="market-preview"),
    path("me/listings/", views.my_listings, name="market-my-listings"),
    path("me/listings/<uuid:listing_id>/", views.my_listing, name="market-my-listing"),
    path("me/earnings/", views.my_earnings, name="market-my-earnings"),
    path("me/bank/", views.my_bank, name="market-my-bank"),
]
