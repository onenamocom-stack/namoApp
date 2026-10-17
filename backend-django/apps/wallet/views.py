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
    """{amount_paise} only — the person chooses what to PAY; what gets
    CREDITED is what Razorpay later reports captured, from the signature-
    verified webhook (rule 3)."""

    amount_paise = serializers.IntegerField()


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
    """Opens a PhonePe checkout: {ok, order_id, amount_paise, url}. Refusal bodies are {ok:false,
    reason} byte-identical to the edge function's, so the top-up sheet
    toasts the same sentence it does today."""
    serializer = TopupInput(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        result = services.create_topup_order(
            request.user.pk, serializer.validated_data["amount_paise"]
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
def phonepe_webhook(request):
    """PhonePe's callback (17 Oct 2026). AllowAny on purpose: the
    Authorization header is the credential (rule 6). The raw bytes go to
    the service untouched by any parser."""
    outcome = services.handle_webhook(
        raw_body=request.body,
        authorization=request.headers.get("Authorization", ""),
    )
    if outcome["json"] is not None:
        return JsonResponse(outcome["json"], status=outcome["status"])
    return HttpResponse(
        outcome["body"], status=outcome["status"], content_type="text/plain"
    )


class BuyInput(serializers.Serializer):
    """{sku, ref} — WHAT to buy, never what it costs (rule 3). The price is
    the server's, read inside `services.buy`."""

    sku = serializers.CharField(max_length=16)
    ref = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def entitlement(request):
    """Owned or not, until when, and the price — `?sku=&ref=`."""
    form = BuyInput(data=request.query_params)
    form.is_valid(raise_exception=True)
    return Response(services.entitlement_state(
        request.user.pk, form.validated_data["sku"], form.validated_data["ref"]))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def buy(request):
    """Charge the wallet and unlock the thing. The 200 body is debit's own
    shape, so the screens toast `reason` exactly as they do for a spend."""
    form = BuyInput(data=request.data)
    form.is_valid(raise_exception=True)
    return Response(services.buy(
        request.user.pk, form.validated_data["sku"], form.validated_data["ref"]))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pay(request):
    """A PhonePe checkout for something kept (an e-book when
    EBOOK_PAY_ONLINE is on, a Market listing). {sku, ref} in, never a
    price. Out: {already: True}, or {already: False, checkout: {order_id,
    amount_paise, url}} for the checkout page."""
    form = BuyInput(data=request.data)
    form.is_valid(raise_exception=True)
    try:
        opened = services.open_entitlement_payment(
            request.user.pk, form.validated_data["sku"], form.validated_data["ref"])
    except services.Refusal as refusal:
        return Response({"ok": False, "reason": refusal.reason}, status=refusal.status)
    if opened["already"]:
        return Response({"ok": True, "already": True})
    return Response({"ok": True, "already": False, "checkout": {
        "order_id": opened["order_id"], "amount_paise": opened["amount_paise"],
        "url": opened["url"]}})


class PayConfirmInput(serializers.Serializer):
    order_id = serializers.CharField(max_length=64)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def pay_confirm(request):
    """The checkout closed, for any checkout (top-up, e-book, listing):
    the server asks PhonePe what happened and settles it now rather than
    when the webhook lands."""
    form = PayConfirmInput(data=request.data)
    form.is_valid(raise_exception=True)
    return Response(services.confirm_checkout(request.user.pk, form.validated_data["order_id"]))
