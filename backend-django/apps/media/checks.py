"""Fail at boot, not at the first upload.

`MEDIA_PROVIDER=r2` with empty R2 credentials starts perfectly happily
and then raises `ValueError: Invalid endpoint:` out of botocore the first
time somebody saves a product photo — which was a 500 on a console form,
at the exact moment an operator was trying to do their job.

It has happened for the same underlying reason three times in this repo:
`set -a; . file` failing silently and every `${R2_*}` expanding to an
empty string. Values get fixed; the class does not. A deployment that
cannot possibly store a file should say so while it is starting.
"""

from django.core.checks import Error, register


@register()
def media_provider_is_usable(app_configs, **kwargs):
    from django.conf import settings

    if getattr(settings, "MEDIA_PROVIDER", "") != "r2":
        return []

    missing = [
        name for name in ("R2_ENDPOINT", "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET")
        if not getattr(settings, name, "")
    ]
    if not missing:
        return []
    return [
        Error(
            "MEDIA_PROVIDER is 'r2' but " + ", ".join(missing) + " is empty.",
            hint=(
                "Every upload will fail with 'Invalid endpoint:' from botocore. "
                "Set them, or set MEDIA_PROVIDER=local to fabricate URLs in dev."
            ),
            id="media.E001",
        )
    ]
