import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import { pro, user } from './data/mock.js'
import { translate } from './data/i18n.js'
import { supabase } from './lib/supabase.js'
import { bookSession as book, myConsultant } from './lib/consultants.js'
import { clearAstroCache } from './lib/astro.js'
import { fetchMine as fetchMyReactions, parseKey, setReaction } from './lib/reactions.js'
import { createWalletApi } from './lib/wallet.js'
import { createProfileApi } from './lib/profile.js'
import { buy as buyFromShop } from './lib/shop.js'

/**
 * In-memory store for prototype state (cart, remaining AI questions, toast
 * messages — still nothing persisted, nothing fetched) plus the parts that
 * are now real: `session` and `profile` from Supabase auth and the `profiles`
 * table (phase 1), and `balance`, `ledger` and `spend` from `wallets` and
 * `ledger` (phase 2). `birth` stays the in-progress onboarding draft before
 * it is written; once a profile exists, screens read `profile`, not `birth`.
 *
 * `spend` returns a PROMISE. It used to return a boolean, and `if (promise)`
 * is always truthy — a caller that forgets to await it lets through a purchase
 * the server refused.
 *
 * Which side of the app you are on is NOT state. HashRouter is mounted above
 * AppProvider in main.jsx, so the provider can read the URL — and the URL is
 * already the single source of truth. Storing a role beside it would only
 * create something that can disagree with the address bar.
 */
const AppStore = createContext(null)

const EMPTY_BIRTH = {
  name: '',
  date: '',
  time: '',
  place: '',
  lat: null,
  lon: null,
  // IANA name of the birth place's zone, from the geocoder in AskPlace. Never
  // defaulted and never an offset — docs/05-BACKEND-SCHEMA.md §4.1.
  zone: '',
  phone: '',
  email: '',
}

/* The one draft that outlives a reload, and the only reason is the SMS step:
   reading the code means leaving the app, and a phone is free to evict the
   page while you are in Messages. Losing the draft there is silent — the
   account gets created and the birth details never arrive. sessionStorage, not
   localStorage, so an abandoned signup clears itself with the tab. */
const BIRTH_KEY = 'namo:birth-draft'

/** Dropped once the draft has become a real `profiles` row. Exported rather
 *  than the key itself: a second copy of the string in another file is the
 *  kind of duplicate that survives a rename and silently stops clearing. */
export function clearBirthDraft() {
  try {
    sessionStorage.removeItem(BIRTH_KEY)
  } catch {
    /* Storage denied. The draft dies with the tab anyway. */
  }
}

function readBirthDraft() {
  try {
    return { ...EMPTY_BIRTH, ...JSON.parse(sessionStorage.getItem(BIRTH_KEY) || '{}') }
  } catch {
    return EMPTY_BIRTH
  }
}

export function AppProvider({ children }) {
  // Which side we are on, and therefore who "me" is.
  const isPro = useLocation().pathname.startsWith('/pro')

  const [birth, setBirth] = useState(readBirthDraft)

  useEffect(() => {
    try {
      sessionStorage.setItem(BIRTH_KEY, JSON.stringify(birth))
    } catch {
      /* Private mode with storage denied. The draft simply stays in memory. */
    }
  }, [birth])

  /* Auth. `sessionReady` flips once on first load — before that we don't yet
     know whether the visitor is signed in, so nothing should redirect on
     their behalf. `profile` is the real `profiles` row for the signed-in
     user; it starts null and is refetched whenever the session changes. */
  const [session, setSession] = useState(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  /* Wallet — real from phase 2, and the first thing in this store the browser
     cannot lie about. `balance` is PAISE, read back from the server under RLS.
     The client has no write policy anywhere near `wallets` or `ledger`, so
     devtools can move the number on screen and the next read puts it back.

     `null` means not loaded yet, and it is deliberately not 0 — a wallet
     briefly showing ₹0 to someone who has money is worse than showing nothing.

     `spending` stops a double-tap becoming a double-charge. It is a ref as
     well as state because two taps land in the same tick and state set by the
     first has not applied by the second. The ref is what refuses; the state is
     only what greys the button out. Guarding here rather than at each button
     means a call site that forgets its pending state still cannot double
     charge — there are five of them and the plan expects one to be missed. */
  const [balance, setBalanceState] = useState(null)
  const [ledger, setLedger] = useState([])
  const [spending, setSpending] = useState(false)
  const spendingRef = useRef(false)
  const [toppingUp, setToppingUp] = useState(false)
  const toppingUpRef = useRef(false)

  /* `balance` read inside a running callback is the value that callback closed
     over. `topup` polls across several awaits waiting for a webhook to land,
     so it needs the current number, not the one from the render that started
     it. Every setter goes through here so the two cannot separate. */
  const balanceRef = useRef(null)
  const setBalance = useCallback((next) => {
    balanceRef.current = next
    setBalanceState(next)
  }, [])

  /* Same reason as balanceRef, for the two values the wallet api reads across
     an await: the checkout prefill and the id it re-reads the wallet with.
     Passing `profile` and `session` into the api by value would freeze them
     at whatever was mounted when it was built, and a person who signed in
     after that would check out with an empty name. */
  const profileRef = useRef(null)
  const sessionRef = useRef(null)

  /* The signed-in user's `consultants` row, or null. Phase 4: consultant-ness
     is the existence of this row — there is no role column and no persisted
     flag, for the same reason `isPro` is derived from the URL. `null` means
     both "not a consultant" and "not loaded yet", which is why the gate waits
     on `consultantLoading` rather than on the row.

     It is read for every signed-in user, not only on /pro: a consultant who
     opens the seeker side is still a consultant, and one fetch on sign-in is
     cheaper than a fetch on every route change. */
  const [consultant, setConsultant] = useState(null)
  const [consultantLoading, setConsultantLoading] = useState(false)
  /* A failed read is not the same answer as "no row", and here the difference
     is a screen: the gate sends anyone without a `consultants` row to the
     application, so an errored fetch would show a working consultant a signup
     form for the practice they already have. It has already happened once on
     production — a `JWT issued at future` from clock skew — and the UI could
     not tell the two apart. `refreshProfile` carries the same warning about
     wallets; this is that lesson, applied where it bites harder. */
  const [consultantError, setConsultantError] = useState(false)

  const refreshConsultant = useCallback(async (userId) => {
    if (!userId) {
      setConsultantError(false)
      return setConsultant(null)
    }
    setConsultantLoading(true)
    /* `myConsultant()` answers what the `.from('consultants')` read used to,
       and the filtering it needed is now the server's: the JWT is the
       identity, so there is no `.eq('profile_id', userId)` left to get
       wrong. That filter was load-bearing under PostgREST — `consultants`
       is not an own-row-only table, `consultants_select_approved` makes
       every approved practice readable by everybody, and an unfiltered read
       here once returned all of them and failed with "multiple rows",
       showing a real consultant the application form for a practice they
       already had.

       Null for "not a consultant" survives: it is the common case, not an
       error, and `/me/` returns the pending row too. `userId` stays in the
       signature because the caller still gates on it. */
    try {
      const data = await myConsultant()
      setConsultantError(false)
      setConsultant(data ?? null)
    } catch (err) {
      console.error('[consultant] load failed:', err.message)
      setConsultantError(true)
      setConsultant(null)
    }
    setConsultantLoading(false)
  }, [])

  /* The api owns the read and the state it lands in; the store owns the
     "is anybody signed in" guard and the shape every screen consumes.
     The warning that outlived the move: a failed load and "no profile" are
     still both null here, and every screen then falls back to seed identity
     — a signed-in person shown the mock user's name and birth data. Phase 1
     has no error UI for it; the api logs so it stays diagnosable. */
  const profileApi = useMemo(
    () => createProfileApi({ setProfile, setProfileLoading }),
    [],
  )
  const refreshProfile = useCallback(
    (userId) => profileApi.refreshProfile(userId),
    [profileApi],
  )
  /* Onboarding's reveal screen writes the birth details through this. It
     throws Error(server message) on a refusal, which is what Computing.jsx's
     existing setSaveError(error.message) path already renders. */
  const saveProfile = useCallback(
    (fields) => profileApi.saveProfile(fields),
    [profileApi],
  )

  /* Declared here rather than beside the rest of the UI state, and the
     reason is the wallet api below: it toasts the refusal sentences the
     server gives, so it has to be built after `showToast` exists. A const
     read before its initializer is a ReferenceError at render, which makes
     the whole provider throw and the app mount as a blank page — a green
     build and a clean lint say nothing about it. */
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const showToast = useCallback((message) => {
    setToast(message)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2400)
  }, [])

  /* Neither read carries a user id: it was RLS that scoped them to the
     caller's own rows before, and it is the JWT that does it now. The
     two-reads-apply-independently rule moved into the api with them —
     bailing on a failed balance also threw away a ledger that had loaded
     fine, and left `balance` at null with nothing to bring it back, which
     disables every Buy button for the life of the tab.

     `prefill` and `getUserId` are passed as getters rather than values so
     the api reads the current profile and session on each call; capturing
     them would freeze the checkout prefill at whatever was mounted first. */
  const walletApi = useMemo(
    () =>
      createWalletApi({
        showToast,
        setBalance,
        setLedger,
        balanceRef,
        prefill: () => ({
          name: profileRef.current?.name ?? '',
          email: profileRef.current?.email ?? '',
          contact: sessionRef.current?.user?.phone ?? '',
        }),
        getUserId: () => sessionRef.current?.user?.id ?? null,
      }),
    [showToast, setBalance],
  )
  const refreshWallet = useCallback(
    (userId) => walletApi.refreshWallet(userId),
    [walletApi],
  )

  useEffect(() => {
    profileRef.current = profile
  }, [profile])
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    let active = true

    supabase.auth
      .getSession()
      .then(({ data: { session: initial } }) => {
        if (!active) return
        setSession(initial)
        if (initial) {
          refreshProfile(initial.user.id)
          refreshWallet(initial.user.id)
          refreshConsultant(initial.user.id)
        }
      })
      .catch((err) => console.error('[auth] getSession failed:', err.message))
      // In `finally`, not in `then`. Blocked storage or a boot-time network
      // failure rejects this, and a `sessionReady` that never flips means
      // SessionGate never runs — a signed-out visitor then browses the seeker
      // screens on seed data indefinitely. Failing to read the session is not
      // the same as having one.
      .finally(() => {
        if (active) setSessionReady(true)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      if (next) {
        refreshProfile(next.user.id)
        refreshWallet(next.user.id)
        refreshConsultant(next.user.id)
      } else {
        setProfile(null)
        setConsultant(null)
        refreshWallet(null)
        /* Charts and readings are cached in localStorage, which outlives a
           session by design — that is what stops a reload costing a request.
           The keys carry the user id, so a second person cannot read the
           first one's entries, but on a shared phone there is no reason to
           leave them sitting there either. */
        clearAstroCache()
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [refreshProfile, refreshWallet, refreshConsultant])


  /* Language. A value, not a boolean, so it cannot live on `flags` — this is
     the first slice that genuinely needed one. Not persisted, like everything
     else here; it resets on reload with the rest of the app. */
  const [lang, setLang] = useState('en')

  /* Keeps the document in step, which is not decoration: it is what a screen
     reader picks a voice from and what the browser hyphenates by. */
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])

  /* The chat panel — a right-side overlay rather than a route, so it can be
     opened from any tab and from the floating button without navigating. */
  const [chatOpen, setChatOpen] = useState(false)
  // Ask AI is the default surface. It is the one that always answers —
  // consultants only reply inside a session window.
  const [chatTab, setChatTab] = useState('ai')

  /* The cart, as real line items rather than a bare count, so the cart sheet
     has something to show and the total is computed rather than typed. */
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)

  /**
   * One flat set of boolean flags for every "sticky" toggle in the app:
   * `follow:<id>`, `save:<id>`, `like:<id>`, plus
   * `setting:croppedDeityImage`, `event:<id>` and the tarot
   * pull keys. A screen that toggles a flag and then navigates away finds it
   * still set on the way back.
   *
   * Since phase 9 the first four ALSO write a row, when the target is a real
   * UUID and somebody is signed in — `lib/reactions.js` decides both. The Set
   * stays because it is still the right answer for the rest of the keys, and
   * because it keeps this optimistic: the toggle is instant, the row catches
   * up, and a failed write is rolled back below rather than left lying.
   *
   * Deliberately unchanged: every `hasFlag` / `toggleFlag` call site. There are
   * twenty-odd of them and none of them should have to know which flags are
   * durable.
   */
  const [flags, setFlags] = useState(() => new Set())

  const hasFlag = useCallback((key) => flags.has(key), [flags])

  const toggleFlag = useCallback((key, messages) => {
    let next
    setFlags((prev) => {
      const copy = new Set(prev)
      if (copy.has(key)) copy.delete(key)
      else copy.add(key)
      next = copy.has(key)
      return copy
    })
    if (messages) {
      setToast(next ? messages.on : messages.off)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setToast(null), 2400)
    }

    // Persist the four reaction kinds. `setReaction` returns false for keys
    // this table cannot hold — a mock ID, a preference, a signed-out visitor —
    // and those stay exactly as they were: local, and working.
    if (parseKey(key)) {
      setReaction(key, next).catch((err) => {
        console.error('[reactions] write failed:', err.message)
        // Put the Set back. A heart that stays filled after the write failed is
        // the interface telling a lie it will be caught in on the next reload.
        setFlags((prev) => {
          const copy = new Set(prev)
          if (next) copy.delete(key)
          else copy.add(key)
          return copy
        })
      })
    }
    return next
  }, [])

  /**
   * Reactions belong to the account, not the tab. They are loaded on sign-in
   * and dropped on sign-out — leaving one person's follows on screen for the
   * next person to sign in on the same phone is the shared-device bug that
   * `clearAstroCache` already exists to avoid.
   */
  useEffect(() => {
    if (!session) {
      setFlags((prev) => new Set([...prev].filter((k) => !parseKey(k))))
      return
    }
    let active = true
    fetchMyReactions()
      .then((keys) => {
        if (!active) return
        setFlags((prev) => new Set([...prev, ...keys]))
      })
      .catch((err) => console.error('[reactions] load failed:', err.message))
    return () => {
      active = false
    }
  }, [session])

  const setBirthField = useCallback(
    (field, value) => setBirth((b) => ({ ...b, [field]: value })),
    [],
  )

  /** Add a line, or bump its quantity if the product is already in the cart. */
  const addToCart = useCallback(
    (product, silent = false) => {
      setCart((c) => {
        const at = c.findIndex((l) => l.id === product.id)
        if (at === -1) return [...c, { ...product, qty: 1 }]
        const copy = [...c]
        copy[at] = { ...copy[at], qty: copy[at].qty + 1 }
        return copy
      })
      if (!silent) showToast(`${product.name} — added`)
    },
    [showToast],
  )

  const removeFromCart = useCallback((id) => setCart((c) => c.filter((l) => l.id !== id)), [])

  const setQty = useCallback(
    (id, qty) =>
      setCart((c) =>
        qty <= 0 ? c.filter((l) => l.id !== id) : c.map((l) => (l.id === id ? { ...l, qty } : l)),
      ),
    [],
  )

  const clearCart = useCallback(() => setCart([]), [])

  const cartCount = cart.reduce((n, l) => n + l.qty, 0)
  const cartTotal = cart.reduce((n, l) => n + l.price * l.qty, 0)

  /* The free-question counter used to live here, as React state seeded at
     five. That made "five free" a number the browser owned — a reload
     handed out five more, and there was no server anywhere that disagreed.
     It is `ai_quota` now, and useAskAi reads it from /v1/ai/. Nothing in
     the client counts questions any more, which is the point. */

  /**
   * Spend against the wallet. Same name and same single home as before, and
   * the same `false` when it refuses — but it is now a PROMISE, so every
   * caller must `await` it. `if (spend(...))` is always truthy and would let
   * through a purchase the server refused.
   *
   * `amount` stays in rupees because that is what the catalogue in mock.js is
   * denominated in. It is converted to paise here, once, at the only place
   * that talks to the server. Nothing above this line ever sees paise and
   * nothing below it ever sees rupees.
   *
   * The server decides. This function never compares against `balance` — that
   * number is a read of a cache and a devtools-editable one at that; the
   * refusal comes from wallet_debit() under a row lock, and the toast below
   * shows the reason the server gave.
   */
  const spend = useCallback(
    async (amount, label) => {
      /* Says so. Every caller treats a `false` as "already explained to the
         user", so a silent refusal here reads as a dead button — the second
         tap of a double-tap, or a Buy pressed while the cart is checking out,
         does nothing at all and gives no reason. */
      if (spendingRef.current) {
        showToast('One payment at a time.')
        return false
      }
      spendingRef.current = true
      setSpending(true)
      try {
        /* The server still decides, and this still never compares against
           `balance` — that number is a read of a cache and a
           devtools-editable one. The refusal comes from the same row lock
           it always did; the api toasts the sentence the server gave and
           takes the balance a refusal carries, in case the number on
           screen was the thing that was wrong.

           The post-debit read stays awaited and inside the guard: two
           unawaited reads from two quick purchases have no ordering, and
           the older response landing second repaints a balance one
           purchase too high. */
        return await walletApi.spend(amount, label)
      } finally {
        spendingRef.current = false
        setSpending(false)
      }
    },
    [walletApi, showToast],
  )

  /**
   * Book a session. It sits beside `spend` rather than inside it because the
   * server call is a different one: `book_session` claims a slot and debits a
   * wallet in one transaction, and there is no amount to pass — the price is
   * looked up on the server from the service row.
   *
   * It borrows `spend`'s re-entrancy guard on purpose. Two taps in one tick
   * cannot double-book — the partial unique index refuses the second — but the
   * refusal a seeker would read is "Someone just took that time", about
   * themselves, which is a true sentence and a terrible one.
   *
   * Returns the server's `{ ok, reason }` and toasts nothing: the sheet needs
   * to know whether to close.
   */
  const bookSession = useCallback(
    async (consultantId, serviceId, startsAt) => {
      if (spendingRef.current) return { ok: false, reason: 'One payment at a time.' }
      spendingRef.current = true
      setSpending(true)
      try {
        const res = await book(consultantId, serviceId, startsAt)
        // A refusal can move the balance too — it carries the server's number
        // when the wallet was the reason. Refresh either way: on success the
        // debit is already written, and the row's id only exists server-side.
        await refreshWallet(session?.user?.id)
        return res ?? { ok: false, reason: 'Could not take that booking.' }
      } finally {
        spendingRef.current = false
        setSpending(false)
      }
    },
    [refreshWallet, session],
  )

  /**
   * Add money. The mirror of `spend`, and deliberately not its equal: nothing
   * here credits anything. This opens a Razorpay order, hands the browser to
   * Razorpay's checkout, and stops. The wallet moves when Razorpay's webhook
   * reaches the server and the signature verifies, which is the only path a
   * rupee has into `ledger`.
   *
   * So the balance arriving is not something this function can await — the
   * credit happens somewhere else, milliseconds to seconds later. It polls
   * instead, and says so on screen rather than freezing a spinner over a
   * number it does not control.
   *
   * `amountPaise`, not rupees, because this one is not reading a price out of
   * mock.js — the person typed it, and the server re-checks the band anyway.
   */
  const topup = useCallback(
    async (amountPaise) => {
      if (toppingUpRef.current) return false
      toppingUpRef.current = true
      setToppingUp(true)
      try {
        /* Still true, and the reason this is not `spend`'s mirror: nothing
           here credits anything. It opens an order, hands the browser to
           Razorpay's checkout and stops. The wallet moves when the webhook
           reaches the server and the signature verifies — the only path a
           rupee has into `ledger`.

           So the api cannot await the balance. It polls, and says so on
           screen rather than freezing a spinner over a number it does not
           control. */
        return await walletApi.topup(amountPaise)
      } finally {
        toppingUpRef.current = false
        setToppingUp(false)
      }
    },
    [walletApi],
  )

  const openChat = useCallback((tab = 'ai') => {
    setChatTab(tab)
    setChatOpen(true)
  }, [])

  /** Buy now — charge the wallet directly and skip the cart entirely.
   *  Async, because `spend` is. Callers must await it too. */
  /**
   * Buy one thing, now.
   *
   * This used to be `spend(price, name)` — a bare wallet debit. It took
   * the money and never touched stock, so a sold-out gemstone could be
   * bought forever and the shop's own numbers meant nothing.
   *
   * It goes through the server's checkout now, which claims the stock and
   * debits the wallet in ONE transaction. That matters for the case this
   * was rebuilt for: two people tapping Buy on the last item in the same
   * tick. Exactly one succeeds; the other gets "Out of stock" and is not
   * charged — and neither outcome is decided here. The client sends the
   * attempt and shows the sentence that comes back.
   *
   * The re-entrancy guard stays: two taps in one tick would otherwise be
   * two orders for one person.
   */
  const buyNow = useCallback(
    async (product) => {
      if (spendingRef.current) {
        showToast('One payment at a time.')
        return false
      }
      spendingRef.current = true
      setSpending(true)
      try {
        const result = await buyFromShop([{ product_id: product.id, qty: 1 }])
        if (!result.ok) {
          showToast(result.reason)
          return false
        }
        showToast(`Ordered · ${product.name}`)
        // The debit happened server-side, so the balance here is stale
        // until this lands. Awaited inside the guard, for the same
        // ordering reason `spend` awaits its own read.
        await refreshWallet(session?.user?.id)
        return true
      } catch (err) {
        showToast(err.message)
        return false
      } finally {
        spendingRef.current = false
        setSpending(false)
      }
    },
    [showToast, refreshWallet, session],
  )

  /* `me` is rebuilt only when the side flips, not on every render — it feeds
     the shared TabHeader, so a fresh object each time would rerender all five
     tabs for nothing. */
  const me = useMemo(
    () =>
      isPro
        ? {
            ...pro,
            /* Identity is the real row from phase 4 onward. The mock is still
               spread underneath for the fields no table holds yet — followers,
               review counts, content (phase 9) — but never for the name: a
               consultant looking at Ritu Kashyap's name above her own bookings
               is the identity bug that has already shipped twice on the seeker
               side. Blank beats confidently wrong. */
            name: session ? profile?.name || '' : pro.name,
            initials: session ? (profile ? initialsOf(profile.name) : '') : pro.initials,
            /* Same rule as the name: signed in, it is the real row or nothing.
               Signed out there is no face, because the seed person does not
               have one and borrowing a stranger's would be the identity bug
               above with a picture attached. */
            avatarUrl: session ? profile?.avatar_url || null : null,
            profileTo: '/pro/profile',
            homeTo: '/pro/studio',
          }
        : {
            ...user,
            /* Same rule on this side, and it was overdue: `me` feeds the tab
               header's avatar, so a signed-in seeker was still wearing the
               seed person's initials on every tab while `useProfileFields()`
               showed their own name one screen in. */
            name: session ? profile?.name || '' : user.name,
            initials: session ? (profile ? initialsOf(profile.name) : '') : user.initials,
            avatarUrl: session ? profile?.avatar_url || null : null,
            profileTo: '/profile',
            homeTo: '/home',
          },
    [isPro, session, profile],
  )

  // Hooks must stay unconditional; this list is just the public surface.
  const value = useMemo(
    () => ({
      isPro,
      me,
      birth,
      setBirthField,
      session,
      sessionReady,
      profile,
      profileLoading,
      refreshProfile,
      saveProfile,
      consultant,
      consultantLoading,
      consultantError,
      refreshConsultant,
      refreshWallet,
      cart,
      cartCount,
      cartTotal,
      addToCart,
      removeFromCart,
      setQty,
      clearCart,
      cartOpen,
      setCartOpen,
      buyNow,
      hasFlag,
      toggleFlag,
      balance,
      ledger,
      spend,
      spending,
      bookSession,
      topup,
      toppingUp,
      chatOpen,
      setChatOpen,
      chatTab,
      setChatTab,
      openChat,
      toast,
      showToast,
      lang,
      setLang,
      t,
    }),
    [
      isPro,
      me,
      birth,
      setBirthField,
      session,
      sessionReady,
      profile,
      profileLoading,
      refreshProfile,
      saveProfile,
      consultant,
      consultantLoading,
      consultantError,
      refreshConsultant,
      refreshWallet,
      cart,
      cartCount,
      cartTotal,
      addToCart,
      removeFromCart,
      setQty,
      clearCart,
      cartOpen,
      buyNow,
      hasFlag,
      toggleFlag,
      balance,
      ledger,
      spend,
      spending,
      bookSession,
      topup,
      toppingUp,
      chatOpen,
      chatTab,
      openChat,
      toast,
      showToast,
      lang,
      t,
    ],
  )

  return <AppStore.Provider value={value}>{children}</AppStore.Provider>
}

export function useStore() {
  const ctx = useContext(AppStore)
  if (!ctx) throw new Error('useStore must be used inside <AppProvider>')
  return ctx
}

/**
 * Paise to a rupee string. The only place in the app where money becomes
 * text, which is what keeps the division from spreading — every other layer
 * holds integers (backend/INSTRUCTIONS.md rule 1).
 */
export function rupees(paise) {
  /* Whole rupees print whole; anything with paise prints both digits. ₹2,248.5
     is not a price — it is a number that happens to be money, and it appeared
     on the consultant's own booking list the first time a band divided
     unevenly. Wallet balances are whole rupees far more often than not, so
     forcing two decimals everywhere is the worse default. */
  const decimals = paise % 100 === 0 ? 0 : 2
  return (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatIsoDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

function formatSqlTime(hms) {
  let [h, min] = hms.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} ${period}`
}

function initialsOf(name) {
  return name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

/**
 * The real `profiles` row, shaped the way the screens already expect to read
 * it, merged with the mock user for the fields the backend doesn't compute
 * yet. Sun/moon/rising need the ephemeris service (phase 7, unbuilt), so
 * those stay seed data until then — identity and birth details are real the
 * moment a profile exists.
 */
/**
 * The consultant's own record, shaped the way the `/pro` screens already read
 * `pro` from mock.js. The seeker-facing counterpart of `useProfileFields`, and
 * it obeys the same rule: signed in, it is the real row or blank — never
 * `consultants[0]`.
 *
 * Signed out it returns the seed consultant, which is the demo. That path
 * survives only because `/pro` is gated on a real row from phase 4 on, so in
 * practice nobody signed out reaches a screen that calls this.
 *
 * `price` and `perMinute` are PAISE and come from `consultant_services`, which
 * is priced off a platform band — there is no rupee number in this file and no
 * price the browser computed.
 */
export function useConsultantFields(services = []) {
  const { consultant, profile, session } = useStore()
  const seed = (value) => (session ? '' : value)

  const fixed = services.filter((s) => s.billing === 'fixed').sort((a, b) => a.duration_mins - b.duration_mins)
  const perMinute = services.find((s) => s.billing === 'per_minute') ?? null
  const base = fixed.find((s) => s.duration_mins === 20) ?? fixed[0] ?? null

  return {
    id: consultant?.profile_id ?? seed(pro.id),
    name: profile?.name || seed(pro.name),
    initials: profile ? initialsOf(profile.name) : seed(pro.initials),
    category: consultant?.category || seed(pro.category),
    specialization: consultant?.specialization || seed(pro.specialization),
    languages: consultant?.languages ?? (session ? [] : pro.languages),
    experienceYrs: consultant?.experience_yrs ?? null,
    bio: consultant?.bio || seed(pro.bio),
    credentials: consultant?.credentials ?? (session ? [] : pro.credentials),
    status: consultant?.status ?? null,
    verified: consultant?.verified ?? false,
    fixed,
    perMinute,
    pricePaise: base?.price_paise ?? null,
    /* Phase 9 made these rows. `rating_avg_cache` and `rating_count_cache` are
       maintained by a trigger over `reviews`, so they are the consultant's own
       numbers rather than the seed person's 4.9 and 2,148. A consultant with no
       reviews gets null and 0, and every screen renders that as "New". The
       follower count is a COUNT and is fetched where it is shown, not here —
       this hook has no consultant id to ask with until `consultant` lands. */
    rating: consultant?.rating_avg_cache ?? null,
    reviewCount: consultant?.rating_count_cache ?? 0,
  }
}

export function useProfileFields() {
  const { profile, session } = useStore()

  /* Seed identity is the right answer when signed out — that is the demo, and
     it is what the screens were built against. It is the wrong answer the
     moment someone is signed in: they see the seed person's name and birth
     details as their own for the length of the profile fetch, and permanently
     if that fetch fails, with Chart drawing a wheel for a birth that is not
     theirs. Blank is honest; a confident wrong chart is not. */
  const seed = (value) => (session ? '' : value)

  return {
    name: profile?.name || seed(user.name),
    initials: profile ? initialsOf(profile.name) : seed(user.initials),
    birthDate: profile?.birth_date ? formatIsoDate(profile.birth_date) : seed(user.birthDate),
    birthTime: profile?.birth_time ? formatSqlTime(profile.birth_time) : seed(user.birthTime),
    birthPlace: profile?.birth_place || seed(user.birthPlace),
    // Whether the birth time is a fact or a guess. NULL time and `false` here
    // are the same answer said twice, and the screens need it to know not to
    // print an ascendant (05-BACKEND-SCHEMA.md §4.1).
    birthTimeKnown: profile ? profile.birth_time_known !== false : true,
    /* Sun, moon and rising USED TO LIVE HERE, identical for everyone. Phase 7
       computes them, so they moved to `useMyChart()` in lib/astro.js — this
       hook is called on screens with no interest in a chart, and a fetch inside
       it would spend a request on every one of them. */
  }
}
