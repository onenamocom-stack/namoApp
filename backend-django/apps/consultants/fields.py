"""The consultants tables' text[] columns (007: languages, credentials).

Postgres carries `text[]`; Django's contrib.postgres ArrayField is psycopg-only
and this suite also runs on SQLite, so this field binds a Python list natively
on Postgres (psycopg adapts list -> text[] and reads text[] back as a list)
and a JSON string on SQLite, where it round-trips through from_db_value. The
two backends present the same Python type at the model layer either way.
"""

import json

from django.db import models


class TextArrayField(models.Field):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("default", list)
        super().__init__(*args, **kwargs)

    def db_type(self, connection):
        return "text[]" if connection.vendor == "postgresql" else "text"

    def get_db_prep_value(self, value, connection, prepared=False):
        value = super().get_db_prep_value(value, connection, prepared=False)
        if value is None:
            return None
        if isinstance(value, str):
            value = [value]
        value = list(value)
        if connection.vendor == "postgresql":
            return value
        return json.dumps(value)

    def from_db_value(self, value, expression, connection):
        if value is None or isinstance(value, list):
            return value
        return json.loads(value)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        kwargs.pop("default", None)  # the field re-applies its own default
        return name, path, args, kwargs
