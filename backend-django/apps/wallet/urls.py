from django.urls import path

from . import views

urlpatterns = [
    path("", views.balance, name="wallet-balance"),
    path("ledger/", views.ledger, name="wallet-ledger"),
    path("spend/", views.spend, name="wallet-spend"),
    path("topup/order/", views.topup_order, name="wallet-topup-order"),
    path("topup/<str:order_id>/", views.topup_state, name="wallet-topup-state"),
    path("webhook/razorpay/", views.razorpay_webhook, name="wallet-razorpay-webhook"),
]
