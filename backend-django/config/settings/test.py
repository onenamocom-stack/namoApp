from .base import *  # noqa

import os
import tempfile

# File-backed rather than :memory:: the idempotency-race and outbox
# concurrency tests run two threads, and each thread needs its own
# connection to the SAME database — :memory: gives every connection a fresh
# empty one. The runner creates test_<name>.sqlite3 alongside and removes it
# at the end of the run.
TEST_DB_DIR = tempfile.mkdtemp(prefix="namo-django-test-")
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.path.join(TEST_DB_DIR, "namo.sqlite3"),
        # timeout: writers wait out the lock instead of failing (the
        # concurrency tests race two threads). journal_mode=DELETE: this
        # environment's sqlite defaults to memory journaling, which reports
        # "database table is locked" immediately and never waits — DELETE
        # restores the busy-timeout behaviour the tests rely on.
        # transaction_mode=IMMEDIATE: without it, a transaction that read
        # before writing hits SQLITE_BUSY *immediately* on lock upgrade
        # while another writer holds the file (sqlite's deadlock avoidance),
        # ignoring the busy timeout. IMMEDIATE takes the write lock at
        # BEGIN, which is also the honest shape for these short write
        # transactions.
        "OPTIONS": {
            "timeout": 30,
            "transaction_mode": "IMMEDIATE",
            "init_command": "PRAGMA journal_mode=DELETE;",
        },
        # Without this the runner swaps sqlite for a shared in-memory DB
        # (file:memorydb_default) and the file/journal settings above are
        # ignored — two threads then trip "database table is locked"
        # immediately instead of waiting out the busy timeout.
        "TEST": {"NAME": os.path.join(TEST_DB_DIR, "test_namo.sqlite3")},
    }
}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "namo-test",
    }
}
