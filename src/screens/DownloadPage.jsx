import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BhaktiActions from '../components/BhaktiActions.jsx'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { MarketCard, MarketPrice, MarketSection } from '../components/MarketCard.jsx'
import Paywall from '../components/Paywall.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton } from '../components/Pop.jsx'
import RichText from '../components/RichText.jsx'
import { PickBar, SharerBar } from '../components/TagPick.jsx'
import { assetFile, fetchAssets } from '../lib/bhakti.js'
import { rupees, useStore } from '../store.jsx'

/**
 * A download's own page, `/shop/d/:id` (15 Oct 2026, Rahul: "optimise the
 * landing page for the category"). A product's page sells a thing that is
 * shipped — photos, delivery, stock. A download's sells a file: the cover
 * whole, what is in it, what you get (the format, that it opens at once,
 * that it stays yours), and one button at the thumb — Download for a free
 * one, Buy for a priced one, Open once bought.
 *
 * The rows are `bhakti_assets` of kind 'ebook' (the Market's Downloads).
 */
export default function DownloadPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast, t } = useStore()
  const [all, setAll] = useState(null)
  const [failed, setFailed] = useState(false)
  const [link, setLink] = useState(null)
  const [offer, setOffer] = useState(null)
  const [pay, setPay] = useState('wallet')
  const [busy, setBusy] = useState(false)
  const paywall = useRef(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    setLink(null)
    setOffer(null)
    fetchAssets()
      .then((rows) => setAll(rows.filter((a) => a.kind === 'ebook')))
      .catch(() => setFailed(true))
  }, [id])

  const d = all?.find((a) => a.id === id)
  const back = '/shop?cat=ebooks'

  if (failed) {
    return (
      <>
        <TopBar title={t('ac.tab.ebooks')} back backTo={back} />
        <p className="px-6 py-16 text-center text-meta t-body">{t('ac.libErr')}</p>
      </>
    )
  }
  if (!all) {
    return (
      <>
        <TopBar title={t('ac.tab.ebooks')} back backTo={back} />
        <Loader label={t('a.loading')} className="py-24" />
      </>
    )
  }
  if (!d) {
    return (
      <>
        <TopBar title={t('ac.tab.ebooks')} back backTo={back} />
        <div className="px-6 py-16 text-center">
          <p className="text-meta t-body">{t('dl.gone')}</p>
          <PopButton size="sm" full={false} className="mt-5" onClick={() => navigate(back)}>
            {t('dl.all')}
          </PopButton>
        </div>
      </>
    )
  }

  const priced = Boolean(d.pricePaise)
  const price = priced ? d.pricePaise / 100 : 0
  const mrp = d.mrpPaise ? d.mrpPaise / 100 : null
  const format = (d.url || d.title || '').toLowerCase().includes('.zip') ? 'ZIP' : 'PDF'

  /* A priced one asks the server: a ten-minute link to an owner, the price
     (and how it is paid) to anybody else, whose Paywall then opens here. */
  const getIt = async () => {
    setBusy(true)
    const res = await assetFile(d.id)
    setBusy(false)
    if (res.ok) {
      setLink(res.url)
      setOffer(null)
    } else if (res.code === 'needs_purchase') {
      setOffer(res.pricePaise ?? d.pricePaise)
      setPay(res.pay ?? 'wallet')
      setTimeout(() => paywall.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    } else {
      showToast(res.reason)
    }
  }

  const more = all.filter((a) => a.id !== d.id).slice(0, 4)

  return (
    <>
      <TopBar title={t('ac.tab.ebooks')} back backTo={back} />
      <PickBar />

      {/* The whole cover at its own shape, on a quiet ground. */}
      <div className="flex justify-center bg-surface2 px-10 py-6">
        {d.previewUrl ? (
          <img src={d.previewUrl} alt={d.title} className="max-h-[360px] w-auto rounded-lg shadow-lg" />
        ) : (
          <Plate seed={`${d.id}-cover`} variant="contour" className="aspect-[3/4] w-48 rounded-lg" />
        )}
      </div>

      <section className="px-5 pt-5">
        <span className="pill caps-sm">{format}</span>
        <h1 className="mt-3 text-title t-heading">{d.title}</h1>
        <p className="mt-1 text-meta t-faint">{t('dl.by', { name: d.artist })}</p>

        <div className="mt-3 text-lead">
          <MarketPrice price={price} mrp={mrp} free={t('ac.free')} />
        </div>

        <div className="mt-4 flex items-center gap-4">
          <BhaktiActions asset={d} share />
        </div>
      </section>
      {/* A Pro's or a Creator's Tag and Link, as on a product (15 Oct 2026, Rahul). */}
      <SharerBar product={d} />

      {/* What you get: the three things a buyer of a file asks first. */}
      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('dl.get')}</h2>
        <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule">
          {[
            ['download', t('dl.get.format', { f: format }), t('dl.get.formatNote')],
            ['check', t('dl.get.now'), t('dl.get.nowNote')],
            ['infinity', t('dl.get.keep'), priced ? t('dl.get.keepPaid') : t('dl.get.keepFree')],
          ].map(([icon, head, note]) => (
            <li key={icon} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex-none gold">
                <Icon name={icon} size={18} />
              </span>
              <span>
                <span className="block text-meta t-heading">{head}</span>
                <span className="block text-micro t-faint">{note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {d.description?.trim() && (
        <section className="px-5 pt-7">
          <h2 className="caps-sm t-faint">{t('dl.about')}</h2>
          <RichText text={d.description} className="mt-3" />
        </section>
      )}

      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('dl.credit')}</h2>
        <p className="mt-2 text-meta t-body">
          {d.artist} · {d.licence}
        </p>
      </section>

      {offer && (
        <div ref={paywall} className="px-5 pt-7">
          <Paywall
            title={d.title}
            note={t('ac.paywallNote')}
            sku="ebook"
            refKey={d.id}
            pricePaise={offer}
            pay={pay}
            onBought={getIt}
          />
        </div>
      )}

      {more.length > 0 && (
        <MarketSection title={t('dl.more')} seeAll={t('a.seeAll')} onSeeAll={() => navigate(back)}>
          {more.map((x) => (
            <MarketCard
              key={x.id}
              art={
                x.previewUrl ? (
                  <img src={x.previewUrl} alt={x.title} loading="lazy" className="h-full w-full bg-surface2 object-contain" />
                ) : (
                  <Plate seed={`${x.id}-cover`} variant="contour" className="h-full w-full" />
                )
              }
              name={x.title}
              lines={[x.artist]}
              price={
                <MarketPrice
                  price={x.pricePaise ? x.pricePaise / 100 : 0}
                  mrp={x.mrpPaise ? x.mrpPaise / 100 : null}
                  free={t('ac.free')}
                />
              }
              onOpen={() => navigate(`/shop/d/${x.id}`)}
            />
          ))}
        </MarketSection>
      )}
      <div className="h-28" />

      {/* One action under the thumb, as on a product's page. */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[420px] items-center gap-3 border-t border-rule bg-bg px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
        <span className="flex-1 text-lead font-semibold t-heading tnum">
          {priced ? `₹${rupees(d.pricePaise)}` : t('ac.free')}
        </span>
        {!priced ? (
          <PopButton href={d.url} variant="gold" full={false} className="px-6">
            {t('dl.download')}
          </PopButton>
        ) : link ? (
          <PopButton href={link} variant="gold" full={false} className="px-6">
            {t('ac.openPdf')}
          </PopButton>
        ) : (
          <PopButton onClick={getIt} variant="gold" full={false} className="px-6" disabled={busy}>
            {busy ? '…' : t('dl.buy')}
          </PopButton>
        )}
      </div>
    </>
  )
}
