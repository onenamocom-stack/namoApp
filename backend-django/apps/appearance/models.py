"""What the app looks like, set from the console (4 Oct 2026, owner's request).

Two things the admin controls without a release:

- **Banners** — the promo rail at the top of Consult, Shop and Bhakti. The
  screens keep their built-in banners as the default; banners added here
  appear first, and a banner marked `replace_defaults` hides the built-in
  ones on that screen while it is showing.
- **Themes** — a festive look: the accent and button colours and an optional
  greeting strip, for a date window. The newest theme whose window includes
  now wins; with none, the app is its usual saffron and green.

Both are public reads (`GET /v1/appearance/`), and both have a start and an
end, so a Diwali banner can be set up a week early and switches itself off.
"""

import uuid

from django.core.validators import RegexValidator
from django.db import models
from django.utils import timezone

HEX = RegexValidator(r"^#[0-9a-fA-F]{6}$", "A colour like #c2410c.")


class Placement(models.TextChoices):
    CONSULT = "consult", "Consult"
    SHOP = "shop", "Shop"
    BHAKTI = "bhakti", "Bhakti"


class LiveQuerySet(models.QuerySet):
    def live(self, now=None):
        now = now or timezone.now()
        return self.filter(active=True).filter(
            models.Q(starts_at__isnull=True) | models.Q(starts_at__lte=now),
            models.Q(ends_at__isnull=True) | models.Q(ends_at__gt=now),
        )


class Banner(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    placement = models.CharField(max_length=16, choices=Placement.choices)
    kicker = models.CharField(max_length=40, blank=True, default="", help_text="Small caps line on top, e.g. NEW or DIWALI")
    title = models.CharField(max_length=80)
    note = models.CharField(max_length=140, blank=True, default="")
    cta = models.CharField("Button text", max_length=30, default="Open")
    kicker_hi = models.CharField(max_length=40, blank=True, default="")
    title_hi = models.CharField(max_length=80, blank=True, default="")
    note_hi = models.CharField(max_length=140, blank=True, default="")
    cta_hi = models.CharField(max_length=30, blank=True, default="")
    link = models.CharField(
        max_length=300,
        blank=True,
        default="",
        help_text="Where a tap goes: an app path like /shop or /muhurat, or a full https:// address. Empty: not tappable.",
    )
    colour_from = models.CharField(max_length=7, default="#7c2d12", validators=[HEX])
    colour_to = models.CharField(max_length=7, default="#c2410c", validators=[HEX])
    image_url = models.TextField(blank=True, default="", help_text="Optional picture behind the text.")
    sort = models.SmallIntegerField(default=0, help_text="Lower comes first.")
    replace_defaults = models.BooleanField(
        default=False, help_text="Hide this screen's built-in banners while this one is showing."
    )
    active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    objects = LiveQuerySet.as_manager()

    class Meta:
        db_table = "banners"
        ordering = ("placement", "sort", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(placement__in=Placement.values), name="banners_placement_valid"
            ),
        ]

    def __str__(self):
        return f"{self.get_placement_display()} · {self.title}"


class Theme(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=60, help_text="For the console only, e.g. Diwali 2026.")
    accent = models.CharField(
        max_length=7, default="#f5782c", validators=[HEX],
        help_text="Replaces the saffron: tabs, highlights, the orange buttons. Usual: #f5782c",
    )
    button = models.CharField(
        max_length=7, default="#45bd82", validators=[HEX],
        help_text="Replaces the green main-action buttons. Usual: #45bd82",
    )
    greeting = models.CharField(
        max_length=80, blank=True, default="", help_text="Optional strip under the top bar, e.g. Shubh Deepavali"
    )
    greeting_hi = models.CharField(max_length=80, blank=True, default="")
    active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    objects = LiveQuerySet.as_manager()

    class Meta:
        db_table = "themes"
        ordering = ("-starts_at", "-created_at")

    def __str__(self):
        return self.name
