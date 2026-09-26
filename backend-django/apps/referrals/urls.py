from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.my_codes, name="referrals-me"),
    path("claim/", views.claim, name="referrals-claim"),
    path("check/", views.check, name="referrals-check"),
    path("link/", views.affiliate_link, name="referrals-link"),
    path("earnings/", views.my_cashback, name="referrals-cashback"),
]
