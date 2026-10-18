import { Loader } from '../components/Cosmos.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCategories, fetchProducts, productHref } from '../lib/shop.js'
import ProductArt from '../components/ProductArt.jsx'
import { TabHeader } from '../components/Chrome.jsx'
import Ebooks from '../components/Ebooks.jsx'
import { ListingCard, MarketCard, MarketPrice, MarketSection } from '../components/MarketCard.jsx'
import { browse } from '../lib/market.js'
import { CardCorner, PickBar } from '../components/TagPick.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { bannerStyle, followBanner, useBanners } from '../lib/appearance.js'
import Icon from '../components/Icon.jsx'
import { useStore } from '../store.jsx'
import { useMyChart } from '../lib/astro.js'
import { tileStyle } from '../lib/tiles.js'

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
/** The category tiles above the banners (5 Oct 2026, owner's request): round
 *  and coloured like Bhakti's shelves and Consult's tools, so every tab opens
 *  the same way — search, circles, banners. */
const CAT_TILE = {
  All: { icon: 'grid', hue: '#f5782c' },
  Gemstones: { icon: 'gem', hue: '#2f7fd1' },
  Maalas: { icon: 'mala', hue: '#8e44ad' },
  Rudraksha: { icon: 'rudraksha', hue: '#a0522d' },
  Remedies: { icon: 'remedy', hue: '#1e9e5a' },
}
/* A category the console adds or renames has no entry above: it gets an
   icon matched on its name and a colour from this ring, by position, so a
   new category is a tile like the others rather than a blank. */
const CAT_HUES = ['#2f7fd1', '#8e44ad', '#a0522d', '#1e9e5a', '#c2410c', '#0f766e', '#b45309', '#7c3aed']
/* The Market is Shop and Academy in one page (14 Oct 2026, Rahul): what was
   Academy's is three tiles after All, in Rahul's order (15 Oct): Downloads
   (was E-books: any file, a PDF, a tool), Events, Courses. Downloads are
   live; Events and Courses say Soon until they are built. Keys, not names,
   so a console category called "Events" is never mistaken for one. The key
   stays `:ebooks` so every link already sent still lands. */
const MARKET = [
  { key: ':ebooks', label: 'ac.tab.ebooks', icon: 'download', hue: '#0f766e' },
  { key: ':events', label: 'ac.tab.events', icon: 'calendar', hue: '#7c3aed', soon: 'ac.soon.events' },
  { key: ':courses', label: 'ac.tab.courses', icon: 'play', hue: '#c2410c', soon: 'ac.soon.courses' },
]
const marketOf = (key) => MARKET.find((m) => m.key === key)
// A home section's strip shows this many; See all has the rest.
const STRIP_MAX = 12
// `?cat=downloads` is the new name for `?cat=ebooks`.
const catParam = (v) => (v === 'downloads' ? 'ebooks' : v)

function tileFor(name, i) {
  if (marketOf(name)) return marketOf(name)
  if (CAT_TILE[name]) return CAT_TILE[name]
  const n = name.toLowerCase()
  const icon = /gem|stone|ratna|crystal/.test(n) ? 'gem'
    : /maal|mala|bead/.test(n) ? 'mala'
    : /rudra/.test(n) ? 'rudraksha'
    : /remed|yantra|puja|pooja/.test(n) ? 'remedy'
    : 'cart'
  return { icon, hue: CAT_HUES[i % CAT_HUES.length] }
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
  // `?cat=ebooks` opens on that tile: where /academy and a shared book land.
  const [params] = useSearchParams()
  const [cat, setCat] = useState(() => {
    const c = `:${catParam(params.get('cat'))}`
    return marketOf(c) ? c : 'All'
  })
  // The header's box searches now (6 Oct 2026); nothing narrows here.
  const query = ''
  const [slide, setSlide] = useState(0)
  const [sub, setSub] = useState(null)
  const rail = useRef(null)


  /* `?p=<id>` — a product tapped on a post or reel, or an affiliate link
     for one product. The shop opens on All with that product scrolled into
     view and ringed in saffron; tapping it opens its page. */
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

  /* The sellers' downloads, courses and events (15 Oct 2026, Phase 17):
     approved listings, one request. Their products are shop products. */
  const [listings, setListings] = useState([])
  useEffect(() => {
    browse()
      .then(setListings)
      .catch((err) => console.error('[market] listings failed:', err.message))
  }, [])
  const ofKind = (k) => listings.filter((l) => l.kind === k)
  const KIND_OF = { ':ebooks': 'download', ':events': 'event', ':courses': 'course' }
  // Events and Courses say Soon until somebody lists one.
  const soonFor = (m) => m?.soon && !ofKind(KIND_OF[m.key]).length
  const openListing = (id) => navigate(`/shop/l/${id}`)

  /* The tiles and pills are the console's categories (6 Oct 2026). Until
     they load — or if they cannot — the categories the products carry,
     so a slow request never leaves a shop with no tiles. */
  const [categories, setCategories] = useState(null)
  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err) => console.error('[shop] categories failed:', err.message))
  }, [])
  const catList = categories?.length
    ? categories
    : [...new Set(products.map((p) => p.category).filter(Boolean))].map((name) => ({ name, subcategories: [] }))
  const subsOf = (name) => catList.find((c) => c.name === name)?.subcategories ?? []

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

  const filters = ['All', ...MARKET.map((m) => m.key), ...catList.map((c) => c.name)]
  const special = marketOf(cat)
  const q = query.trim().toLowerCase()
  const list = products.filter((p) => {
    const inCat = cat === 'All' || p.categories.includes(cat)
    // The product's own subcategory; the name match stays for products the
    // console has not given one.
    const inSub =
      !sub || p.subcategories.includes(sub) || `${p.name} ${p.subtitle}`.toLowerCase().includes(sub.toLowerCase())
    const inQuery =
      !q || [p.name, p.subtitle, p.category, p.brand, p.sku].some((f) => (f || '').toLowerCase().includes(q))
    return inCat && inSub && inQuery
  })

  // The chart-matched pick leads the page when no filter is narrowing things.
  const hero = cat === 'All' && !q ? list.find((p) => p.recommendedBy) : null
  const rest = hero ? list.filter((p) => p.id !== hero.id) : list

  /* On All, unfiltered, the page is sections (15 Oct 2026, Rahul's
     reference): each category's name, See all, and its first two —
     Downloads first, then Events and Courses once they exist, then the
     products. A product on no console category is under More, so none
     drops out. */
  const home = cat === 'All' && !sub && !q
  const known = new Set(catList.map((c) => c.name))
  /* A sub category ticked in the console is its own section, ahead of
     the categories (18 Oct 2026, Rahul): "Shani (Saturn)", "Money". */
  const subSections = catList.flatMap((c) =>
    (c.home ?? []).map((sc) => ({
      name: c.name,
      sub: sc,
      label: sc,
      items: rest.filter((p) => p.categories.includes(c.name) && p.subcategories.includes(sc)),
    })),
  )
  const sections = [
    ...subSections,
    ...catList.map((c) => ({ name: c.name, label: c.name, items: rest.filter((p) => p.categories.includes(c.name)) })),
    { name: null, label: t('shop.more'), items: rest.filter((p) => !p.categories.some((c) => known.has(c))) },
  ].filter((s) => s.items.length)
  const openBook = (id) => navigate(`/shop/d/${id}`)

  return (
    <>
      {/* The cart was a knob in the header until 10 Sep 2026, then a
          floating button until 3 Oct; it now sits beside the search. */}
      {/* The cart rides in the header's action slot and search is the
          header's box (6 Oct 2026, Rahul's design) — no row of its own. */}
      <TabHeader
        action={
          <button
                type="button"
                onClick={() => setCartOpen(true)}
                aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}
                className="pop-tap relative inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-fill text-white shadow-sm"
              >
                <Icon name="cart" size={18} />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-bold tnum text-white ring-2 ring-bg">
                    {cartCount}
                  </span>
                )}
              </button>
        }
      />


      {/* Tagging a post from the Market (15 Oct 2026, Rahul). */}
      <PickBar />

      {/* Search and the cart, pinned under the header (3 Oct). The cart was
          a floating button over the grid from 10 Sep, and wherever it
          floated it sat on some product's Buy. Here it covers nothing and
          never scrolls away. */}

      {/* ── Categories, as circles ─────────────────────────────────────── */}
      <section className="pb-1 pt-1">
        <ul className="tile-rail">
          {filters.map((f, i) => {
            const tile = tileFor(f, i)
            const on = cat === f
            return (
              <li key={f} className="flex-none">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setCat(f)
                    setSub(null)
                  }}
                  className="tile"
                >
                  <span className="tile-face" style={tileStyle(tile.hue, on)}>
                    <Icon name={tile.icon} size={20} weight={on ? 2.1 : 1.8} />
                  </span>
                  <span className="text-center text-[12px] font-semibold leading-tight t-body">
                    {f === 'All' ? t('a.all') : marketOf(f) ? t(marketOf(f).label) : f}
                  </span>
                  {soonFor(tile) && <span className="-mt-1 caps-sm text-[9px] t-faint">{t('a.soon')}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ── Banners ─────────────────────────────────────────────────────── */}
      <div className="pt-3">
        <div ref={rail} onScroll={onRailScroll} className="rail gap-3 px-4">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() =>
                b.remote ? followBanner(b, navigate) : setCat(filters.includes(b.cat) ? b.cat : 'All')
              }
              className="banner h-[150px] w-[86%] p-3 text-left"
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
                <span className="mt-1 max-w-[22ch] line-clamp-1 text-lead font-medium leading-tight text-white">
                  {b.remote ? b.title : t(b.title)}
                </span>
                <span className="mt-1.5 max-w-[30ch] line-clamp-2 text-meta text-white/75">{b.remote ? b.note : t(b.note)}</span>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 caps-sm text-ink shadow-md">
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

      {special ? (
        special.key === ':ebooks' ? (
          <Ebooks extra={ofKind('download')} />
        ) : !soonFor(special) ? (
          <MarketSection title={t(special.label)}>
            {ofKind(KIND_OF[special.key]).map((row) => (
              <ListingCard key={row.id} row={row} free={t('ac.free')} onOpen={() => openListing(row.id)} corner={<CardCorner product={row} />} />
            ))}
          </MarketSection>
        ) : (
          <section className="px-6 py-14 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={tileStyle(special.hue, false)}>
              <Icon name={special.icon} size={26} />
            </span>
            <p className="mt-4 text-lead t-heading">{t(special.label)}</p>
            <p className="mx-auto mt-2 max-w-[30ch] text-meta t-sub">{t(special.soon)}</p>
          </section>
        )
      ) : (
      <>
      {/* Subcategories where the category pills were (5 Oct 2026). On All,
          every subcategory, and picking one also picks its category. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-4">
        <button type="button" aria-pressed={!sub} onClick={() => setSub(null)} className="pill caps-sm">
          {t('a.all')}
        </button>
        {(cat === 'All'
          ? catList.flatMap((c) => c.subcategories.map((sc) => [c.name, sc]))
          : subsOf(cat).map((sc) => [cat, sc])
        ).map(([c, sc]) => (
          <button
            key={`${c}-${sc}`}
            type="button"
            aria-pressed={sub === sc}
            onClick={() => {
              if (sub === sc) return setSub(null)
              setCat(c)
              setSub(sc)
            }}
            className="pill caps-sm"
          >
            {sc}
          </button>
        ))}
      </div>

      {/* ── Chart-matched hero ────────────────────────────────────────── */}
      {hero && (
        <section id={`product-${hero.id}`} className="px-4 pb-2 pt-2">
          <Kicker>{t('shop.matched')}</Kicker>
          <PopCard
            raised
            tap
            onClick={() => navigate(productHref(hero))}
            className={`mt-3 overflow-hidden ${focusId === hero.id ? focusRing : ''}`}
          >
            <ProductArt product={hero} className="aspect-video w-full">
              <span className="absolute left-3 top-3">
                <PopTag tone="gold">{hero.category}</PopTag>
              </span>
            </ProductArt>
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
                <PopButton size="sm" full={false} onClick={(e) => { e.stopPropagation(); addToCart(hero) }}>
                  {t('shop.addToCart')}
                </PopButton>
                <PopButton
                  size="sm"
                  full={false}
                  variant="gold"
                  onClick={(e) => { e.stopPropagation(); buyNow(hero) }}
                >
                  {t('shop.reviewBuy')}
                </PopButton>
              </div>
            </div>
          </PopCard>
        </section>
      )}

      {/* ── Sections, on All ──────────────────────────────────────────── */}
      {home && !loadingShop && !shopError && (
        <>
          <Ebooks cards limit={STRIP_MAX} onMore={() => setCat(':ebooks')} onOpen={openBook} extra={ofKind('download')} />
          {[[':events', 'event'], [':courses', 'course']].map(([key, kind]) =>
            ofKind(kind).length ? (
              <MarketSection key={key} title={t(marketOf(key).label)} seeAll={t('a.seeAll')} onSeeAll={() => setCat(key)} strip>
                {ofKind(kind).slice(0, STRIP_MAX).map((row) => (
                  <ListingCard key={row.id} row={row} free={t('ac.free')} onOpen={() => openListing(row.id)} corner={<CardCorner product={row} />} />
                ))}
              </MarketSection>
            ) : null,
          )}
          {sections.map((s) => (
            <MarketSection
              key={`${s.name}:${s.sub ?? ''}:${s.label}`}
              title={s.label}
              seeAll={t('a.seeAll')}
              onSeeAll={s.name ? () => { setCat(s.name); setSub(s.sub ?? null) } : undefined}
              strip
            >
              {s.items.slice(0, STRIP_MAX).map((p) => (
                <MarketCard
                  key={p.id}
                  id={`product-${p.id}`}
                  art={<ProductArt product={p} className={`h-full w-full ${focusId === p.id ? focusRing : ''}`} />}
                  name={p.name}
                  corner={<CardCorner product={p} />}
                  lines={[p.brand || 'Namo', p.soldOut && t('shop.soldOut')]}
                  price={!p.soldOut && <MarketPrice price={p.price} mrp={p.mrp} />}
                  onOpen={() => navigate(productHref(p))}
                />
              ))}
            </MarketSection>
          ))}
        </>
      )}

      {/* ── Grid ──────────────────────────────────────────────────────── */}
      <section className="px-4 py-4">
        {!home && <Kicker>{t(rest.length === 1 ? 'shop.item' : 'shop.items', { n: rest.length })}</Kicker>}

        {home && !loadingShop && !shopError ? null : loadingShop ? (
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
                    role="link"
                    tabIndex={0}
                    aria-label={p.name}
                    onClick={() => navigate(productHref(p))}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(productHref(p))}
                    className={`flex h-full cursor-pointer flex-col overflow-hidden ${focusId === p.id ? focusRing : ''}`}
                  >
                    <ProductArt product={p} className="aspect-video w-full">
                      <CardCorner product={p} />
                      {focusId === p.id && (
                        <span className="caps-sm absolute right-2 top-2 rounded-full bg-btn-deep px-2 py-1 text-white shadow-sm">
                          {t('shop.linked')}
                        </span>
                      )}
                      {p.soldOut && (
                        <span className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
                          <span className="caps-sm rounded-full bg-live px-2.5 py-1 text-white shadow-sm">
                            {t('shop.soldOut')}
                          </span>
                        </span>
                      )}
                    </ProductArt>

                    <div className="flex flex-1 flex-col p-3">
                      {p.brand && <p className="caps-sm t-faint">{p.brand}</p>}
                      <p className="text-meta t-heading">{p.name}</p>
                      <p className="mt-1 text-meta t-faint">{p.subtitle}</p>

                      {/* The discount beside the price (7 Oct 2026, Rahul) — it
                          was a badge on the picture. */}
                      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tnum">
                        <span className="text-body gold">₹{p.price.toLocaleString('en-IN')}</span>
                        {p.mrp && (
                          <span className="caps-sm t-faint line-through">
                            ₹{p.mrp.toLocaleString('en-IN')}
                          </span>
                        )}
                        {off > 0 && <span className="text-meta font-semibold text-ok">{t('home.off', { n: off })}</span>}
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
                          onClick={(e) => { e.stopPropagation(); addToCart(p) }}
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
                            onClick={(e) => { e.stopPropagation(); buyNow(p) }}
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

      </>
      )}

      <div className="h-28" />
    </>
  )
}

/**
 * The product a link points at (`?p=<uuid>`), read once on arrival. Anything that is not a UUID is ignored rather than looked up.
 */
function useFocusedProduct() {
  const [id] = useState(() => {
    const found = new URLSearchParams(window.location.search).get('p')
    return found && /^[0-9a-f-]{36}$/i.test(found) ? found.toLowerCase() : null
  })
  return id
}
