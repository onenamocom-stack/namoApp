from .base import *  # noqa

DEBUG = False
# Prod fails loudly rather than serving on a misconfiguration.
if not os.environ.get("DJANGO_SECRET_KEY"):
    raise RuntimeError("DJANGO_SECRET_KEY is required in production settings")
if not os.environ.get("DJANGO_ALLOWED_HOSTS"):
    raise RuntimeError("DJANGO_ALLOWED_HOSTS is required in production settings")
if not (SUPABASE_URL or SUPABASE_JWT_SECRET):
    raise RuntimeError("Set SUPABASE_URL (JWKS mode) or SUPABASE_JWT_SECRET (HS256 mode)")
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "1") == "1"

# Hashed names and gzip for the console's CSS. PROD ONLY, and the reason is
# a failure worth not repeating: the manifest backend refuses any file
# collectstatic has not seen, so in tests — where collectstatic never runs
# — every console page 500'd on `admin/css/base.css`. The build runs
# collectstatic; nothing else needs to.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
