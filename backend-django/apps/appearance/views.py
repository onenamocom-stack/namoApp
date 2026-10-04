from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Banner, Theme


def _banner(b):
    return {
        "id": str(b.id),
        "placement": b.placement,
        "kicker": b.kicker,
        "title": b.title,
        "note": b.note,
        "cta": b.cta,
        "hi": {"kicker": b.kicker_hi, "title": b.title_hi, "note": b.note_hi, "cta": b.cta_hi},
        "link": b.link,
        "from": b.colour_from,
        "to": b.colour_to,
        "image_url": b.image_url or None,
        "replace_defaults": b.replace_defaults,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def appearance(request):
    """Everything the app needs to look the way the console set it: the live
    banners for every screen, and the live theme or null. One small public
    read at app start."""
    theme = Theme.objects.live().order_by("-starts_at", "-created_at").first()
    return Response(
        {
            "banners": [_banner(b) for b in Banner.objects.live()],
            "theme": None
            if theme is None
            else {
                "name": theme.name,
                "accent": theme.accent,
                "button": theme.button,
                "greeting": theme.greeting,
                "greeting_hi": theme.greeting_hi,
            },
        }
    )
