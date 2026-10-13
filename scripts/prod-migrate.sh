#!/usr/bin/env bash
# Production migrations, from the deploy copy (13 Oct 2026).
#
#   bash scripts/prod-migrate.sh <app> [<app> ...]
#
# Runs `manage.py migrate <app>` for each named app against the production
# database, using the code in the deploy copy (NAMO_DEPLOY_DIR, default
# C:/namoapi/backend-django) — never main, which can carry migrations that
# are not cleared to go live (Namo's share, consultants/0010). The database
# URL is read from backend-django/.env and never printed. Shows the plan
# for each app before applying it.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: bash scripts/prod-migrate.sh <app> [<app> ...]" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="${NAMO_DEPLOY_DIR:-C:/namoapi/backend-django}"
PY="$ROOT/backend-django/.venv/Scripts/python.exe"

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ROOT/backend-django/.env" | cut -d= -f2-)"
if [ -z "$DATABASE_URL" ]; then
  echo "No DATABASE_URL in backend-django/.env" >&2
  exit 1
fi
export DATABASE_URL
export DJANGO_SETTINGS_MODULE=config.settings.local

cd "$DEPLOY"
for app in "$@"; do
  case "$app" in
    *[!a-z_]*) echo "Not an app name: $app" >&2; exit 2 ;;
  esac
  echo "== $app: plan"
  "$PY" manage.py migrate "$app" --plan
  echo "== $app: apply"
  "$PY" manage.py migrate "$app"
done
