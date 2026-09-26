from django.urls import path

from . import views

urlpatterns = [
    path("", views.catalogue, name="shop-catalogue"),
    path("buy/", views.buy, name="shop-buy"),
    path("orders/", views.orders, name="shop-orders"),
]
