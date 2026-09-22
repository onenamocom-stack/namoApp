from django.urls import path

from . import views

shop_urls = [
    path("catalogue/", views.catalogue, name="shop-catalogue"),
    path("addresses/", views.addresses, name="shop-addresses"),
    path("quote/", views.quote, name="shop-quote"),
    path("checkout/", views.checkout, name="shop-checkout"),
    path("orders/", views.my_orders, name="shop-orders"),
    path("orders/<uuid:order_id>/", views.order_status, name="shop-order-status"),
    path("orders/<uuid:order_id>/cancel/", views.cancel_order, name="shop-order-cancel"),
]

academy_urls = [
    path("", views.academy, name="academy"),
    path("courses/<uuid:course_id>/lessons/", views.lessons, name="academy-lessons"),
    path("event-links/", views.event_links, name="academy-event-links"),
    path("materials/", views.materials, name="academy-materials"),
    path("materials/url/", views.material_url, name="academy-material-url"),
    path("enrol/", views.enrol, name="academy-enrol"),
]
