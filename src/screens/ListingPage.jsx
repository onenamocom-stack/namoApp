import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { MarketPrice } from '../components/MarketCard.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton } from '../components/Pop.jsx'
import { inAndroidApp } from '../lib/platform.js'
import RichText from '../components/RichText.jsx'
import VerifiedMark from '../components/VerifiedMark.jsx'
import { access, get, listing as fetchListing, previewLesson } from '../lib/market.js'
import { useStore } from '../store.jsx'
import { PickBar, SharerBar } from '../components/TagPick.jsx'
import { PhotoSwiper } from '../components/Pieces.jsx'
import { openShare } from '../lib/share.js'

/**
 * A seller's listing, `/shop/l/:id` (15 Oct 2026, Phase 17): a download, a
 * course or an event, each with the page that suits it (Rahul: "optimise
 * for the category"). A product listing is a shop product and opens its
 * product page.
 *
 * A course sells hours of teaching: what you will learn, the lessons (the
 * first a free preview), who teaches it. An event sells a seat at a time:
 * when, how long, online, seats left, who hosts it. A download sells a
 * file. One button at the thumb: Enroll, Book seat or Get it — free is
 * taken, paid opens PhonePe — and once yours, Start, Join or Download.
 */
export default function ListingRoute() {
  const { id } = useParams()
  const { session, showToast } = useStore()
  const [row, setRow] = useState(undefined)
  const [opened, setOpened] = useState(null) // what access() answered
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    fetchListing(id)
      .then(setRow)
      .catch(() => setRow(null))
  }, [id])

  useEffect(() => {
    window.scrollTo(0, 0)
    setRow(undefined)
    setOpened(null)
    load()
  }, [load])

  // Once it is yours, what you bought: the file, the lessons, the link.
  useEffect(() => {
    if (row?.owned && !opened) access(row.id).then(setOpened).catch(() => {})
  }, [row, opened])

  if (row === undefined) {
    return (
      <>
        <TopBar title="Market" back backTo="/shop" />
        <Loader className="py-24" />
      </>
    )
  }
  if (row === null) {
    return (
      <>
        <TopBar title="Market" back backTo="/shop" />
        <p className="px-6 py-16 text-center text-meta t-body">That is no longer on the Market.</p>
      </>
    )
  }
  if (row.kind === 'product' && row.product_id) return <Navigate to={`/shop/p/${row.product_id}`} replace />

  const buy = async () => {
    if (!session) return showToast('Sign in to get it.')
    setBusy(true)
    const res = await get(row, { prefill: { contact: session?.user?.phone || undefined } })
    setBusy(false)
    if (res.closed) return
    if (res.unconfirmed) return showToast('Payment received. It opens in a minute.')
    if (!res.ok) return showToast(res.reason)
    showToast(row.price_paise ? 'Paid. It is yours.' : 'It is yours.')
    load()
  }

  const props = { l: row, opened, busy, buy }
  if (row.kind === 'course') return <CoursePage {...props} />
  if (row.kind === 'event') return <EventPage {...props} />
  return <DownloadListing {...props} />
}

function Cover({ l, children }) {
  return (
    <div className="relative">
      {l.cover_url ? (
        <PhotoSwiper photos={[l.cover_url, ...(l.gallery ?? [])]} alt={l.title} imgClassName="aspect-video w-full bg-surface2 object-contain" />
      ) : (
        <Plate seed={l.id} variant="contour" className="aspect-video w-full" />
      )}
      {children}
    </div>
  )
}

function Head({ l, kindLabel }) {
  const { t, showToast } = useStore()
  return (
    <>
    <PickBar />
    <section className="px-5 pt-5">
      <span className="pill caps-sm">{kindLabel}</span>
      <h1 className="mt-3 text-title t-heading">{l.title}</h1>
      <p className="mt-1 flex items-center gap-1 text-meta t-faint">
        {t('dl.by', { name: l.seller?.name })}
        {(l.seller?.is_pro || l.seller?.is_creator) && (
          <VerifiedMark size={14} tone={l.seller?.is_pro ? 'pro' : 'creator'} />
        )}
      </p>
      <div className="mt-3 text-lead">
        <MarketPrice price={l.price_paise / 100} mrp={l.mrp_paise ? l.mrp_paise / 100 : null} free={t('ac.free')} />
      </div>
    </section>
    {/* Share for everybody (18 Oct 2026, Rahul): WhatsApp and a Namo chat
        both show the cover. */}
    <div className="px-5 pt-3">
      <button
        type="button"
        onClick={async () => {
          const said = await openShare({ path: `/shop/l/${l.id}`, title: l.title, media: l.cover_url || null })
          if (said) showToast(said)
        }}
        className="pill caps-sm"
      >
        <Icon name="share" size={14} /> Share
      </button>
    </div>
    {/* A Pro's or a Creator's Tag and Link (15 Oct 2026, Rahul). */}
    <SharerBar product={l} />
    </>
  )
}

function Facts({ items }) {
  return (
    <ul className="mt-4 grid grid-cols-3 divide-x divide-rule rounded-2xl border border-rule text-center">
      {items.map(([icon, head, note]) => (
        <li key={icon} className="flex flex-col items-center gap-0.5 px-2 py-3">
          <span className="gold">
            <Icon name={icon} size={18} />
          </span>
          <span className="text-meta font-semibold t-heading">{head}</span>
          <span className="text-micro leading-tight t-faint">{note}</span>
        </li>
      ))}
    </ul>
  )
}

function About({ l }) {
  if (!l.description?.trim()) return null
  return (
    <section className="px-5 pt-7">
      <h2 className="caps-sm t-faint">About</h2>
      <RichText text={l.description} className="mt-3" />
    </section>
  )
}

function Seller({ l }) {
  const { t } = useStore()
  const s = l.seller || {}
  const to = s.is_pro ? `/consult/${s.id}` : `/u/${s.id}`
  return (
    <section className="px-5 pt-7">
      <h2 className="caps-sm t-faint">{t('ls.about')}</h2>
      <Link to={to} className="mt-3 flex items-center gap-3 rounded-2xl border border-rule p-4">
        {s.avatar_url ? (
          <img src={s.avatar_url} alt="" className="h-12 w-12 flex-none rounded-full object-cover" />
        ) : (
          <Plate seed={s.id || 'seller'} variant="contour" className="h-12 w-12 flex-none rounded-full" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-meta font-semibold t-heading">
            {s.name} {(s.is_pro || s.is_creator) && <VerifiedMark size={15} tone={s.is_pro ? 'pro' : 'creator'} />}
          </span>
          <span className="block text-micro t-faint">{s.is_pro ? 'Pro' : 'Creator'} · see their page</span>
        </span>
        <Icon name="back" size={16} className="rotate-180 t-faint" />
      </Link>
    </section>
  )
}

/* A paid download or course is not sold in the Android app: Google Play
   allows digital purchases only through its own billing (19 Oct 2026). */
function NotInApp() {
  return <span className="max-w-[10rem] text-right text-micro t-faint">Not sold in the app</span>
}

function Foot({ price, note, children }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[420px] items-center gap-3 border-t border-rule bg-bg px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
      <span className="flex-1">
        <span className="block text-lead font-semibold t-heading tnum">{price}</span>
        {note && <span className="block text-micro t-faint">{note}</span>}
      </span>
      {children}
    </div>
  )
}

const priceLabel = (l, t) => (l.price_paise ? `₹${(l.price_paise / 100).toLocaleString('en-IN')}` : t('ac.free'))

// ── a course ────────────────────────────────────────────────────────────────

export function CoursePage({ l, opened, busy, buy }) {
  const { t, showToast } = useStore()
  const [playing, setPlaying] = useState(null) // {url, title}
  const hours = Math.max(1, Math.round((l.minutes || 0) / 60))

  const play = async (i) => {
    const lesson = l.lessons[i]
    const own = opened?.lessons?.[i]?.url
    if (own) return setPlaying({ url: own, title: lesson.title })
    if (!lesson.preview) return showToast('Enroll to watch this lesson.')
    try {
      setPlaying({ url: await previewLesson(l.id, i), title: lesson.title })
    } catch {
      showToast('Could not open the preview. Try again.')
    }
  }

  return (
    <>
      <TopBar title={t('ac.tab.courses')} back backTo="/shop?cat=courses" />
      {playing ? (
        <div className="bg-black">
          <video src={playing.url} controls autoPlay playsInline className="aspect-video w-full" />
          <p className="px-4 py-2 text-micro text-white/80">{playing.title}</p>
        </div>
      ) : (
        <Cover l={l}>
          {l.lessons?.some((x) => x.preview) && (
            <button type="button" onClick={() => play(0)} className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg">
                <Icon name="play" size={24} />
              </span>
              <span className="caps-sm absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-white">
                {t('ls.c.preview')}
              </span>
            </button>
          )}
        </Cover>
      )}

      <Head l={l} kindLabel={t('ls.c.kind')} />
      <section className="px-5">
        <Facts
          items={[
            ['play', t('ls.c.lessons', { n: l.lessons_count }), l.minutes ? t('ls.c.hours', { n: hours }) : ''],
            ['chat', l.language || '—', t('ls.c.lang')],
            ['infinity', t('ls.c.yours'), t('ls.c.yoursNote')],
          ]}
        />
      </section>
      <About l={l} />

      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('ls.c.content')}</h2>
        <ol className="mt-3 divide-y divide-rule rounded-2xl border border-rule">
          {l.lessons.map((x, i) => (
            <li key={i}>
              <button type="button" onClick={() => play(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="w-5 flex-none text-micro t-faint tnum">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-meta t-heading">{x.title}</span>
                {l.owned ? (
                  <span className="gold"><Icon name="play" size={14} /></span>
                ) : x.preview ? (
                  <span className="caps-sm gold">{t('ls.c.preview')}</span>
                ) : (
                  <span className="text-micro t-faint tnum">{x.minutes ? t('ls.c.mins', { n: x.minutes }) : ''}</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      </section>

      <Seller l={l} />
      <div className="h-28" />
      <Foot price={l.owned ? 'Yours' : priceLabel(l, t)} note={l.owned ? 'Every lesson is open' : t('ls.c.footNote')}>
        {l.owned ? (
          <PopButton variant="gold" full={false} className="px-6" onClick={() => play(0)}>
            Start
          </PopButton>
        ) : l.price_paise && inAndroidApp() ? (
          <NotInApp />
        ) : (
          <PopButton variant="gold" full={false} className="px-6" onClick={buy} disabled={busy || !l.open}>
            {busy ? '…' : t('ls.c.enroll')}
          </PopButton>
        )}
      </Foot>
    </>
  )
}

// ── an event ────────────────────────────────────────────────────────────────

export function EventPage({ l, opened, busy, buy }) {
  const { t } = useStore()
  const at = l.starts_at ? new Date(l.starts_at) : null
  const end = at ? new Date(at.getTime() + (l.duration_minutes || 0) * 60_000) : null
  const tm = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const left = l.seats_left
  return (
    <>
      <TopBar title={t('ac.tab.events')} back backTo="/shop?cat=events" />
      <Cover l={l}>
        {at && (
          <span className="absolute left-4 top-4 flex w-14 flex-col items-center overflow-hidden rounded-xl bg-white text-center shadow-lg">
            <span className="w-full bg-live py-0.5 caps-sm text-white">
              {at.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}
            </span>
            <span className="py-1 text-title font-semibold leading-none t-heading tnum">{at.getDate()}</span>
          </span>
        )}
        <span className="caps-sm absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-white">
          <span className="h-2 w-2 rounded-full bg-ok" /> {t('ls.e.online')}
        </span>
      </Cover>

      <Head l={l} kindLabel={t('ls.e.kind')} />
      <section className="px-5">
        <Facts
          items={[
            ['calendar', at ? at.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—',
              at ? `${tm(at)} – ${tm(end)}` : ''],
            ['video', t('ls.e.online'), l.owned ? 'Link below' : t('ls.e.linkNote')],
            ['groups', left == null ? '—' : t('ls.e.left', { n: left }), l.seats ? t('ls.e.of', { n: l.seats }) : ''],
          ]}
        />
        {!l.owned && left != null && left > 0 && left <= 10 && (
          <p className="mt-3 caps-sm text-live">{t('ls.e.filling', { n: left })}</p>
        )}
        {l.owned && opened?.join_url && (
          <a href={opened.join_url} target="_blank" rel="noopener noreferrer"
            className="mt-4 block rounded-2xl border border-gold-fill bg-gold-fill/10 p-4">
            <span className="caps-sm gold">Your seat is booked</span>
            <span className="mt-1 block break-all text-meta t-heading">{opened.join_url}</span>
            <span className="mt-1 block text-micro t-faint">Open it at the time. Keep this to yourself.</span>
          </a>
        )}
      </section>
      <About l={l} />

      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('ls.e.how')}</h2>
        <ul className="mt-3 space-y-2">
          {['Book your seat. It is held for you at once.',
            'The joining link shows here once you have booked.',
            'Join from your phone or computer. Nothing to install.'].map((x) => (
            <li key={x} className="flex items-start gap-2 text-meta t-body">
              <span className="mt-0.5 flex-none text-ok"><Icon name="check" size={16} /></span>
              {x}
            </li>
          ))}
        </ul>
      </section>

      <Seller l={l} />
      <div className="h-28" />
      <Foot price={l.owned ? 'Booked' : priceLabel(l, t)} note={l.owned ? null : left != null ? t('ls.e.left', { n: left }) : null}>
        {l.owned ? (
          <PopButton href={opened?.join_url} variant="gold" full={false} className="px-6" disabled={!opened?.join_url}>
            Join
          </PopButton>
        ) : (
          <PopButton variant="gold" full={false} className="px-6" onClick={buy} disabled={busy || !l.open}>
            {busy ? '…' : !l.open ? 'Closed' : t('ls.e.book')}
          </PopButton>
        )}
      </Foot>
    </>
  )
}

// ── a download ──────────────────────────────────────────────────────────────

function DownloadListing({ l, opened, busy, buy }) {
  const { t } = useStore()
  const ext = (l.file_name || '').split('.').pop()?.toUpperCase() || 'FILE'
  const mb = l.file_size ? `${(l.file_size / 1_048_576).toFixed(1)} MB` : ''
  return (
    <>
      <TopBar title={t('ac.tab.ebooks')} back backTo="/shop?cat=ebooks" />
      <Cover l={l} />
      <Head l={l} kindLabel={ext} />
      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('dl.get')}</h2>
        <ul className="mt-3 divide-y divide-rule rounded-2xl border border-rule">
          {[
            ['download', `${ext} file${mb ? ` · ${mb}` : ''}`, t('dl.get.formatNote')],
            ['check', t('dl.get.now'), t('dl.get.nowNote')],
            ['infinity', t('dl.get.keep'), l.price_paise ? t('dl.get.keepPaid') : t('dl.get.keepFree')],
          ].map(([icon, head, note]) => (
            <li key={icon} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex-none gold"><Icon name={icon} size={18} /></span>
              <span>
                <span className="block text-meta t-heading">{head}</span>
                <span className="block text-micro t-faint">{note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <About l={l} />
      <Seller l={l} />
      <div className="h-28" />
      <Foot price={l.owned ? 'Yours' : priceLabel(l, t)}>
        {l.owned ? (
          <PopButton href={opened?.file_url} variant="gold" full={false} className="px-6" disabled={!opened?.file_url}>
            {t('dl.download')}
          </PopButton>
        ) : l.price_paise && inAndroidApp() ? (
          <NotInApp />
        ) : (
          <PopButton variant="gold" full={false} className="px-6" onClick={buy} disabled={busy}>
            {busy ? '…' : l.price_paise ? t('dl.buy') : t('dl.download')}
          </PopButton>
        )}
      </Foot>
    </>
  )
}
