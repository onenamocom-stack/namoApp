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
    # The console needs these three; the public API does not touch them.
    # They ship in both images and are simply unrouted when ADMIN_ENABLED
    # is off — one image, two services (docs/02-TRD.md §7, revised).
    "django.contrib.admin",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = ["rest_framework"]
LOCAL_APPS = [
    "apps.core",
    "apps.media",
    "apps.reactions",
    "apps.astro",
    "apps.bhakti",
    "apps.content",
    "apps.consultants",
    "apps.chat",
    "apps.wallet",
    "apps.profiles",
    "apps.ai",
    "apps.shop",
    "apps.notifications",
    "apps.referrals",
    "apps.analytics",
]
# apps.console comes FIRST, before django.contrib.admin, and that order is
# load-bearing: APP_DIRS resolves templates in INSTALLED_APPS order, so an
# app registered after contrib.admin can never override admin/base_site.html
# or admin/index.html. Shadowing them from further down the list fails
# silently — the page simply does not change, with no error anywhere.
INSTALLED_APPS = ["apps.console"] + DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "apps.core.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # Serves the console's CSS. The API has no static files at all; this
    # costs it one no-op middleware and saves a second image.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "apps.core.middleware.RequestIdMiddleware",
    "apps.core.middleware.IdempotencyMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
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

# Index names mirror what Postgres already carries (fake-in parity, module
# 6: consultant_time_off_consultant_idx is 34 chars). SQLite reports no
# identifier limit, so Django's models.E034 check assumes 30 and fires on
# perfectly valid names — silenced for every backend; Postgres enforces the
# real 63-byte limit at migration time.
SILENCED_SYSTEM_CHECKS = ["models.E034"]

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

# --- Shiprocket (stage 5) -------------------------------------------------
# Abzzo's account, borrowed exactly as Razorpay's was. Namo's parcels show
# up in their dashboard and the labels carry their pickup address, which is
# why nothing pushes automatically — see apps/shop/shiprocket.py.
SHIPROCKET_EMAIL = os.environ.get("SHIPROCKET_EMAIL", "")
SHIPROCKET_PASSWORD = os.environ.get("SHIPROCKET_PASSWORD", "")
# The named pickup address on that account. Wrong here means a courier at
# the wrong door — and as of 22 Sep the borrowed account has NO pickup
# address at all (`shipping_address: null`), so "Primary" names nothing
# and every push is refused by their validation. See HANDOFF §23.
SHIPROCKET_PICKUP = os.environ.get("SHIPROCKET_PICKUP", "Primary")

# --- The split (docs/02-TRD.md §7, revised 22 Sep 2026) -------------------
# One image, two Cloud Run services. The public API serves no console URL
# and the console serves no /v1, so a hole in one is not a door into the
# other and the console can sit behind an IP allowlist on its own.
ADMIN_ENABLED = os.environ.get("ADMIN_ENABLED", "1") == "1"
PUBLIC_API_ENABLED = os.environ.get("PUBLIC_API_ENABLED", "1") == "1"
# Not "admin/": a default path is a default attack surface.
ADMIN_PATH = os.environ.get("ADMIN_PATH", "console/")

STATIC_URL = "static/"
STATIC_ROOT = os.environ.get("STATIC_ROOT", os.path.join(BASE_DIR, "staticfiles"))
# The console keeps a session cookie; the API does not issue one. Both
# settings are harmless on the API and load-bearing on the console.
SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "1") == "1"
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "")

# --- Namo AI (rule 7: the model key is server-side only, and it is money)
# "gemini" in prod (needs GEMINI_API_KEY); "mock" elsewhere — deterministic,
# offline, no quota spent. Same shape as ASTRO_PROVIDER above.
AI_PROVIDER = os.environ.get("AI_PROVIDER", "mock")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
# The model name took three tries and the lesson is worth the comment:
# 2.0-flash does not exist on this key at all, and 2.5-flash IS in the
# models listing but answers 404 "no longer available to new users" when
# actually called. A listing is not an entitlement — call the thing.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
GEMINI_BASE_URL = os.environ.get("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com")
AI_TIMEOUT_SECONDS = float(os.environ.get("AI_TIMEOUT_SECONDS", "20"))
# The ceiling on one answer. The prompt asks for three to six sentences;
# this is what makes a runaway answer a truncation rather than a bill.
# Raised from 500 with the 23 Sep rewrite: the answers are four
# paragraphs now, not three sentences, and a ceiling that truncates one
# mid-word is worse than no ceiling. Still a ceiling — a runaway answer
# should be a truncation, not a bill.
AI_MAX_OUTPUT_TOKENS = int(os.environ.get("AI_MAX_OUTPUT_TOKENS", "1200"))
# Gemini 3.x thinking tokens are drawn from the output budget and billed
# at the output rate. Zero for this product: the chart arrives structured
# and the answer is a few sentences of it. Raise it only with a reason.
AI_THINKING_BUDGET = int(os.environ.get("AI_THINKING_BUDGET", "0"))
# ₹9 a QUESTION (docs/01-PRD.md §4.4, reversed from per-minute 23 Sep).
# An env var rather than a constant because it is a price, and a price
# change must not need a deploy — this one changed twice in three days.
AI_PRICE_PAISE = int(os.environ.get("AI_PRICE_PAISE", "900"))

# ── video calls (24 Sep 2026) ───────────────────────────────────────────────
# Daily.co. Empty by default and the feature stays dark when it is — the
# transport is not the money, so a missing key must degrade to "video is
# unavailable" and never to a session that bills for a call nobody can join.
DAILY_API_KEY = os.environ.get("DAILY_API_KEY", "")
DAILY_DOMAIN = os.environ.get("DAILY_DOMAIN", "")  # e.g. 1namo.daily.co

# Recording and transcription stay OFF, and this is a policy line, not a
# default waiting to be flipped. At $0.0059 per unmuted participant-minute
# transcription costs more than the video it transcribes — but the reason
# is the other one: these are people's marriages, money and illnesses, and
# recording them needs consent this product has not asked for.
DAILY_ENABLE_RECORDING = os.environ.get("DAILY_ENABLE_RECORDING", "") == "1"

# ── referrals (24 Sep 2026) ─────────────────────────────────────────────────
# 10% back to the buyer and 10% to the consultant whose code it was, on the
# buyer's FIRST order only.
REFERRAL_CASHBACK_BPS = int(os.environ.get("REFERRAL_CASHBACK_BPS", "1000"))

# The cap per side, per order. **Zero means no cap**, which is where it
# starts on the owner's instruction — the flag exists so a limit can be
# imposed without a deploy the day an order is large enough to want one.
# On today's catalogue an uncapped 10% is ₹2,640 a side on the ₹26,400
# gemstone, which is the number to remember when setting it.
REFERRAL_CASHBACK_CAP_PAISE = int(os.environ.get("REFERRAL_CASHBACK_CAP_PAISE", "0"))

# How long after DELIVERY the cashback sits pending. The return window,
# plus nothing — this is the whole defence against buy, take the cashback,
# spend it on a consultation, return the item.
REFERRAL_HOLD_DAYS = int(os.environ.get("REFERRAL_HOLD_DAYS", "7"))

# What a sign-up referral buys, for BOTH sides: this many free AI questions
# a day, for this many days. The welcome five on day one are untouched —
# they are constant for every account, referred or not.
REFERRAL_AI_DAILY = int(os.environ.get("REFERRAL_AI_DAILY", "3"))
REFERRAL_AI_DAYS = int(os.environ.get("REFERRAL_AI_DAYS", "3"))

# Where an affiliate link points. The server builds the whole URL rather
# than letting the app concatenate one: a consultant's link gets pasted
# into WhatsApp and lives for months, so the shape of it is a contract and
# belongs somewhere one change fixes every link made after it.
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "https://1namo.com")


# The retired per-minute meter still reads this. Nothing new should.
AI_RATE_PAISE = int(os.environ.get("AI_RATE_PAISE", "900"))
# The free allowances (docs/01-PRD.md §4.4): five on arrival, then one a day
# from the next day. Env vars rather than constants so a testing window can
# raise them and put them back without a deploy — and deliberately NOT a
# "skip the quota" flag, which is the kind of switch that gets left on.
AI_WELCOME_FREE = int(os.environ.get("AI_WELCOME_FREE", "5"))
AI_DAILY_FREE = int(os.environ.get("AI_DAILY_FREE", "1"))

# ₹11 a tarot pull (docs/01-PRD.md §4.2), after two free ones a week. Both
# are env vars for the same reason the AI ones are: they are prices and
# allowances, and neither should need a deploy to change. The free count
# lives on the server as of 24 Sep — it used to be two flags in the browser
# that a reload cleared, which made it unlimited.
TAROT_PRICE_PAISE = int(os.environ.get("TAROT_PRICE_PAISE", "1100"))
TAROT_FREE_WEEKLY = int(os.environ.get("TAROT_FREE_WEEKLY", "2"))

# --- Razorpay (module 8; rule 7 — server-side only, never a response body)
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_BASE_URL = os.environ.get("RAZORPAY_BASE_URL", "https://api.razorpay.com")

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
