"""Analytics in the console (stage 4).

Two model pages for looking at raw rows, and one dashboard that answers the
questions as they were actually asked: who came to which page, what they
used, how many sales, and how many arrived by referral rather than on their
own.
"""

import json

from django.contrib import admin as dj
from django.template.response import TemplateResponse
from django.urls import path

from apps.console.models import Tier
from apps.console.site import at_least, site

from . import periods, services
from .models import Attribution, Event


class ReadOnly:
    """Nothing in analytics is edited. An event is a record of something
    that happened, and a dashboard built on rows somebody can correct is a
    dashboard nobody can cite."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return at_least(request, Tier.SUPPORT, Tier.FINANCE)

    def has_module_permission(self, request):
        return at_least(request, Tier.SUPPORT, Tier.FINANCE)


@dj.register(Event, site=site)
class EventAdmin(ReadOnly, dj.ModelAdmin):
    list_display = ("created_at", "name", "path", "app", "platform", "visit_id", "profile_id")
    list_filter = ("name", "app", "platform", "created_at")
    search_fields = ("name", "path")
    date_hierarchy = "created_at"
    list_per_page = 100

    def get_urls(self):
        """The dashboard hangs off this model's URLs rather than living at
        the console root: it is the analytics page, and putting it here
        means it inherits the same permission check as the rows it reads."""
        return [
            path("dashboard/", site.admin_view(self.dashboard),
                 name="analytics_dashboard"),
        ] + super().get_urls()

    def dashboard(self, request):
        window = periods.resolve(request.GET.get("period"))
        context = {
            **site.each_context(request),
            "title": window["label"],
            "window": window,
            "choices": periods.CHOICES,
            "cards": services.headline(window),
            # Serialised here rather than in the template: Django's
            # `json_script` is the only safe way to get data into a <script>
            # tag, and building JSON out of template filters is how the
            # first cut of this page rendered "₹True".
            "charts": json.dumps({
                "revenue": services.revenue_series(window),
                "traffic": services.traffic_series(window),
                "signups": services.signup_series(window),
                "mix": services.revenue_mix(window),
                "acquisition": services.acquisition_mix(window),
            }),
            "paths": services.paths_in(window),
            "features": services.features_in(window),
        }
        return TemplateResponse(request, "console/dashboard.html", context)


@dj.register(Attribution, site=site)
class AttributionAdmin(ReadOnly, dj.ModelAdmin):
    """First touch, one row per profile, never updated — so there is
    nothing here to change even if the tier allowed it."""

    list_display = ("profile_id", "source", "referrer_id", "campaign", "landed_on", "created_at")
    list_filter = ("source", "created_at")
    search_fields = ("campaign", "landed_on")
    date_hierarchy = "created_at"
