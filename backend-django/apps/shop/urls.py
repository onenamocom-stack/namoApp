from django.urls import path

from . import views

urlpatterns = [
    path("", views.catalogue, name="shop-catalogue"),
    path("categories/", views.categories, name="shop-categories"),
    path("p/<str:key>/", views.product, name="shop-product"),
    path("buy/", views.buy, name="shop-buy"),
    path("orders/", views.orders, name="shop-orders"),
    path("orders/<uuid:order_id>/dispatch/", views.dispatch, name="shop-dispatch"),
    path("orders/<uuid:order_id>/confirm/", views.confirm_payment, name="shop-confirm"),
    path("orders/<uuid:order_id>/abandon/", views.abandon_payment, name="shop-abandon"),
    path("addresses/", views.addresses, name="shop-addresses"),
    path("addresses/<uuid:address_id>/", views.address, name="shop-address"),
    path("pincode/<str:code>/", views.pincode, name="shop-pincode"),
    path("quote/", views.quote, name="shop-quote"),
    # Shiprocket's form refuses a URL containing "shiprocket", "sr" or "kr".
    path("parcel-updates/", views.tracking_hook, name="shop-tracking-hook"),
]
