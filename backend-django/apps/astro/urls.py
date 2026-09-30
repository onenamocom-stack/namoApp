from django.urls import path

from . import views

urlpatterns = [
    path("geo/", views.geo, name="astro-geo"),
    path("panchang/", views.panchang, name="astro-panchang"),
    path("chart/", views.chart, name="astro-chart"),
    path("horoscope/", views.horoscope, name="astro-horoscope"),
    path("vargas/", views.vargas, name="astro-vargas"),
    path("dasha/", views.dasha, name="astro-dasha"),
    path("rashifal/", views.rashifal, name="astro-rashifal"),
    path("match/", views.match, name="astro-match"),
    path("muhurat/", views.muhurat, name="astro-muhurat"),
    path("numerology/", views.numerology, name="astro-numerology"),
]
