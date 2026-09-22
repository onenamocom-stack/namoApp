"""Product analytics, in our own database.

WHY NOT POSTHOG OR GA4. Chosen deliberately on 22 Sep: this is an app where
people ask an astrologer about their marriage, their health and their money,
and the pages they visit while doing it say a great deal about them. A third
party would have that for free, and India's DPDP Act would then need a
consent flow and a policy to match. Ours costs a table and a dashboard.

WHAT IS DELIBERATELY NOT COLLECTED:

  * No IP address. It is the single most identifying field a request
    carries and nothing here needs it — "how many people saw the feed"
    does not require knowing which building they were in.
  * No user agent string. A device model and OS version is a fingerprint;
    `platform` below is three values wide on purpose.
  * No free text from the seeker. `props` is written by our own code, never
    by anything they typed.

WHAT IS COLLECTED is a name, a path, and who — because `profile_id` is what
makes "did the people who bought a report come back" answerable at all, and
that question is the reason for the table.
"""

import uuid

from django.db import models
from django.utils import timezone


class Source(models.TextChoices):
    """How somebody arrived. First touch, kept forever on the profile.

    The question is "how many came by referral and how many on their own",
    so `REFERRAL` means an invite code was carried in; `ORGANIC` means
    nothing was. Everything else is a campaign and is named as one.
    """

    ORGANIC = "organic", "Came on their own"
    REFERRAL = "referral", "Invited by somebody"
    CAMPAIGN = "campaign", "Tagged link"
    UNKNOWN = "unknown", "Arrived before this was recorded"


class Event(models.Model):
    """One thing that happened, once.

    Deliberately NOT normalised into a name table. Event names change with
    the product, a join costs more than the bytes it saves, and a text
    column lets a new event start being recorded the day it is written
    rather than the day somebody remembers to add a row.
    """

    id = models.BigAutoField(primary_key=True)
    # Null for a visitor who has not signed in. The feed and the
    # onboarding screens are both visible signed out and both worth
    # counting.
    profile_id = models.UUIDField(null=True, blank=True, db_index=True)
    # A browser-generated id, stable for one visit. It is what turns
    # unrelated rows into a journey without needing an account.
    visit_id = models.UUIDField(db_index=True)
    name = models.CharField(max_length=64, db_index=True)
    # The hash route, with ids stripped — "/consult/:id", never
    # "/consult/8f3e...". A path carrying an id is an event that names a
    # specific consultant every time somebody opens their profile.
    path = models.CharField(max_length=160, blank=True, default="")
    props = models.JSONField(default=dict, blank=True)
    platform = models.CharField(max_length=16, blank=True, default="")
    app = models.CharField(max_length=16, blank=True, default="")  # seeker | pro
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "events"
        ordering = ("-created_at",)
        indexes = [
            # The two shapes every dashboard query takes: "this event over
            # time" and "everything this visit did".
            models.Index(fields=["name", "-created_at"], name="events_name_time_idx"),
            models.Index(fields=["visit_id", "created_at"], name="events_visit_idx"),
        ]

    def __str__(self):
        return f"{self.name} · {self.path}"


class Attribution(models.Model):
    """First touch, one row per profile, never updated.

    Last-touch attribution would credit whoever was in front of somebody
    when they finally paid, which flatters retargeting and tells you
    nothing about where people come from. The question being asked here is
    "how many arrived by referral" — that is a first-touch question, and a
    row that can be overwritten cannot answer it.
    """

    profile_id = models.UUIDField(primary_key=True)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.ORGANIC)
    # The referrer's profile, when there was one. Not a FK: a referrer who
    # deletes their account must not cascade away somebody else's history.
    referrer_id = models.UUIDField(null=True, blank=True, db_index=True)
    campaign = models.CharField(max_length=64, blank=True, default="")
    landed_on = models.CharField(max_length=160, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "attribution"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.profile_id} · {self.source}"
