/**
 * CUTOVER — module 8 (wallet + payments): the wallet slice of src/store.jsx,
 * rewritten against the Django API. Staged, NOT applied — module 9 finishes
 * the rest of the store split.
 *
 * ── SAME-COMMIT NOTES FOR THE STORE SPLIT (module 8's half) ────────────────
 * store.jsx keeps its state, its re-entrancy guards (spendingRef /
 * toppingUpRef — the client half of the double-tap protection) and every
 * export. Only the wallet BLOCK changes, and only its internals:
 *
 *   1. import { createWalletApi } from './lib/wallet.js'   (this file)
 *      plus const walletApi = createWalletApi({
 *        getToken, showToast, setBalance, balanceRef })
 *      near the top of AppProvider, with setLedger added to the
 *      options. `supabase` stays imported in store.jsx — the session
 *      still comes from Supabase Auth, and the access token IS the
 *      Django credential (the API verifies Supabase JWTs).
 *   2. refreshWallet(userId)  -> `return walletApi.refreshWallet(userId)`
 *      (state setters move inside the api; the two-reads-apply-
 *      independently comment in store.jsx still holds — the api keeps it)
 *   3. spend(amount, label)   -> `return walletApi.spend(amount, label)`
 *      (the spendingRef guard STAYS in store.jsx, before the call)
 *   4. topup(amountPaise)     -> `return walletApi.topup(amountPaise)`
 *      (the toppingUpRef guard STAYS in store.jsx)
 *   5. toLedgerRow / formatLedgerDate move HERE (they are wallet shaping);
 *      `rupees` STAYS in store.jsx — Wallet.jsx and five screens import it
 *      from there, and module 9 owns that move.
 *   6. The two lint warnings about setBalance exhaustive-deps disappear
 *      with the refactor; no other file imports the moved helpers.
 *
 * ── THE CUTOVER WINDOW (docs/07 §6 step 8 — the ONE module with a freeze) ──
 * Wallet + payments stop changing on the Supabase side for one deploy.
 * Order, exactly:
 *   1. FEATURE FREEZE the money paths: no schema, client or edge-function
 *      changes to wallet/payments until step 6 is quiet.
 *   2. Deploy the Django API with RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and
 *      RAZORPAY_WEBHOOK_SECRET set (test-mode keys until Razorpay's
 *      website review clears — the band and every refusal are identical).
 *   3. `manage.py migrate --fake-initial` against the production database:
 *      wallets/ledger/payments already exist (003/006); nothing is created.
 *      Prod's phase-2 triggers stay in force — Django's services speak the
 *      same SQL and never double-write what a trigger does.
 *   4. In the Razorpay dashboard, point the webhook at
 *      {API}/v1/wallet/webhook/razorpay/ and re-save so the secret matches
 *      RAZORPAY_WEBHOOK_SECRET. The signature-verified credit is idempotent
 *      on provider_payment_id in the SAME tables both systems write, so a
 *      delivery straddling the switch cannot credit twice — but switch once,
 *      deliberately, and verify with one test-mode payment end to end.
 *   5. Release the client with steps 1-6 of the store split above. The
 *      seeker build flips in the same commit; the pro build never carried
 *      the wallet.
 *   6. Quiet week: run `manage.py reconcile_payments` after the first real
 *      payments and once mid-week (read-only; it names anyone owed). Then
 *      retire the razorpay-order/razorpay-webhook edge functions and revoke
 *      the wallet/payments RLS grants in a follow-up migration (docs/07
 *      §6 step 11 — only after the client has been quiet).
 *
 * ── WHAT THE UI SEES ────────────────────────────────────────────────────────
 * Byte-parity is the contract (backend/INSTRUCTIONS.md §2): the refusal
 * sentences below are the server's own, and the top-up flow is unchanged —
 * order -> Razorpay checkout.js in the browser -> webhook credits -> the
 * balance poll (8 x 1.5s) -> "Payment is still settling. Pull down in a
 * moment." The browser still never sees the key secret; key_id is public.
 */

import { supabase } from './supabase.js'

const API = import.meta.env.VITE_DJANGO_API_URL
if (!API) throw new Error('VITE_DJANGO_API_URL is not set')

/* The module-1 seam: the existing supabase-js session authorizes against
   Django — identity stays in Supabase Auth; getSession() reads the local
   token without a network round trip (chat.clientlib.js's pattern). */
async function getToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${API}/v1/wallet${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    /* A refusal the server shaped as plain text (webhook-style answers). */
  }
  return { status: response.status, body: payload }
}

/* ── the store.jsx wallet shaping, moved (toLedgerRow/formatLedgerDate) ──────
   Same fields Wallet.jsx renders: label, kind, amountPaise, date, method.
   `amountPaise`, not `amount` — the old field held rupees, and a row
   carrying the same name with a hundred-fold different value is the bug
   the rename exists to make impossible. */
export function toLedgerRow(row) {
  return {
    id: row.id,
    label: row.kind,
    kind: row.delta_paise > 0 ? 'credit' : 'debit',
    amountPaise: Math.abs(row.delta_paise),
    date: formatLedgerDate(row.created_at),
    method: row.ref_type === 'payment' ? 'UPI' : 'Wallet',
  }
}

export function formatLedgerDate(iso) {
  const at = new Date(iso)
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/* ── the wallet API store.jsx wires in ───────────────────────────────────────
   setBalance is the store's useCallback setter pair (ref + state) — passed
   in so balanceRef.current stays the live number across topup's poll. */
export function createWalletApi({
  getToken: tokenFn = getToken,
  showToast,
  setBalance,
  setLedger,
  balanceRef,
  /* store.jsx has the profile and session; it passes these at wiring
     time so the checkout prefill and the poll's userId need no second
     source of truth. */
  prefill = {},
  getUserId = () => null,
}) {
  /* store.jsx's refreshWallet. Balance and ledger apply independently: a
     failed balance read must not throw away a ledger that loaded fine. */
  async function refreshWallet(userId) {
    if (!userId) {
      setBalance(null)
      setLedger([])
      return
    }
    const token = await tokenFn()
    const [wallet, rows] = await Promise.all([
      call('/', { token }),
      call('/ledger/?limit=50', { token }),
    ])
    /* Two reads, applied independently. Bailing on the wallet error also
       threw away a ledger that had loaded fine, and left `balance` at null
       with nothing to bring it back — the wallet then shows an em dash for
       the life of the tab. Apply what arrived, and let the caller retry. */
    if (wallet.status !== 200 || !wallet.body) {
      console.error('[wallet] load failed:', wallet.status)
    } else {
      setBalance(wallet.body.balance_paise)
    }
    if (rows.status !== 200 || !rows.body) {
      console.error('[ledger] load failed:', rows.status)
    } else {
      setLedger(rows.body.map(toLedgerRow))
    }
  }

  /* store.jsx's spend. `amount` is RUPEES (the mock catalogue's unit);
     converted to paise here, once — nothing above this line sees paise.
     The server decides: this never compares against `balance`. */
  async function spend(amount, label) {
    const token = await tokenFn()
    const { status, body } = await call('/spend/', {
      method: 'POST',
      token,
      body: { amount_paise: Math.round(amount * 100), kind: label },
    })
    if (status !== 200 || !body) {
      console.error('[wallet] debit failed:', status)
      showToast('Could not reach the wallet. Try again.')
      return false
    }
    if (!body.ok) {
      showToast(body.reason ?? 'Could not take that payment.')
      /* A refusal can carry the real balance — take it, in case the
         number on screen was the thing that was wrong. */
      if (typeof body.balance_paise === 'number') setBalance(body.balance_paise)
      return false
    }
    setBalance(body.balance_paise)
    return true
  }

  /* store.jsx's topup — the one money path that does not end inside the tap
     that started it: the credit arrives via the webhook on a different
     connection, so this polls the balance for about twelve seconds and
     then says the payment is settling. NOTHING here credits anything. */
  async function topup(amountPaise) {
    const token = await tokenFn()
    const order = await call('/topup/order/', {
      method: 'POST',
      token,
      body: { amount_paise: amountPaise },
    })
    if (order.status !== 200 || !order.body?.ok) {
      console.error('[topup] order failed:', order.status)
      /* The refusal sentence is the server's own (the band, sign-in,
         provider down) — the server's job is a reason the interface can
         show, and dropping it here wastes that. */
      showToast(order.body?.reason ?? 'Could not start that payment. Try again.')
      return false
    }
    const { order_id, key_id } = order.body

    try {
      await loadCheckout()
    } catch (err) {
      console.error('[topup] checkout script:', err.message)
      showToast('Could not load checkout. Check your connection.')
      return false
    }

    const paid = await new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: key_id,
        order_id,
        amount: amountPaise,
        currency: 'INR',
        name: 'Namo',
        description: 'Wallet top-up',
        prefill,
        theme: { color: '#1a1a1a' },
        handler: () => resolve(true),
        modal: { ondismiss: () => resolve(false) },
      })
      /* A card declined at the bank is not a dismissal and not a success —
         without this the promise never settles and the button stays dead. */
      rzp.on('payment.failed', () => resolve(false))
      rzp.open()
    })

    if (!paid) return false

    showToast('Payment received. Adding it to your wallet.')
    /* The webhook is a separate request on a separate connection and it may
       land after this line. Poll rather than guess a delay: stop the moment
       the balance moves, give up after about twelve seconds — the money is
       in `ledger` either way, and a reload shows it. */
    const before = balanceRef.current
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      await refreshWallet(getUserId())
      if (balanceRef.current !== before) return true
    }
    showToast('Payment is still settling. Pull down in a moment.')
    return true
  }

  return { refreshWallet, spend, topup }
}

/* Razorpay's checkout script, fetched the first time somebody adds money and
   never again. Not in index.html: a third-party script on every route, for a
   sheet most sessions never open, is a tax on every other screen. Same
   promise-cache as store.jsx — a failed load clears it so a retry actually
   retries. */
let checkoutLoad = null
export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  if (!checkoutLoad) {
    checkoutLoad = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = 'https://checkout.razorpay.com/v1/checkout.js'
      el.onload = resolve
      el.onerror = () => {
        checkoutLoad = null
        reject(new Error('checkout script failed to load'))
      }
      document.head.appendChild(el)
    })
  }
  return checkoutLoad
}
