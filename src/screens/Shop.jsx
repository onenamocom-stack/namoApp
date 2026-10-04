import { Loader } from '../components/Cosmos.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { shopCategories, shopSubcategories } from '../data/mock.js'
import { fetchProducts } from '../lib/shop.js'
import { TabHeader } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Search } from '../components/Primitives.jsx'
import { useNavigate } from 'react-router-dom'
import { bannerStyle, followBanner, useBanners } from '../lib/appearance.js'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store.jsx'
import { looksLikeReferral } from '../lib/referrals.js'
import { useMyChart } from '../lib/astro.js'

/**
 * The three promo banners at the top of the shop.
 *
 * This is the only place colour enters the app — everywhere else is canvas,
 * ink and one gold. Each banner is a filter rather than a link to a landing
 * page: tapping it narrows the grid below, which is the honest version of the
 * promise the headline makes.
 */
const BANNERS = [
  {
    id: 'bn-stones',
    kicker: 'shop.bn.stones.k',
    title: 'shop.bn.stones.t',
    note: 'shop.bn.stones.n',
    cta: 'shop.bn.stones.c',
    cat: 'Gemstones',
    art: 'orbit',
    from: '#7c2d12',
    to: '#c2410c',
  },
  {
    id: 'bn-rudraksha',
    kicker: 'shop.bn.rudraksha.k',
    title: 'shop.bn.rudraksha.t',
    note: 'shop.bn.rudraksha.n',
    cta: 'shop.bn.rudraksha.c',
    cat: 'Rudraksha',
    art: 'contour',
    from: '#6b3410',
    to: '#a85400',
  },
  {
    id: 'bn-remedies',
    kicker: 'shop.bn.remedies.k',
    title: 'shop.bn.remedies.t',
    note: 'shop.bn.remedies.n',
    cta: 'shop.bn.remedies.c',
    cat: 'Remedies',
    art: 'halftone',
    from: '#8a3a00',
    to: '#b45309',
  },
]

/**
 * Shop — a premium storefront.
 *
 * Two densities on purpose: a wide hero card for the chart-matched pick, then
 * a two-up grid for everything else. A single uniform grid reads as a
 * catalogue; the break gives the screen a front page.
 */
/** One gradient and one line per category, for the banner above its grid. */
const CAT_GRADIENT = {
  Gemstones: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)',
  Maalas: 'linear-gradient(135deg, #6b3410 0%, #a85400 100%)',
  Rudraksha: 'linear-gradient(135deg, #5c2c0d 0%, #9a4a05 100%)',
  Remedies: 'linear-gradient(135deg, #8a3a00 0%, #b45309 100%)',
}

const CAT_LINE = {
  Gemstones: 'shop.cat.Gemstones',
  Maalas: 'shop.cat.Maalas',
  Rudraksha: 'shop.cat.Rudraksha',
  Remedies: 'shop.cat.Remedies',
}

export default function Shop() {
  const { cartCount, addToCart, buyNow, setCartOpen, session, sessionReady, showToast, t, lang } =
    useStore()
  const navigate = useNavigate()
  // The console's banners first, then the built-in three (4 Oct 2026).
  const banners = useBanners('shop', BANNERS, lang)
  // One line of copy on the hero card names your sun sign. It was the seed
  // person's until phase 7, on a card recommending a stone for it.
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  const [cat, setCat] = useState('All')
  const [query, setQuery] = useState('')
  const [slide, setSlide] = useState(0)
  const [sub, setSub] = useState(null)
  const rail = useRef(null)

  /* A consultant's link lands here as ?ref=ACODE (and ?p=<id> for one
     product). Held in sessionStorage as well as state, because the
     journey from the link is rarely one page: a seeker arrives, browses,
     signs in — and a code that only lived in the URL would be gone by the
     time they reached Buy, with nobody able to say why they were not
     credited. Sign-up codes (N…) are deliberately ignored: those are
     claimed once at onboarding, not at a till. */
  const referral = useReferralFromLink()

  /* `?p=<id>` — a product tapped on a post or reel, or an affiliate link
     for one product. The shop opens on All with that product scrolled into
     view and ringed in saffron; there is no separate product page. */
  const focusId = useFocusedProduct()

  // One banner's worth of scroll, measured off the DOM rather than derived
  // from the percentage width — the gap and the rail padding are in there too.
  const step = (el) =>
    el.children[1] ? el.children[1].offsetLeft - el.children[0].offsetLeft : el.clientWidth

  // The scroller is the source of truth; state only mirrors it for the dots.
  const onRailScroll = (e) => {
    const i = Math.round(e.currentTarget.scrollLeft / step(e.currentTarget))
    if (i !== slide) setSlide(Math.min(Math.max(i, 0), banners.length - 1))
  }

  const goTo = (i) => {
    const el = rail.current
    if (el) el.scrollTo({ left: i * step(el), behavior: 'smooth' })
  }

  /* The catalogue is the database's now, not mock.js's. Until this the
     console could add a product and the app would never show it — the
     eleven here were hard-coded in a JavaScript file.

     A failed load leaves the list empty and says so, rather than falling
     back to the mock: a shop quietly showing products that are not for
     sale is worse than a shop that admits it cannot reach the server. */
  const [products, setProducts] = useState([])
  const [loadingShop, setLoadingShop] = useState(true)
  const [shopError, setShopError] = useState(false)

  const loadProducts = useCallback(() => {
    setLoadingShop(true)
    fetchProducts()
      .then((rows) => { setProducts(rows); setShopError(false) })
      .catch((err) => { console.error('[shop] load failed:', err.message); setShopError(true) })
      .finally(() => setLoadingShop(false))
  }, [])

  useEffect(loadProducts, [loadProducts])

  /* Once the grid exists, bring the linked product to the middle of the
     screen. A product retired since the post went out says so, rather than
     leaving somebody to hunt the grid for a thing that is not in it. */
  useEffect(() => {
    if (loadingShop || shopError || !focusId) return
    const el = document.getElementById(`product-${focusId}`)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    else showToast(t('shop.gone'))
    // Once per arrival, not on every later reload of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingShop, focusId])
  const focusRing = 'ring-2 ring-gold-fill ring-offset-2 ring-offset-bg'

  const filters = ['All', ...shopCategories]
  const q = query.trim().toLowerCase()
  const list = products.filter((p) => {
    const inCat = cat === 'All' || p.category === cat
    // Products carry no subcategory field; matching on the name is the cheap
    // honest join for mock data, and it fails open rather than showing zero.
    const inSub = !sub || `${p.name} ${p.subtitle}`.toLowerCase().includes(sub.toLowerCase())
    const inQuery = !q || [p.name, p.subtitle, p.category].some((f) => f.toLowerCase().includes(q))
    return inCat && inSub && inQuery
  })

  // The chart-matched pick leads the page when no filter is narrowing things.
  const hero = cat === 'All' && !q ? list.find((p) => p.recommendedBy) : null
  const rest = hero ? list.filter((p) => p.id !== hero.id) : list

  return (
    <>
      {/* The cart was a knob in the header until 10 Sep 2026, then a
          floating button until 3 Oct; it now sits beside the search. */}
      <TabHeader />

      {/* Said BEFORE anything is tapped, and said as cashback.
          A seeker who discovers after paying that the 10% was not taken
          off the total has been surprised by their own money, which is
          the one surprise this product cannot afford. Three facts, in the
          order they matter: it is back not off, it is after delivery, and
          it is first order only. */}
      {referral && (
        <p className="border-b border-rule bg-surface-2 px-5 py-3 text-micro t-sub">
          {t('shop.ref.a')} <b className="tnum">{referral}</b> {t('shop.ref.b')}{' '}
          <b>{t('shop.ref.c')}</b> {t('shop.ref.d')}
        </p>
      )}

      {/* Search and the cart, pinned under the header (3 Oct). The cart was
          a floating button over the grid from 10 Sep, and wherever it
          floated it sat on some product's Buy. Here it covers nothing and
          never scrolls away. */}
      <Search
        value={query}
        onChange={setQuery}
        placeholder={t('shop.searchPh')}
        className="sticky top-[52px] z-10 bg-bg px-4 pb-2 pt-3"
        trailing={
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}
            className="pop-tap relative inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gold-fill text-ink shadow-md"
          >
            <Icon name="cart" size={22} />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-bold tnum text-white ring-2 ring-bg">
                {cartCount}
              </span>
            )}
          </button>
        }
      />

      {/* ── Banners ─────────────────────────────────────────────────────── */}
      <div className="pt-4">
        <div ref={rail} onScroll={onRailScroll} className="rail gap-3 px-4">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => (b.remote ? followBanner(b, navigate) : setCat(b.cat))}
              className="banner w-[86%] p-4 text-left"
              style={{
                ...bannerStyle(b),
                // `backwards`, not `both` — `both` would pin the transform after
                // the deal-in and swallow the press travel underneath it.
                animation: `pop-in .5s cubic-bezier(.2,.7,.3,1) ${i * 80}ms backwards`,
              }}
            >
              {/* The engraving, ghosted into the gradient. */}
              <Plate
                seed={b.id}
                variant={b.art}
                className="pointer-events-none absolute -right-8 -top-6 h-[150%] w-2/3 animate-float bg-transparent opacity-25 mix-blend-overlay"
              />
              {/* One sheen pass, staggered per banner so they never sync up. */}
              <span className="sheen animate-sweep" style={{ animationDelay: `${i * 2}s` }} />

              {/* Down ~25% on 10 Sep, ~197px → ~155px. All four parts stay —
                  this is a trim, not the cut Consult's took. Padding, the
                  type step and the CTA come down, and the wrapper goes
                  `flex flex-col`: as a block its last inline child carries a
                  line-box descender, 11px of dead space under the CTA that no
                  padding rule accounts for. */}
              <span className="relative flex flex-col items-start">
                <span className="caps-sm text-white/70">{b.remote ? b.kicker : t(b.kicker)}</span>
                <span className="mt-1.5 block max-w-[16ch] text-lead font-medium leading-tight text-white">
                  {b.remote ? b.title : t(b.title)}
                </span>
                <span className="mt-1.5 block max-w-[28ch] text-meta text-white/75">{b.remote ? b.note : t(b.note)}</span>
                <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 caps-sm text-ink shadow-md">
                  {b.remote ? b.cta : t(b.cta)} <span aria-hidden="true">→</span>
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Position, not decoration — the dots are tappable. */}
        <div className="mt-3.5 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Banner ${i + 1}`}
              aria-current={slide === i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                slide === i ? 'w-6 bg-ink' : 'w-1.5 bg-black/20'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={cat === f}
            onClick={() => {
              setCat(f)
              setSub(null)
            }}
            className="pill caps-sm"
          >
            {f === 'All' ? t('a.all') : f}
          </button>
        ))}
      </div>

      {/* A banner for the category you are in, then what sits inside it.
          Both only exist once you have chosen — on All they would be noise on
          top of the promo rail that is already there. */}
      {cat !== 'All' && (
        <>
          <section className="px-4 pb-1">
            <div className="banner p-4" style={{ backgroundImage: CAT_GRADIENT[cat] }}>
              <Plate
                seed={`cat-${cat}`}
                variant="halftone"
                className="pointer-events-none absolute -right-6 -top-4 h-[150%] w-1/2 bg-transparent opacity-25 mix-blend-overlay"
              />
              <span className="sheen animate-sweep" />
              <span className="relative block">
                <span className="caps-sm text-white/70">{cat}</span>
                <span className="mt-1.5 block text-lead font-medium leading-tight text-white">
                  {CAT_LINE[cat] && t(CAT_LINE[cat])}
                </span>
              </span>
            </div>
          </section>

          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
            {(shopSubcategories[cat] || []).map((sc) => (
              <button
                key={sc}
                type="button"
                aria-pressed={sub === sc}
                onClick={() => setSub(sub === sc ? null : sc)}
                className="pill caps-sm"
              >
                {sc}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Chart-matched hero ────────────────────────────────────────── */}
      {hero && (
        <section id={`product-${hero.id}`} className="px-4 pb-2 pt-2">
          <Kicker>{t('shop.matched')}</Kicker>
          <PopCard
            raised
            tap
            className={`mt-3 overflow-hidden ${focusId === hero.id ? focusRing : ''}`}
          >
            <Plate seed={hero.id} className="aspect-[16/10] w-full">
              <span className="absolute left-3 top-3">
                <PopTag tone="gold">{hero.category}</PopTag>
              </span>
            </Plate>
            <div className="p-5">
              <p className="text-lead t-heading">{hero.name}</p>
              <p className="mt-1 text-meta t-faint">{hero.subtitle}</p>
              {/* No sun sign yet — loading, signed out, or no birth details —
                  and the sentence drops the personal half rather than naming
                  somebody else's. */}
              <p className="mt-3 text-meta t-body">
                {mine.sun ? t('shop.heroSun', { sun: mine.sun }) : t('shop.hero')}
              </p>

              <div className="mt-5 flex items-center gap-2">
                <p className="flex-1 text-title gold tnum">
                  ₹{hero.price.toLocaleString('en-IN')}
                </p>
                <PopButton size="sm" full={false} onClick={() => addToCart(hero)}>
                  {t('shop.addToCart')}
                </PopButton>
                <PopButton
                  size="sm"
                  full={false}
                  variant="gold"
                  onClick={() => buyNow(hero)}
                >
                  {t('shop.reviewBuy')}
                </PopButton>
              </div>
            </div>
          </PopCard>
        </section>
      )}

      {/* ── Grid ──────────────────────────────────────────────────────── */}
      <section className="px-4 py-4">
        <Kicker>{t(rest.length === 1 ? 'shop.item' : 'shop.items', { n: rest.length })}</Kicker>

        {loadingShop ? (
          <Loader label={t('shop.opening')} className="py-12" />
        ) : shopError ? (
          /* Says it cannot reach the shop rather than showing an empty one.
             "Nothing matches that" under a failed request sends somebody
             to clear a search that was never the problem. */
          <div className="py-12 text-center">
            <p className="text-meta t-body">{t('shop.err')}</p>
            <p className="mt-1 text-micro t-faint">{t('shop.errNote')}</p>
            <PopButton size="sm" full={false} className="mt-5" onClick={loadProducts}>
              {t('shop.retry')}
            </PopButton>
          </div>
        ) : rest.length === 0 ? (
          <p className="py-12 text-center text-meta t-faint">
            {t('shop.noMatch')}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {rest.map((p) => {
              const off = p.mrp ? Math.round((1 - p.price / p.mrp) * 100) : null
              return (
                <li key={p.id} id={`product-${p.id}`}>
                  <PopCard
                    tap
                    className={`flex h-full flex-col overflow-hidden ${focusId === p.id ? focusRing : ''}`}
                  >
                    <Plate seed={p.id} className="aspect-square w-full">
                      {focusId === p.id && (
                        <span className="caps-sm absolute right-2 top-2 rounded-full bg-btn-deep px-2 py-1 text-white shadow-sm">
                          {t('shop.linked')}
                        </span>
                      )}
                      {off > 0 && !p.soldOut && (
                        <span className="caps-sm absolute left-2 top-2 rounded-full bg-gold-fill px-2 py-1 text-ink shadow-sm tnum">
                          {t('home.off', { n: off })}
                        </span>
                      )}
                      {p.soldOut && (
                        <span className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
                          <span className="caps-sm rounded-full bg-live px-2.5 py-1 text-white shadow-sm">
                            {t('shop.soldOut')}
                          </span>
                        </span>
                      )}
                    </Plate>

                    <div className="flex flex-1 flex-col p-3">
                      <p className="text-meta t-heading">{p.name}</p>
                      <p className="mt-1 text-meta t-faint">{p.subtitle}</p>

                      <p className="mt-2 flex items-baseline gap-2 tnum">
                        <span className="text-body gold">₹{p.price.toLocaleString('en-IN')}</span>
                        {p.mrp && (
                          <span className="caps-sm t-faint line-through">
                            ₹{p.mrp.toLocaleString('en-IN')}
                          </span>
                        )}
                      </p>

                      {p.recommendedBy && (
                        <p className="mt-2 caps-sm t-faint">{t('shop.namedBy', { name: p.recommendedBy })}</p>
                      )}

                      {/* Two actions per listing, both compact. A sold-out
                          product keeps the row so the grid stays even, but
                          neither control is live. */}
                      <div className="mt-auto flex gap-1.5 pt-3">
                        <PopButton
                          size="sm"
                          disabled={p.soldOut}
                          onClick={() => addToCart(p)}
                          className="flex-1"
                          full={false}
                        >
                          {p.soldOut ? t('shop.soldOut') : t('shop.add')}
                        </PopButton>
                        {!p.soldOut && (
                          <PopButton
                            size="sm"
                            variant="gold"
                            full={false}
                            onClick={() => buyNow(p)}
                            className="flex-1"
                          >
                            {t('shop.buy')}
                          </PopButton>
                        )}
                      </div>
                    </div>
                  </PopCard>
                </li>
              )
            })}
          </ul>
        )}

        {cartCount > 0 && (
          <PopButton size="sm" variant="gold" onClick={() => setCartOpen(true)} className="mt-8">
            {t('shop.viewCart')} · {t(cartCount === 1 ? 'shop.item' : 'shop.items', { n: cartCount })}
          </PopButton>
        )}

        <p className="mt-8 text-center text-meta t-faint">
          {t('shop.disclaimer')}
        </p>
      </section>

      <div className="h-28" />
    </>
  )
}

/**
 * The product a link points at (`?p=<uuid>`), read once on arrival — the
 * same hash-query parsing as the referral below, for the same HashRouter
 * reason. Anything that is not a UUID is ignored rather than looked up.
 */
function useFocusedProduct() {
  const [id] = useState(() => {
    const hash = window.location.hash
    const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    const found = new URLSearchParams(q).get('p')
    return found && /^[0-9a-f-]{36}$/i.test(found) ? found.toLowerCase() : null
  })
  return id
}

/**
 * The referral code a link brought, if any.
 *
 * Kept in sessionStorage as well as state. The journey from a shared link
 * is rarely one page — arrive, browse, sign in, then buy — and a code
 * that lived only in `location.hash` would be gone by the time it
 * mattered, with nobody able to explain why the consultant was not
 * credited. Session storage, not local: it belongs to this visit.
 *
 * Only A… codes. An N… code is a sign-up code claimed once at onboarding,
 * and silently treating one as a shop coupon would send a seeker to a
 * till to be told, correctly but uselessly, that it is the wrong kind.
 */
function useReferralFromLink() {
  const [code, setCode] = useState(() => {
    try {
      return sessionStorage.getItem('namo.ref') || null
    } catch {
      return null
    }
  })

  useEffect(() => {
    // HashRouter puts the query after the hash, so `location.search` is
    // empty and the params live in the hash's own query string.
    const hash = window.location.hash
    const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    const found = new URLSearchParams(q).get('ref')
    if (!found || !looksLikeReferral(found) || !found.toUpperCase().startsWith('A')) return
    const upper = found.toUpperCase()
    setCode(upper)
    try {
      sessionStorage.setItem('namo.ref', upper)
    } catch {
      /* private window, blocked storage — the code still works this page */
    }
  }, [])

  return code
}
