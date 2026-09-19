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
