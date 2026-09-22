"""Wallet + payments endpoints — the /v1/wallet surface the store.jsx
wallet slice calls after cutover (cutovers/wallet.clientlib.js), plus
the Razorpay webhook.

Parity notes, call for call with the Supabase the client talks to today:

  balance      supabase.from('wallets').select('balance_paise').single()
               -> GET /v1/wallet/ — the wallets_select_own policy as the
               caller's own row; no wallet reads as balance 0 with
               wallet_exists false, so the client keeps its null-means-
               not-loaded distinction honest
  ledger       supabase.from('ledger').select('*').order(created_at desc)
               -> GET /v1/wallet/ledger/?after=<id>&limit=<n> — keyset,
                 newest first, raw snake_case rows exactly like PostgREST
  spend        supabase.rpc('wallet_debit', {p_amount_paise, p_kind})
               -> POST /v1/wallet/spend/ {amount_paise, kind} — 005's
                 function; the 200 body IS the function's jsonb ({ok,
                 reason?, balance_paise?}) so the refusal sentences and
                 the post-refusal balance travel byte-identically
  topup order  supabase.functions.invoke('razorpay-order', {amount_paise})
               -> POST /v1/wallet/topup/order/ — refusal bodies are
                 {ok:false, reason} exactly like the edge function's
  topup status (polls the balance today; this is the honest payment read)
               -> GET /v1/wallet/topup/<order_id>/
  webhook      the razorpay-webhook Edge Function
               -> POST /v1/wallet/webhook/razorpay/ — AllowAny, the
                 signature IS the authentication; plain-text answers,
                 statuses 401/400/500/200 exactly like the function

The webhook is the one endpoint without auth: Razorpay cannot present a
Supabase JWT. Nothing in the body is trusted until the HMAC of the raw
bytes matches (rule 6). It is a plain Django view (not DRF) because the
answers are plain text and the body must stay unparsed until verified —
DRF's parser would touch it first.
"""

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import services


class SpendInput(serializers.Serializer):
    """What spend() sends — an amount (a debit is not a number the user
    benefits from, 005) and the label the user reads. The wallet is the
    caller's own; there is no identity in this body (rule 3)."""

    amount_paise = serializers.IntegerField()
    kind = serializers.CharField()


class TopupInput(serializers.Serializer):
    """{amount_paise} — the person chooses what to PAY; what gets CREDITED
    is what Razorpay later reports captured, from the signature-verified
    webhook (rule 3). Or {order_id} (phase 10): pay for a pending shop or
    Academy order, whose amount the server reads."""

    amount_paise = serializers.IntegerField(required=False)
    order_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        if ("amount_paise" in attrs) == ("order_id" in attrs):
            raise serializers.ValidationError("Send amount_paise or order_id.")
        return attrs


class LedgerQuery(serializers.Serializer):
    after = serializers.UUIDField(required=False, default=None)
    limit = serializers.IntegerField(required=False, default=50, min_value=1,
                                     max_value=200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def balance(request):
    """The caller's own balance row (wallets_select_own). Raw read, not
    ORM: this module's wallet truth is the format-agnostic SQL in
    services, so a wallet row is found whatever shape its id is stored
    in. No wallet answers balance 0 with wallet_exists false — the
    client keeps its null-means-not-loaded distinction honest."""
    balance_paise = services.balance_of(request.user.pk)
    return Response(
        {
            "profile_id": str(request.user.pk),
            "balance_paise": balance_paise if balance_paise is not None else 0,
            "wallet_exists": balance_paise is not None,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ledger(request):
    """The caller's own ledger, newest first, keyset-paged (see
    LedgerQuery) — ledger_select_own as a query."""
    query = LedgerQuery(data=request.query_params)
    query.is_valid(raise_exception=True)
    return Response(
        services.list_ledger(
            request.user.pk,
            after=query.validated_data["after"],
            limit=query.validated_data["limit"],
        )
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def spend(request):
    """005's wallet_debit. The 200 body is the function's jsonb itself —
    {ok, reason?, balance_paise?} — so every caller of store.jsx's spend()
    sees the same strings and the same post-refusal balance it sees
    today; a refusal is a structured reason, never a silent 200."""
    serializer = SpendInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(
        services.debit(
            request.user.pk,
            serializer.validated_data["amount_paise"],
            serializer.validated_data["kind"],
        )
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def topup_order(request):
    """Opens a Razorpay order for checkout. Refusal bodies are {ok:false,
    reason} byte-identical to the edge function's, so the top-up sheet
    toasts the same sentence it does today."""
    serializer = TopupInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        result = services.create_topup_order(
            request.user.pk,
            serializer.validated_data.get("amount_paise"),
            order_id=serializer.validated_data.get("order_id"),
        )
    except services.Refusal as refusal:
        return Response({"ok": False, "reason": refusal.reason},
                        status=refusal.status)
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def topup_state(request, order_id):
    """The terminal outcome of one of the caller's own top-ups — None
    becomes a 404 so order ids do not leak existence."""
    result = services.topup_status(request.user.pk, order_id)
    if result is None:
        return Response(
            {"ok": False, "reason": "not_found",
             "message": "No such payment on this account."},
            status=404,
        )
    return Response(result)


@csrf_exempt
@require_POST
def razorpay_webhook(request):
    """The razorpay-webhook Edge Function's handler. AllowAny on purpose:
    the signature over the RAW body is the credential (rule 6). The raw
    bytes go to the service untouched by any parser; the answers are
    plain text with the function's exact statuses."""
    outcome = services.handle_webhook(
        raw_body=request.body,
        signature=request.headers.get("x-razorpay-signature", ""),
        event_id=request.headers.get("x-razorpay-event-id"),
    )
    if outcome["json"] is not None:
        return JsonResponse(outcome["json"], status=outcome["status"])
    return HttpResponse(
        outcome["body"], status=outcome["status"], content_type="text/plain"
    )
