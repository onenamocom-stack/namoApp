# backend-django

The Django API skeleton from `docs/07-DJANGO-MIGRATION.md` Phase 1 — the layer every later module lands on. Cross-cutting only: Supabase-JWT auth, role permissions, request ids, idempotency keys, the outbox, rate limiting, and R2 media presign. No business logic yet (no wallet, chat, content).

## Run the tests

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
DJANGO_SETTINGS_MODULE=config.settings.test .venv/bin/python -m pytest -q
.venv/bin/python manage.py check
```

Tests run on SQLite and need no services, no network, no secrets. Copy `.env.example` to fill in real values for local development.

## Where Phase 1 ends

`/v1/health/`, `/v1/me/`, `POST /v1/media/presign/`, `GET /v1/media/<id>/` — everything else (reactions, astro, bhakti, content, consultants, chat, wallet, profile) is a later phase in `docs/07-DJANGO-MIGRATION.md` §6. The outbox dispatches via `manage.py dispatch_outbox`; Celery arrives with the first module that needs background work. See `tasks/README` for where that wrapper goes.
