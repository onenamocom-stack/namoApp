import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { assetFile, fetchAssets } from '../lib/bhakti.js'
import Paywall from './Paywall.jsx'
import Plate from './Plate.jsx'
import BhaktiActions from './BhaktiActions.jsx'
import { Kicker, PopButton, PopCard } from './Pop.jsx'
import { MarketCard, MarketSection } from './MarketCard.jsx'
import { rupees, useStore } from '../store.jsx'

/**
 * E-books, for the Market (14 Oct 2026, Rahul: Shop and Academy are one
 * page). This was the Academy screen's E-book tab; its Courses and Events
 * tabs were mock data and went with it — they are "Coming soon" tiles on
 * the Market until they are built.
 */

/* The books are `bhakti_assets` rows of kind 'ebook': the same curated,
   credited, priceable catalogue as the Bhakti shelves, read in the same one
   request. A PDF opens in the browser's own viewer, which is also where it
   saves from. */
export default function Ebooks({ limit = null, onMore = null, cards = false, onOpen = null }) {
  const { t } = useStore()
  const [books, setBooks] = useState(null)
  const [failed, setFailed] = useState(false)
  // A shared book (/bhakti/s/:id forwards here as ?book=) leads the list.
  const [params] = useSearchParams()
  const first = params.get('book')

  useEffect(() => {
    fetchAssets()
      .then((all) => {
        const list = all.filter((a) => a.kind === 'ebook')
        setBooks(first ? [...list.filter((a) => a.id === first), ...list.filter((a) => a.id !== first)] : list)
      })
      .catch(() => setFailed(true))
  }, [first])

  // Under the products on All it is an extra: quiet unless it has books.
  if (onMore && (failed || !books?.length)) return null
  if (failed) return <p className="px-5 py-10 text-center text-meta t-faint">{t('ac.libErr')}</p>
  if (!books) return <p className="px-5 py-10 text-center text-meta t-faint">{t('a.loading')}</p>
  if (!books.length) return <p className="px-5 py-10 text-center text-meta t-faint">{t('ac.noBooks')}</p>

  /* On the Market's All, the first few with See all (`onMore`); on the
     E-books tile, every one. */
  const shown = limit ? books.slice(0, limit) : books
  /* `cards`: a section of the Market's home (15 Oct 2026); a card opens the
     E-books tile with that book first. */
  if (cards) {
    return (
      <MarketSection title={t('ac.tab.ebooks')} seeAll={t('a.seeAll')} onSeeAll={onMore}>
        {shown.map((d) => (
          <MarketCard
            key={d.id}
            art={
              d.previewUrl ? (
                <img src={d.previewUrl} alt={d.title} loading="lazy" className="h-full w-full bg-surface2 object-contain" />
              ) : (
                <Plate seed={`${d.id}-cover`} variant="contour" className="h-full w-full" />
              )
            }
            name={d.title}
            lines={[d.artist, `PDF · ${d.pricePaise ? `₹${rupees(d.pricePaise)}` : t('ac.free')}`]}
            onOpen={() => onOpen?.(d.id)}
          />
        ))}
      </MarketSection>
    )
  }
  return (
    <section className="px-4 py-4">
      <Kicker action={onMore && books.length > shown.length ? t('a.seeAll') : undefined} onAction={onMore || undefined}>
        {onMore ? t('ac.tab.ebooks') : t('ac.yoursToRead')}
      </Kicker>
      <ul className="mt-4 space-y-4">
        {shown.map((d) => (
          <li key={d.id}>
            <Ebook book={d} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One book. A free one opens straight from its public URL. A priced one —
 * the first is 30 Sep 2026's ₹99 guide — has no URL in the list at all: the
 * first tap asks the server, which answers a ten-minute link to somebody who
 * bought it and the price to anybody else.
 *
 * The link is shown as a second button rather than opened for them, because
 * a phone blocks a window opened after a network round trip as a popup.
 */
function Ebook({ book: d }) {
  const { showToast, t } = useStore()
  const [link, setLink] = useState(null)
  const [offer, setOffer] = useState(null)
  const [busy, setBusy] = useState(false)
  const priced = Boolean(d.pricePaise)

  const fetchLink = async () => {
    setBusy(true)
    const res = await assetFile(d.id)
    setBusy(false)
    if (res.ok) {
      setLink(res.url)
      setOffer(null)
    } else if (res.code === 'needs_purchase') {
      setOffer(res.pricePaise ?? d.pricePaise)
    } else {
      showToast(res.reason)
    }
  }

  return (
    <PopCard className="overflow-hidden">
      {d.previewUrl ? (
        /* The whole cover, at its own shape (5 Oct 2026) — a 21:9 crop cut
           the title off most of them. */
        <img src={d.previewUrl} alt={d.title} loading="lazy" className="block h-auto w-full" />
      ) : (
        <Plate seed={`${d.id}-cover`} variant="contour" className="aspect-[21/9] w-full" />
      )}

      <div className="px-4 pt-3.5">
        <p className="truncate text-meta t-heading">{d.title}</p>
        <p className="mt-1 caps-sm t-faint">
          PDF · {d.artist}
          {priced && ` · ₹${rupees(d.pricePaise)}`}
        </p>
      </div>
      {/* Like, comment, reshare and share, as on the Bhakti shelves (12 Oct
          2026, Rahul); Read stays on the right. A priced book has no
          Reshare. */}
      <div className="flex items-center gap-4 py-3 pl-4 pr-3.5">
        <BhaktiActions asset={d} share />
        <span className="flex-1" />
        {!priced ? (
          <PopButton href={d.url} full={false} className="flex-none px-4">
            {t('ac.read')}
          </PopButton>
        ) : link ? (
          <PopButton href={link} full={false} className="flex-none px-4" variant="gold">
            {t('ac.openPdf')}
          </PopButton>
        ) : (
          <PopButton onClick={fetchLink} full={false} className="flex-none px-4" disabled={busy}>
            {busy ? '…' : t('ac.read')}
          </PopButton>
        )}
      </div>

      {offer && (
        <div className="px-4 pb-4">
          <Paywall
            title={d.title}
            note={t('ac.paywallNote')}
            sku="ebook"
            refKey={d.id}
            pricePaise={offer}
            onBought={fetchLink}
          />
        </div>
      )}
    </PopCard>
  )
}
