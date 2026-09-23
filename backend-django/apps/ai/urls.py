"""Namo AI's endpoints.

The three session routes — start, heartbeat, end — are gone. Billing is
per question now (23 Sep), so there is no clock to start and nothing to
settle. `apps/ai/services` keeps the meter's code and its table so the
rows written during the metered fortnight stay readable; nothing routes
to them.
"""

from django.urls import path

from . import views

urlpatterns = [
    path("", views.state, name="ai-state"),
    path("ask/", views.ask, name="ai-ask"),
    path("tarot/", views.tarot, name="ai-tarot"),
    path("tarot/state/", views.tarot_state, name="ai-tarot-state"),
]
