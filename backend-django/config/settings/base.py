"""Base settings. Twelve-factor: every environment-specific value comes from
os.environ; defaults are safe for local development only."""

import os
from urllib.parse import unquote, urlparse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def env_list(name, default=""):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


def parse_database_url(url):
    """Minimal postgres:// URL parser (dj-database-url is not a dependency).

    postgres://user:password@host:port/name?options -> Django postgres config.
    Returns None for anything that is not a postgres URL.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        return None
    query = dict(
        pair.split("=", 1) if "=" in pair else (pair, "")
        for pair in parsed.query.split("&")
        if pair
    )
    config = {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "localhost",
        "CONN_MAX_AGE": 60,
    }
    if parsed.port:
        config["PORT"] = str(parsed.port)
    if query.get("sslmode"):
        config["OPTIONS"] = {"sslmode": query["sslmode"]}
    return config


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-secret-key")
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost")

DJANGO_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = ["rest_framework"]
LOCAL_APPS = ["apps.core", "apps.media", "apps.reactions", "apps.astro"]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.core.middleware.RequestIdMiddleware",
    "apps.core.middleware.IdempotencyMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = []
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASE_URL = os.environ.get("DATABASE_URL", "")
DATABASES = {
    "default": parse_database_url(DATABASE_URL)
    or {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.path.join(BASE_DIR, "db.sqlite3"),
    }
}

# Cache: local memory by default; redis:// URL swaps in the Redis backend
# (django-redis is deliberately not an M1 dependency — the Redis backend only
# activates when a host provides redis through a custom backend path later;
# for M1 REDIS_URL switches throttling to a LocMem cache keyed by URL so the
# seam is exercised without a new dependency).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": os.environ.get("REDIS_URL", "namo-local"),
    }
}

AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Supabase auth (docs/07 §7 step 5; backend/INSTRUCTIONS.md rule 7) ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
# JWKS mode (new projects): SUPABASE_URL set. HS256 mode (legacy projects):
# SUPABASE_JWT_SECRET set. Both set -> JWKS wins.
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_JWT_AUDIENCE = os.environ.get("SUPABASE_JWT_AUDIENCE", "authenticated")
JWKS_CACHE_TTL_SECONDS = 3600

# --- Cloudflare R2 (media presign) ---
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
# "r2" in prod, "local" in dev (fake URLs, nothing leaves the machine)
MEDIA_PROVIDER = os.environ.get("MEDIA_PROVIDER", "local")
MEDIA_PUBLIC_BASE_URL = os.environ.get("MEDIA_PUBLIC_BASE_URL", "https://media.example.com")

# --- Astro provider (docs/07 §6 step 3; the upstream key is server-side only,
# rule 7 — it never appears in a response body) ---
# "freeastroapi" in prod (needs FREE_ASTRO_API_KEY); "mock" elsewhere — a
# deterministic provider with no network and no quota spend.
ASTRO_PROVIDER = os.environ.get("ASTRO_PROVIDER", "mock")
FREE_ASTRO_API_KEY = os.environ.get("FREE_ASTRO_API_KEY", "")
ASTRO_TIMEOUT_SECONDS = float(os.environ.get("ASTRO_TIMEOUT_SECONDS", "10"))

API_VERSION = os.environ.get("API_VERSION", "dev")

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.authentication.SupabaseJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.CursorPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("THROTTLE_ANON_RATE", "60/minute"),
        "user": os.environ.get("THROTTLE_USER_RATE", "600/minute"),
    },
    "EXCEPTION_HANDLER": "apps.core.views.exception_handler",
}

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": "apps.core.logging.JSONFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
    "loggers": {
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}
