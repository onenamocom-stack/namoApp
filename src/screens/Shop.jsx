import { useRef, useState } from 'react'
import { products, shopCategories, shopSubcategories, user } from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Search } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

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
    kicker: 'Certified',
    title: 'Stones that ship with the lab report',
    note: 'Every gem, its certificate. No exceptions.',
    cta: 'See gemstones',
    cat: 'Gemstones',
    art: 'orbit',
    from: '#5b2bc4',
    to: '#9d5cf0',
  },
  {
    id: 'bn-rudraksha',
    kicker: 'Nepali origin',
    title: 'Rudraksha, counted by hand',
    note: '108 beads, knotted one at a time.',
    cta: 'See rudraksha',
    cat: 'Rudraksha',
    art: 'contour',
    from: '#0f4c38',
    to: '#2f8f66',
  },
  {
    id: 'bn-remedies',
    kicker: 'Weekly ritual',
    title: 'Remedy kits under ₹1,500',
    note: 'Oil, cloth, mantra card. Nothing you cannot pronounce.',
    cta: 'See remedies',
    cat: 'Remedies',
    art: 'halftone',
    from: '#8a4a10',
    to: '#d99a3c',
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
  Gemstones: 'linear-gradient(135deg, #5b2bc4 0%, #9d5cf0 100%)',
  Maalas: 'linear-gradient(135deg, #0f4c38 0%, #2f8f66 100%)',
  Rudraksha: 'linear-gradient(135deg, #6b3410 0%, #b5722c 100%)',
  Remedies: 'linear-gradient(135deg, #8a2d3d 0%, #cf5f72 100%)',
}

const CAT_LINE = {
  Gemstones: 'Certified, or we do not list it',
  Maalas: 'Counted by hand, knotted one at a time',
  Rudraksha: 'Nepali and Java origin, lab checked',
  Remedies: 'Everything the ritual needs, in one box',
}

export default function Shop() {
  const { cartCount, addToCart, buyNow, spending, setCartOpen, showToast } = useStore()
  const [cat, setCat] = useState('All')
  const [query, setQuery] = useState('')
  const [slide, setSlide] = useState(0)
  const [sub, setSub] = useState(null)
  const rail = useRef(null)

  // One banner's worth of scroll, measured off the DOM rather than derived
  // from the percentage width — the gap and the rail padding are in there too.
  const step = (el) =>
    el.children[1] ? el.children[1].offsetLeft - el.children[0].offsetLeft : el.clientWidth

  // The scroller is the source of truth; state only mirrors it for the dots.
  const onRailScroll = (e) => {
    const i = Math.round(e.currentTarget.scrollLeft / step(e.currentTarget))
    if (i !== slide) setSlide(Math.min(Math.max(i, 0), BANNERS.length - 1))
  }

  const goTo = (i) => {
    const el = rail.current
    if (el) el.scrollTo({ left: i * step(el), behavior: 'smooth' })
  }

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
      <TabHeader
        action={
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label={`Cart, ${cartCount} items`}
            className="pill knob relative !h-9 !w-9 flex-none justify-center"
          >
            <Icon name="cart" size={18} />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold-fill px-1 text-[10px] font-bold tnum text-ink ring-2 ring-surface">
                {cartCount}
              </span>
            )}
          </button>
        }
      />

      <Search value={query} onChange={setQuery} placeholder="Search stones, maalas and kits" />

      {/* ── Banners ─────────────────────────────────────────────────────── */}
      <div className="pt-4">
        <div ref={rail} onScroll={onRailScroll} className="rail gap-3 px-4">
          {BANNERS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setCat(b.cat)}
              className="banner w-[86%] p-5 text-left"
              style={{
                backgroundImage: `linear-gradient(135deg, ${b.from} 0%, ${b.to} 100%)`,
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

              <span className="relative block">
                <span className="caps-sm text-white/70">{b.kicker}</span>
                <span className="mt-2.5 block max-w-[13ch] text-title font-medium leading-tight text-white">
                  {b.title}
                </span>
                <span className="mt-2 block max-w-[26ch] text-meta text-white/75">{b.note}</span>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 caps-sm text-ink shadow-md">
                  {b.cta} <span aria-hidden="true">→</span>
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* Position, not decoration — the dots are tappable. */}
        <div className="mt-3.5 flex justify-center gap-1.5">
          {BANNERS.map((b, i) => (
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
            {f}
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
                  {CAT_LINE[cat]}
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
        <section className="px-4 pb-2 pt-2">
          <Kicker>Matched to your chart</Kicker>
          <PopCard raised tap className="mt-3 overflow-hidden">
            <Plate seed={hero.id} className="aspect-[16/10] w-full">
              <span className="absolute left-3 top-3">
                <PopTag tone="gold">{hero.category}</PopTag>
              </span>
            </Plate>
            <div className="p-5">
              <p className="text-lead t-heading">{hero.name}</p>
              <p className="mt-1 text-meta t-faint">{hero.subtitle}</p>
              <p className="mt-3 text-meta t-body">
                Commonly named for a {user.sunSign} sun with Saturn in the 12th. Commonly named is
                not the same as proven.
              </p>

              <div className="mt-5 flex items-center gap-2">
                <p className="flex-1 text-title gold tnum">
                  ₹{hero.price.toLocaleString('en-IN')}
                </p>
                <PopButton size="sm" full={false} onClick={() => addToCart(hero)}>
                  Add to cart
                </PopButton>
                <PopButton
                  size="sm"
                  full={false}
                  variant="gold"
                  disabled={spending}
                  onClick={() => buyNow(hero)}
                >
                  Buy now
                </PopButton>
              </div>
            </div>
          </PopCard>
        </section>
      )}

      {/* ── Grid ──────────────────────────────────────────────────────── */}
      <section className="px-4 py-4">
        <Kicker>{`${rest.length} ${rest.length === 1 ? 'item' : 'items'}`}</Kicker>

        {rest.length === 0 ? (
          <p className="py-12 text-center text-meta t-faint">
            Nothing matches that. Clear the search, or drop the subcategory.
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {rest.map((p) => {
              const off = p.mrp ? Math.round((1 - p.price / p.mrp) * 100) : null
              return (
                <li key={p.id}>
                  <PopCard tap className="flex h-full flex-col overflow-hidden">
                    <Plate seed={p.id} className="aspect-square w-full">
                      {off > 0 && !p.soldOut && (
                        <span className="caps-sm absolute left-2 top-2 rounded-full bg-gold-fill px-2 py-1 text-ink shadow-sm tnum">
                          {off}% off
                        </span>
                      )}
                      {p.soldOut && (
                        <span className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
                          <span className="caps-sm rounded-full bg-live px-2.5 py-1 text-white shadow-sm">
                            Sold out
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
                        <p className="mt-2 caps-sm t-faint">Named by {p.recommendedBy}</p>
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
                          {p.soldOut ? 'Sold out' : 'Add'}
                        </PopButton>
                        {!p.soldOut && (
                          <PopButton
                            size="sm"
                            variant="gold"
                            full={false}
                            disabled={spending}
                            onClick={() => buyNow(p)}
                            className="flex-1"
                          >
                            Buy
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
            View cart · {cartCount} {cartCount === 1 ? 'item' : 'items'}
          </PopButton>
        )}

        <p className="mt-8 text-center text-meta t-faint">
          A stone does not fix a transit. It is a reminder you paid for. Buy it knowing that.
        </p>
      </section>

      <div className="h-28" />
    </>
  )
}
