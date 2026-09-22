from django.urls import path

from . import views

urlpatterns = [path("", views.collect, name="analytics-collect")]
