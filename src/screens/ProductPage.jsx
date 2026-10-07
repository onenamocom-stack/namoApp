import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton } from '../components/Pop.jsx'
import { fetchProduct, fetchProducts, productHref } from '../lib/shop.js'
import ProductArt from '../components/ProductArt.jsx'
import RichText from '../components/RichText.jsx'
import { useReferralFromLink } from '../lib/shopRef.js'
import { useStore } from '../store.jsx'

/**
 * A product's own page (6 Oct 2026, owner's list): every photo and video,
 * the brand, the price, the description, the questions people ask, and a
 * share link — the page a marketplace product has. Reached from a card in
 * the shop, at /shop/p/<slug> (an id works too).
 *
 * Search and sharing: the page sets the tab title, the meta description and
 * a schema.org Product block while it is open. The app is a single page
 * behind a hash router, so a crawler that does not run JavaScript still
 * sees only the shop's front page — the text is right for those that do,
 * and for anything that reads the page after it renders.
 */
export default function ProductPage() {
  const { key } = useParams()
  const navigate = useNavigate()
  const { addToCart, buyNow, cartCount, setCartOpen, showToast, t } = useStore()
  const [product, setProduct] = useState(undefined) // undefined loading, null not found
  const [failed, setFailed] = useState(false)
  // A tagged product or a consultant's link arrives with ?ref=A…; keep it
  // for the till, as the shop does.
  useReferralFromLink()

  useEffect(() => {
    let alive = true
    // A product opened from "More from the shop" starts at its top.
    window.scrollTo(0, 0)
    document.querySelectorAll('main, [data-scroll]').forEach((el) => el.scrollTo?.(0, 0))
    setProduct(undefined)
    setFailed(false)
    fetchProduct(key)
      .then((p) => alive && setProduct(p))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [key])

  useSeo(product)

  const cart = (
    <button
      type="button"
      onClick={() => setCartOpen(true)}
      aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart, empty'}
      className="relative mr-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold-fill text-ink"
    >
      <Icon name="cart" size={18} />
      {cartCount > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold tnum text-white">
          {cartCount}
        </span>
      )}
    </button>
  )

  if (failed) {
    return (
      <>
        <TopBar title={t('shop.pp.title')} back backTo="/shop" />
        <div className="px-6 py-16 text-center">
          <p className="text-meta t-body">{t('shop.err')}</p>
          <PopButton size="sm" full={false} className="mt-5" onClick={() => navigate(0)}>
            {t('shop.retry')}
          </PopButton>
        </div>
      </>
    )
  }
  if (product === undefined) {
    return (
      <>
        <TopBar title={t('shop.pp.title')} back backTo="/shop" />
        <Loader label={t('shop.opening')} className="py-24" />
      </>
    )
  }
  if (product === null) {
    return (
      <>
        <TopBar title={t('shop.pp.title')} back backTo="/shop" />
        <div className="px-6 py-16 text-center">
          <p className="text-meta t-body">{t('shop.gone')}</p>
          <PopButton size="sm" full={false} className="mt-5" onClick={() => navigate('/shop')}>
            {t('shop.pp.toShop')}
          </PopButton>
        </div>
      </>
    )
  }

  const p = product
  const off = p.mrp ? Math.round((1 - p.price / p.mrp) * 100) : null
  const hasDescription = !!p.description.trim()

  const share = async () => {
    const url = window.location.href
    try {
      // WhatsApp shows `text` and the link, not `title`: the full name and
      // the price go in the text (6 Oct 2026 — only the subtitle showed).
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name} · ₹${p.price.toLocaleString('en-IN')}`, url })
      else {
        await navigator.clipboard.writeText(url)
        showToast(t('shop.pp.copied'))
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <>
      <TopBar title={p.brand || p.category} back backTo="/shop" right={cart} />

      <Gallery product={p} />

      <section className="px-5 pt-5">
        {p.brand && <p className="caps-sm t-faint">{p.brand}</p>}
        <h1 className="mt-1 text-title t-heading">{p.name}</h1>
        {p.subtitle && <p className="mt-1 text-meta t-faint">{p.subtitle}</p>}

        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 tnum">
          <span className="text-title gold">₹{p.price.toLocaleString('en-IN')}</span>
          {p.mrp && (
            <span className="text-meta t-faint">
              {t('shop.pp.mrp')} <span className="line-through">₹{p.mrp.toLocaleString('en-IN')}</span>
            </span>
          )}
          {off > 0 && <span className="caps-sm rounded-full bg-gold-fill px-2 py-0.5 text-ink">{t('home.off', { n: off })}</span>}
        </div>
        <p className="mt-1 text-micro t-faint">{t('shop.pp.taxes')}</p>

        {/* Only when it cannot be bought (7 Oct 2026, Rahul: "Only 3 left"
            and "In stock" were not needed). */}
        {p.soldOut && <p className="mt-3 caps-sm text-bad">{t('shop.soldOut')}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          {p.category && <span className="pill caps-sm">{p.category}</span>}
          {p.subcategory && <span className="pill caps-sm">{p.subcategory}</span>}
          <button type="button" onClick={share} className="pill caps-sm">
            <Icon name="share" size={14} /> {t('shop.pp.share')}
          </button>
        </div>
      </section>

      {hasDescription && (
        <section className="px-5 pt-7">
          <h2 className="caps-sm t-faint">{t('shop.pp.about')}</h2>
          {/* Headings, bold, highlights and lists (6 Oct 2026). */}
          <RichText text={p.description} className="mt-3" />
        </section>
      )}

      {p.faq.length > 0 && (
        <section className="px-5 pt-7">
          <h2 className="caps-sm t-faint">{t('shop.pp.faq')}</h2>
          <ul className="mt-2 divide-y divide-rule border-y border-rule">
            {p.faq.map((item, i) => (
              <li key={i}>
                <details className="group py-3">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-meta font-semibold t-heading">
                    <span>{item.q}</span>
                    <span aria-hidden="true" className="t-faint transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-line text-meta t-body">{item.a}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* More from the shop where the disclaimer was (7 Oct 2026, Rahul) —
          the same category first. */}
      <MoreProducts current={p} />
      <div className="h-28" />

      {/* Add and Buy stay under the thumb however far the page scrolls.
          Fixed to the screen's foot within the app's column, not sticky:
          sticky measured from the page container's bottom padding and sat
          56 px up, with text scrolling through the gap (6 Oct 2026). */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[420px] gap-2 border-t border-rule bg-bg px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
        <PopButton size="sm" disabled={p.soldOut} onClick={() => addToCart(p)} className="flex-1" full={false}>
          {p.soldOut ? t('shop.soldOut') : t('shop.addToCart')}
        </PopButton>
        {!p.soldOut && (
          <PopButton size="sm" variant="gold" onClick={() => buyNow(p)} className="flex-1" full={false}>
            {t('shop.buy')}
          </PopButton>
        )}
      </div>
    </>
  )
}

/** Every photo and video, swiped one at a time, with thumbnails under it to
 *  jump — the way a marketplace product page shows them. */
function Gallery({ product }) {
  const items = product.media.length ? product.media : []
  const rail = useRef(null)
  const [at, setAt] = useState(0)

  if (!items.length) {
    return <Plate seed={product.id} className="aspect-square w-full" />
  }

  const go = (i) => {
    const el = rail.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="bg-white">
      <div
        ref={rail}
        onScroll={(e) => setAt(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex aspect-square w-full snap-x snap-mandatory overflow-x-auto"
      >
        {items.map((m, i) => (
          <div key={m.url} className="relative h-full w-full flex-none snap-center">
            {m.kind === 'video' ? (
              <video
                src={m.url}
                controls
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full bg-black object-contain"
              />
            ) : (
              <img
                src={m.url}
                alt={i === 0 ? product.name : `${product.name}, ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          {items.map((m, i) => (
            <button
              key={m.url}
              type="button"
              aria-label={`${m.kind === 'video' ? 'Video' : 'Photo'} ${i + 1} of ${items.length}`}
              aria-current={at === i}
              onClick={() => go(i)}
              className={`relative h-14 w-14 flex-none overflow-hidden rounded-lg border-2 bg-surface-2 ${
                at === i ? 'border-gold-fill' : 'border-transparent'
              }`}
            >
              {m.kind === 'video' ? (
                <>
                  <video src={m.url} preload="metadata" muted className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                    <Icon name="play" size={16} />
                  </span>
                </>
              ) : (
                <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The tab title, meta description and a schema.org Product block while
 *  the page is open; all put back on the way out. */
function useSeo(p) {
  useEffect(() => {
    if (!p) return undefined
    const before = document.title
    document.title = `${p.seoTitle} · Namo`
    let meta = document.querySelector('meta[name="description"]')
    const hadMeta = !!meta
    const metaBefore = meta?.getAttribute('content') ?? null
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    if (p.seoDescription) meta.setAttribute('content', p.seoDescription)
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      sku: p.sku || undefined,
      brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
      description: p.seoDescription || p.description || undefined,
      image: p.media.filter((m) => m.kind === 'image').map((m) => m.url),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'INR',
        price: p.price,
        availability: p.soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      },
    })
    document.head.appendChild(ld)
    return () => {
      document.title = before
      if (hadMeta && metaBefore !== null) meta.setAttribute('content', metaBefore)
      else meta.remove()
      ld.remove()
    }
  }, [p])
}


/** Other products, the same category first, live and in stock — a 2-up
 *  grid of their photos and prices, each opening its page. */
function MoreProducts({ current }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let live = true
    fetchProducts()
      .then((all) => {
        if (!live) return
        const others = all.filter((x) => x.id !== current.id && !x.soldOut)
        const same = (x) => (x.categories || []).some((c) => (current.categories || [current.category]).includes(c))
        setRows([...others.filter(same), ...others.filter((x) => !same(x))].slice(0, 6))
      })
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [current.id, current.category, current.categories])
  if (!rows?.length) return null
  return (
    <section className="px-5 pt-8">
      <h2 className="caps-sm t-faint">More from the shop</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {rows.map((x) => (
          <li key={x.id}>
            <Link to={productHref(x)} className="block overflow-hidden rounded-2xl border border-stroke bg-white">
              <ProductArt product={x} className="aspect-square w-full" />
              <span className="block p-2.5">
                <span className="line-clamp-2 block text-meta t-heading">{x.name}</span>
                <span className="mt-1 block text-meta gold tnum">₹{x.price.toLocaleString('en-IN')}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

