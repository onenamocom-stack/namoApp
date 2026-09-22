# Cloud Run image for the Namo API (docs/07-DJANGO-MIGRATION.md §8).
#
# Deliberately boring: one stage, no compiled extensions to build. psycopg
# ships as `psycopg[binary]`, so there is no libpq-dev / gcc to install and
# the image stays small without a builder stage earning its complexity.
#
# Cloud Run sets $PORT and can change it between revisions, so the entrypoint
# reads it rather than hardcoding 8080. Binding a fixed port is the usual
# reason a container passes locally and never becomes ready up there.

FROM python:3.13-slim

# - PYTHONUNBUFFERED: Cloud Run reads stdout; buffered logs arrive late or
#   not at all when a container is killed.
# - PYTHONDONTWRITEBYTECODE: the filesystem is ephemeral and read-mostly.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app

# Dependencies first, in their own layer: requirements.txt changes far less
# often than the application, so a code edit does not reinstall Django.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The console's static files, collected at BUILD time so the container
# starts with them and the ephemeral filesystem never matters. The comment
# this replaces said to add collectstatic and whitenoise "in the same
# commit as an admin route" — this is that commit.
#
# Run with placeholder settings: collectstatic only needs STATIC_ROOT, and
# making the build depend on the real database or the real secrets would
# mean a build that cannot run without production.
RUN DJANGO_SETTINGS_MODULE=config.settings.base \
    DJANGO_SECRET_KEY=build-only DJANGO_ALLOWED_HOSTS='*' \
    SUPABASE_URL=https://build.invalid \
    python manage.py collectstatic --noinput --clear

# Two workers, not one: a single worker makes a slow upstream (the astro
# provider, Razorpay) block health checks. Threads on top because the work
# is I/O-bound. --timeout 0 hands request timeouts to Cloud Run, which
# already enforces its own and will kill the instance anyway.
CMD exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT:-8080}" \
    --workers 2 \
    --threads 8 \
    --timeout 0 \
    --access-logfile - \
    --error-logfile -
