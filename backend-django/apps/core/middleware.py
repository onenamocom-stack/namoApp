import json
import logging
import uuid

from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.utils.deprecation import MiddlewareMixin

from .models import IdempotencyKey

logger = logging.getLogger("apps.core.middleware")


class RequestIdMiddleware(MiddlewareMixin):
    """One uuid per request: response header, logging context, and a
    correlation id for the idempotency and outbox logs."""

    def process_request(self, request):
        request.request_id = str(uuid.uuid4())
        # Mapped by logging.JSONFormatter into every record this request emits.
        request._logging_extra = {"request_id": request.request_id}

    def process_response(self, request, response):
        response["X-Request-Id"] = getattr(request, "request_id", str(uuid.uuid4()))
        return response


class IdempotencyMiddleware(MiddlewareMixin):
    """Client idempotency keys on every mutating request (docs/07 §3.1).

    POST/PATCH/DELETE carrying an `Idempotency-Key` header: the first request
    executes the view and — only for 2xx — stores status+body under
    (key, user). A replay returns the stored response without re-executing.
    The unique constraint on (key, user) is the race backstop: two
    concurrent first-requests, one stored row, the loser re-reads it.
    Requests without the header pass through untouched.
    """

    METHODS = ("POST", "PATCH", "DELETE")

    def process_request(self, request):
        if request.method not in self.METHODS:
            return None
        key = request.headers.get("Idempotency-Key")
        if not key:
            return None
        user_key = self._user_key(request)
        if user_key is None:
            # Unauthenticated mutating calls carry no idempotency guarantee;
            # auth failures must not mint replay rows. Pass through and let
            # the view/permission layer answer.
            return None
        try:
            with transaction.atomic():
                record = (
                    IdempotencyKey.objects.select_for_update()
                    .filter(key=key, user_id=user_key)
                    .first()
                )
                if record is not None:
                    return self._replay_response(record, request)
                # Mark the key in-flight *before* the view runs: a unique
                # violation here means a concurrent request won the race.
                # The inner atomic is a savepoint — an IntegrityError must
                # not abort the outer transaction's later reads.
                try:
                    with transaction.atomic():
                        IdempotencyKey.objects.create(
                            key=key,
                            user_id=user_key,
                            method=request.method,
                            path=request.path,
                        )
                except IntegrityError:
                    winner = IdempotencyKey.objects.get(key=key, user_id=user_key)
                    return self._replay_response(winner, request)
                request._idempotency_pending = (key, user_key)
                return None
        except IntegrityError:
            # Concurrent commit edge: re-read the committed winner.
            winner = IdempotencyKey.objects.filter(key=key, user_id=user_key).first()
            if winner is not None:
                return self._replay_response(winner, request)
            raise

    def process_response(self, request, response):
        pending = getattr(request, "_idempotency_pending", None)
        if pending is None:
            return response
        if not (200 <= response.status_code < 300):
            # Only 2xx is stored (docs/07 §3.1: replay guarantees for
            # successful writes; a refused or failed request must run again).
            key, user_key = pending
            IdempotencyKey.objects.filter(key=key, user_id=user_key).delete()
            return response
        key, user_key = pending
        body = self._serializable_body(response)
        try:
            IdempotencyKey.objects.filter(key=key, user_id=user_key).update(
                status_code=response.status_code,
                response_body=body,
            )
        except IntegrityError:
            logger.warning("idempotency store raced", extra={"request_id": getattr(request, "request_id", "")})
        response["Idempotency-Replayed"] = "false"
        return response

    def process_exception(self, request, exception):
        pending = getattr(request, "_idempotency_pending", None)
        if pending is not None:
            IdempotencyKey.objects.filter(key=pending[0], user_id=pending[1]).delete()
        return None

    def _user_key(self, request):
        # Populated by DRF's authentication inside the view, which runs after
        # middleware — so we scope by Authorization header identity: the
        # token's `sub` claim. Two different users sharing a key get separate
        # rows by design (the constraint is (key, user), not key alone).
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        return self._sub_for_token(auth[7:])

    @staticmethod
    def _sub_for_token(token):
        try:
            import jwt as pyjwt

            claims = pyjwt.decode(token, options={"verify_signature": False})
            return claims.get("sub")
        except Exception:
            return None

    @staticmethod
    def _serializable_body(response):
        if hasattr(response, "data") and isinstance(response.data, (dict, list)):
            # DRF Response — already parsed.
            return response.data
        try:
            return json.loads(response.content.decode("utf-8"))
        except (ValueError, UnicodeDecodeError, AttributeError):
            return None

    @staticmethod
    def _replay_response(record, request):
        if record.status_code is None:
            # In-flight marker (the winning request is still executing, or
            # died before storing): a replay would be a lie. Ask the client
            # to retry, rather than fabricate a response.
            return JsonResponse(
                {"ok": False, "reason": "request_in_flight", "message": "That request is still running. Try again."},
                status=409,
            )
        response = HttpResponse(
            content=json.dumps(record.response_body),
            content_type="application/json",
            status=record.status_code,
        )
        response["Idempotency-Replayed"] = "true"
        response["X-Request-Id"] = getattr(request, "request_id", "")
        return response
