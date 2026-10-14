from django.urls import path

from . import views

urlpatterns = [
    path("me/", views.my_codes, name="referrals-me"),
    path("claim/", views.claim, name="referrals-claim"),
    path("check/", views.check, name="referrals-check"),
    path("visit/", views.visit, name="referrals-visit"),
    path("first-order/", views.first_order, name="referrals-first-order"),
    path("link/", views.affiliate_link, name="referrals-link"),
    path("earnings/", views.my_cashback, name="referrals-cashback"),
    path("influencer/", views.influencer_stats, name="referrals-influencer"),
    path("creator-earnings/", views.creator_earnings, name="referrals-creator-earnings"),
]
