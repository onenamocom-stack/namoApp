import { useEffect, useState } from 'react'
import { academyEvents, courses } from '../data/mock.js'
import { assetFile, fetchAssets } from '../lib/bhakti.js'
import { TabHeader } from '../components/Chrome.jsx'
import Paywall from '../components/Paywall.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopAvatar, PopBar, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'

const TABS = [
  { key: 'ebooks', label: 'ac.tab.ebooks' },
  { key: 'courses', label: 'ac.tab.courses' },
  { key: 'events', label: 'ac.tab.events' },
]

/** Academy — e-books, courses and live events. */
export default function Academy() {
  const [tab, setTab] = useState('ebooks') // leads: the only tab with real content (28 Sep 2026)
  const { t } = useStore()

  return (
    <>
      <TabHeader />

      <Segmented
        items={TABS.map((tb) => ({ ...tb, label: t(tb.label) }))}
        value={tab}
        onChange={setTab}
      />

      <div key={tab} className="animate-fade">
        {tab === 'courses' && <Courses />}
        {tab === 'events' && <Events />}
        {tab === 'ebooks' && <Ebooks />}
      </div>

      <div className="h-24" />
    </>
  )
}

function Courses() {
  const { showToast, t } = useStore()
  const inProgress = courses.filter((c) => c.progress > 0)

  return (
    <>
      {inProgress.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>{t('ac.continue')}</Kicker>
          <ul className="mt-4 space-y-3">
            {inProgress.map((c) => (
              <li key={c.id}>
                <PopCard raised className="p-4">
                  <div className="flex items-start gap-3">
                    <Plate seed={c.id} className="h-14 w-14 flex-none" />
                    <div className="min-w-0 flex-1">
                      <p className="text-body t-heading">{c.title}</p>
                      <p className="mt-1 caps-sm t-faint tnum">{c.tutor}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="caps-sm t-faint">{t('ac.progress')}</span>
                      <span className="caps-sm gold tnum">{c.progress}%</span>
                    </div>
                    <PopBar value={c.progress} />
                  </div>
                  <PopButton size="sm" href={c.url} variant="gold" className="mt-4">
                    {t('ac.resume')}
                  </PopButton>
                </PopCard>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="px-5 py-6">
        <Kicker>{t('ac.allCourses')}</Kicker>
        <ul className="mt-4 space-y-4">
          {courses.map((c) => (
            <li key={c.id}>
              <PopCard className="overflow-hidden">
                <Plate seed={`${c.id}-cover`} className="aspect-video w-full">
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="is-round flex h-12 w-12 items-center justify-center border border-gold bg-bg gold"
                    >
                      <span className="caps-sm leading-none">▶</span>
                    </span>
                  </span>
                  <span className="absolute left-3 top-3">
                    <PopTag tone="gold">{c.level}</PopTag>
                  </span>
                </Plate>

                <div className="p-4">
                  <p className="text-body t-heading">{c.title}</p>

                  <div className="mt-3 flex items-center gap-3">
                    <PopAvatar initials={c.initials} size={26} />
                    <span className="min-w-0 flex-1 truncate caps-sm t-faint">{c.tutor}</span>
                    <span className="flex-none caps-sm t-faint tnum">
                      {c.lessons} · {c.duration}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <p className="flex-1 text-lead gold tnum">
                      ₹{c.price.toLocaleString('en-IN')}
                    </p>
                    <PopButton
                      onClick={() => showToast(t('ac.enrolledIn', { title: c.title }))}
                      full={false}
                      className="px-4"
                    >
                      {t('ac.enrol')}
                    </PopButton>
                    <PopButton size="sm" href={c.url} variant="gold" full={false} className="px-4">
                      {t('ac.watch')}
                    </PopButton>
                  </div>
                </div>
              </PopCard>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function Events() {
  const { showToast, hasFlag, toggleFlag, t } = useStore()

  return (
    <section className="px-5 py-6">
      <Kicker>{t('ac.webinars')}</Kicker>
      <ul className="mt-4 space-y-4">
        {academyEvents.map((e) => {
          const full = e.taken >= e.seats
          const joined = hasFlag(`event:${e.id}`)
          const left = e.seats - e.taken

          return (
            <li key={e.id}>
              <PopCard className="overflow-hidden">
                {/* A cover, so an event reads as the same kind of object as a
                    course. Without one these were settings rows sitting next
                    to cards. */}
                <Plate seed={`${e.id}-cover`} variant="orbit" className="aspect-[21/9] w-full">
                  <span className="absolute left-3 top-3">
                    <PopTag tone={e.price === 0 ? 'gold' : 'default'}>
                      {e.price === 0 ? t('ac.free') : e.kind}
                    </PopTag>
                  </span>
                  <span className="caps-sm absolute bottom-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 shadow-sm t-sub tnum">
                    {e.date} · {e.time}
                  </span>
                </Plate>

                <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body t-heading">{e.title}</p>
                  </div>
                  <div className="flex-none text-right">
                    <p className="caps-sm t-faint tnum">{e.date}</p>
                    <p className="mt-1 text-meta gold tnum">{e.time}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <PopAvatar initials={e.initials} size={28} />
                  <span className="min-w-0 flex-1 truncate caps-sm t-faint">{e.host}</span>
                  <span className="flex-none caps-sm tnum t-faint">
                    {full ? t('ac.full') : t('ac.seatsLeft', { n: left })}
                  </span>
                </div>

                {/* Seat fill, drawn on the same rail as course progress. */}
                <PopBar value={(e.taken / e.seats) * 100} className="mt-3" />

                <div className="mt-4 flex items-center gap-3">
                  <p className="flex-1 text-meta tnum t-sub">
                    {e.price === 0 ? t('ac.noCharge') : `₹${e.price.toLocaleString('en-IN')}`}
                  </p>
                  <PopButton
                    variant={joined ? 'default' : 'gold'}
                    disabled={full && !joined}
                    onClick={() =>
                      full
                        ? showToast(t('ac.isFull'))
                        : toggleFlag(`event:${e.id}`, {
                            on: t('ac.enrolledIn', { title: e.title }),
                            off: t('ac.cancelled'),
                          })
                    }
                    full={false}
                    className="px-5"
                  >
                    {full && !joined ? t('ac.full') : joined ? t('ac.enrolled') : t('ac.enrol')}
                  </PopButton>
                </div>
                </div>
              </PopCard>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* The books are `bhakti_assets` rows of kind 'ebook': the same curated,
   credited, priceable catalogue as the Bhakti shelves, read in the same one
   request. A PDF opens in the browser's own viewer, which is also where it
   saves from. */
function Ebooks() {
  const { t } = useStore()
  const [books, setBooks] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchAssets()
      .then((all) => setBooks(all.filter((a) => a.kind === 'ebook')))
      .catch(() => setFailed(true))
  }, [])

  if (failed) return <p className="px-5 py-10 text-center text-meta t-faint">{t('ac.libErr')}</p>
  if (!books) return <p className="px-5 py-10 text-center text-meta t-faint">{t('a.loading')}</p>
  if (!books.length) return <p className="px-5 py-10 text-center text-meta t-faint">{t('ac.noBooks')}</p>

  return (
    <section className="px-5 py-6">
      <Kicker>{t('ac.yoursToRead')}</Kicker>
      <ul className="mt-4 space-y-4">
        {books.map((d) => (
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

      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-meta t-heading">{d.title}</p>
          <p className="mt-1 caps-sm t-faint">
            PDF · {d.artist}
            {priced && ` · ₹${rupees(d.pricePaise)}`}
          </p>
        </div>
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
