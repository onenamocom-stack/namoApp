"""Short links for shares (24 Oct 2026, Rahul: "Can we shorten that link").

  POST /v1/content/links/   {path, ref?} -> {code, url}; the same pair
                            always gets the same code
  GET  /s/<code>            a redirect to 1namo.com<path>[?ref=<ref>]

The redirect is a 302 to the full address, so the existing preview pages
(share.py) still answer WhatsApp's fetch and the referral code still reads
from the address it lands on. Only paths on our own site are stored, so a
short link can never send anyone elsewhere.
"""

import re
import secrets

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import Http404, HttpResponseRedirect
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ShortLink

ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/l/I
LENGTH = 6
PATH = re.compile(r"^/(?!/)[A-Za-z0-9/_.%~-]{0,300}$")
REF = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


def shorten(path, ref=""):
    """The code for this path and referral code, made once."""
    path, ref = (path or "").strip(), (ref or "").strip()
    if not PATH.match(path):
        raise ValidationError({"path": "A path on this site, like /reels/<id>."})
    if ref and not REF.match(ref):
        raise ValidationError({"ref": "Not a referral code."})
    found = ShortLink.objects.filter(path=path, ref=ref).first()
    if found:
        return found
    for _ in range(8):
        code = "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))
        try:
            with transaction.atomic():
                return ShortLink.objects.create(code=code, path=path, ref=ref)
        except IntegrityError:
            # The pair was made a moment ago by another request, or the code is taken.
            found = ShortLink.objects.filter(path=path, ref=ref).first()
            if found:
                return found
    raise RuntimeError("no free short code after eight tries")


def site():
    return (getattr(settings, "APP_PUBLIC_URL", "") or "https://1namo.com").rstrip("/")


def short_url(link):
    return f"{site()}/s/{link.code}"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create(request):
    link = shorten(request.data.get("path"), request.data.get("ref") or "")
    return Response({"code": link.code, "url": short_url(link)})


def follow(request, code):
    link = ShortLink.objects.filter(code=code).first()
    if link is None:
        raise Http404("No such link.")
    target = f"{site()}{link.path}" + (f"?ref={link.ref}" if link.ref else "")
    return HttpResponseRedirect(target)
