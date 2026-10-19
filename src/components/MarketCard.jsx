import Plate from './Plate.jsx'
import { useStore } from '../store.jsx'
import { inAndroidApp } from '../lib/platform.js'

/**
 * The Market's home layout (15 Oct 2026, Rahul's reference): on All, every
 * category is a section — its name, See all, and two cards side by side.
 * A card is a wide picture, then the name, who sells it, and what it is.
 * No star rating: nothing in the Market is rated yet, and a made-up one on
 * a thing for sale is worse than none.
 *
 * `strip` (15 Oct 2026, Rahul: "products slide honge"): the cards are one
 * row that swipes sideways, edge to edge, about two and a third on screen
 * so the next one shows there is more. Without it, a two-up grid.
 */
export function MarketSection({ title, seeAll, onSeeAll, strip = false, children }) {
  return (
    <section className="px-4 pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lead font-semibold t-heading">{title}</h2>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className="flex-none text-meta t-sub">
            {seeAll}
          </button>
        )}
      </div>
      {strip ? (
        <ul className="no-scrollbar -mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 [&>li]:w-[42%] [&>li]:flex-none [&>li]:snap-start">
          {children}
        </ul>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3">{children}</ul>
      )}
    </section>
  )
}

/** The price, the MRP struck through and the saving (15 Oct 2026, Rahul:
 *  "mention MRP"), in rupees. No MRP, or one not above the price, shows the
 *  price alone. A priced `digital` thing shows none in the Android app,
 *  where it is not sold (19 Oct 2026, Rahul; `lib/platform.js`). */
export function MarketPrice({ price, mrp, free, digital = false }) {
  if (digital && price && inAndroidApp()) return null
  const off = mrp && mrp > price ? Math.round((1 - price / mrp) * 100) : 0
  return (
    <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5 tnum">
      <span className="text-meta font-semibold t-heading">{price ? `₹${price.toLocaleString('en-IN')}` : free}</span>
      {off > 0 && (
        <>
          <span className="text-micro t-faint line-through">₹{mrp.toLocaleString('en-IN')}</span>
          <span className="text-micro font-semibold text-ok">{off}% off</span>
        </>
      )}
    </span>
  )
}

/** `art` is the picture, already sized by the caller (a product's photo, a
 *  book's cover); `seller` who sells it, shown as "Sold by: …" (19 Oct 2026,
 *  Rahul); `lines` the grey rows under it; `price` a MarketPrice. */
export function MarketCard({ art, name, seller = null, lines = [], price = null, onOpen, id, corner = null }) {
  const { t } = useStore()
  if (seller) lines = [t('shop.soldBy', { name: seller }), ...lines]
  return (
    <li id={id}>
      <button type="button" onClick={onOpen} className="pop-tap block w-full text-left">
        <span className="relative block aspect-video w-full overflow-hidden rounded-lg">{art}{corner}</span>
        <span className="mt-2 block line-clamp-2 text-meta t-heading">{name}</span>
        {lines.filter(Boolean).map((l, i) => (
          <span key={i} className="mt-0.5 block truncate text-micro t-faint">
            {l}
          </span>
        ))}
        {price}
      </button>
    </li>
  )
}

/** A seller's listing as a card (15 Oct 2026, Phase 17): its cover, name,
 *  seller, what it is (an event's day, a course's lessons) and price. */
export function ListingCard({ row, onOpen, free = 'Free', corner = null }) {
  const when = row.starts_at
    ? new Date(row.starts_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    : null
  const what = row.kind === 'event' ? when : row.kind === 'course' ? `${row.lessons_count} lessons` : null
  return (
    <MarketCard
      art={
        row.cover_url ? (
          <img src={row.cover_url} alt={row.title} loading="lazy" className="h-full w-full bg-surface2 object-contain" />
        ) : (
          <Plate seed={row.id} variant="contour" className="h-full w-full" />
        )
      }
      name={row.title}
      seller={row.seller?.name}
      lines={[what]}
      price={<MarketPrice price={row.price_paise / 100} mrp={row.mrp_paise ? row.mrp_paise / 100 : null} free={free} digital={row.kind !== 'event'} />}
      onOpen={onOpen}
      corner={corner}
    />
  )
}
