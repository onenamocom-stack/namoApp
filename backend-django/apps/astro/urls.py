from django.urls import path

from . import views

urlpatterns = [
    path("geo/", views.geo, name="astro-geo"),
    path("panchang/", views.panchang, name="astro-panchang"),
    path("chart/", views.chart, name="astro-chart"),
    path("horoscope/", views.horoscope, name="astro-horoscope"),
    path("match/", views.match, name="astro-match"),
    path("muhurat/", views.muhurat, name="astro-muhurat"),
    path("numerology/", views.numerology, name="astro-numerology"),
]
