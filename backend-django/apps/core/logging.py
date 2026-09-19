"""JSON log formatter with request-id injection (docs/07 §7 step 6).

The request id travels on `request._logging_extra`; LoggerAdapter on the
request exposes `logger = request.log` with the id pre-bound. Formatter
pulls any `request_id` on the record into the payload.
"""

import json
import logging
import time


class JSONFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        for key in ("extra",):
            data = getattr(record, key, None)
            if isinstance(data, dict):
                payload.update(data)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


class RequestLoggerAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        kwargs.setdefault("extra", {}).setdefault("request_id", self.extra["request_id"])
        return msg, kwargs
