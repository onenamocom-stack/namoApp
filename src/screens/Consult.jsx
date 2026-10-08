import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bannerStyle, followBanner, useBanners } from '../lib/appearance.js'
import { categories, SESSION } from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import useStartSession from '../components/useStartSession.js'
import { rupees, useStore } from '../store.jsx'
import { listConsultants } from '../lib/consultants.js'
import { PRO_APP_URL } from '../lib/urls.js'
import { toolStyle } from '../lib/tiles.js'

/**
 * The free tools, as circles above the search field.
 *
 * They started here, moved to the top of Home on the argument that free
 * belongs on the first screen before anything asks for money, and are back.
 * **That reversed on 7 Sep 2026.** Home is a stream, and a row of circles
 * pinned above a stream is furniture the scroll immediately buries. Consult is
 * where somebody arrives already asking a question, and the honest answer to
 * most of them is one of these four rather than a paid session — so they sit
 * above the search field, in front of the thing that costs money.
 *
 * They render in the empty-roster branch too. With nobody approved there is
 * nothing to consult and these are the only working answers on the screen;
 * dropping them there would take the free half of the app off production
 * entirely, because production's roster is empty by decision (`01-PRD.md` §7).
 *
 * Each is a route or an overlay; none of them opens a dead end.
 */
const FREE_TOOLS = [
  /* A page, not a slide-over, since 10 Sep 2026. The overlay showed the same
     reading `/horoscope` does with less of it and no address. */
  /* Straight to the full chart since 30 Sep 2026 — the chart is computed at
     sign-up, and the reader's own predictions are its second tab. The free
     sign-by-sign reading is /horoscope, reached from Home. */
  { key: 'horoscope', label: 'tool.horoscope', icon: 'horoscope', to: '/chart', hue: '#f08a24' },
  /* Its own page since 30 Sep 2026, out of the messages panel. */
  { key: 'ai', label: 'tool.ai', icon: 'ai', to: '/ask', hue: '#7c4dff' },
  { key: 'tarot', label: 'tool.tarot', icon: 'tarot', to: '/tarot', hue: '#d81b60' },
  { key: 'match', label: 'tool.match', icon: 'kundli', to: '/match', hue: '#c62828' },
  { key: 'muhurat', label: 'tool.muhurat', icon: 'calendar', to: '/muhurat', hue: '#1e9e5a' },
]

/** Circles, because a circle reads as a tool and a card reads as content. */
function FreeTools() {
  const { openChat, t } = useStore()
  const bag = { openChat }

  return (
    <section className="pb-1 pt-3">
      <ul className="tile-rail px-4">
        {FREE_TOOLS.map((f) => (
          <li key={f.key} className="flex-none">
            {f.to ? (
              <Link to={f.to} className="tile">
                <span className="tile-face" style={toolStyle(f.hue ?? '#f08a24')}>
                  <Icon name={f.icon} size={22} weight={2} />
                </span>
                <span className="text-center text-[12px] font-semibold leading-tight t-body">{t(f.label)}</span>
              </Link>
            ) : (
              <button type="button" onClick={() => f.act(bag)} className="tile">
                <span className="tile-face" style={toolStyle(f.hue ?? '#f08a24')}>
                  <Icon name={f.icon} size={22} weight={2} />
                </span>
                <span className="text-center text-[12px] font-semibold leading-tight t-body">{t(f.label)}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The three promo banners at the top of Consult — same object as Shop's, a
 * gradient block with one CTA, just themed for this roster. Kept as a local
 * const rather than a mock.js export: Shop.jsx set that precedent (its own
 * BANNERS array lives in the screen file), and there is no banner data
 * anywhere in mock.js to be consistent with instead.
 */
/* Text fields are i18n keys; `SV` fills their `{label}` / `{promise}`. */
const SV = { label: SESSION.label, mins: SESSION.mins, promise: SESSION.promise }

const BANNERS = [
  {
    id: 'bn-verified',
    kicker: 'con.bn.verified.k',
    title: 'con.bn.verified.t',
    note: 'con.bn.verified.n',
    cta: 'con.bn.verified.c',
    art: 'orbit',
    from: '#7c2d12',
    to: '#c2410c',
  },
  {
    id: 'bn-first',
    kicker: 'con.bn.first.k',
    title: 'con.bn.first.t',
    note: 'con.bn.first.n',
    cta: 'con.bn.first.c',
    art: 'halftone',
    from: '#6b3410',
    to: '#a85400',
  },
  {
    id: 'bn-refer',
    kicker: 'con.bn.refer.k',
    title: 'con.bn.refer.t',
    note: 'con.bn.refer.n',
    cta: 'con.bn.refer.c',
    art: 'contour',
    from: '#8a3a00',
    to: '#b45309',
  },
]

/** How each channel is actually delivered. */
/* Four ways to reach somebody, on every card (5 Oct 2026, the owner's
   call): video, audio and chat run on the per-minute meter now; Book takes a
   slot later at 20% under that rate (docs/01-PRD.md §4.1). */
export default function Consult() {
  const { showToast, t, lang } = useStore()
  const navigate = useNavigate()
  // The console's banners first, then the built-in three (4 Oct 2026).
  const banners = useBanners('consult', BANNERS, lang)
  const { start, asking } = useStartSession()
  /* Real consultants from phase 4, read through `consultants_public` — the
     view is the access control, so an unapproved practice is missing from
     this list because the server never sent it, not because a filter here
     dropped it. */
  const [consultants, setConsultants] = useState(null)
  const [cat, setCat] = useState('All')
  // The header's box searches now (6 Oct 2026); nothing narrows here.
  const query = ''
  const [slide, setSlide] = useState(0)
  const rail = useRef(null)
  const listRef = useRef(null)

  /* Re-read every twenty seconds while the screen is open, and when the
     tab comes back (5 Oct 2026): online, offline and busy change while you
     look, and a list read once said whatever was true when you arrived. */
  useEffect(() => {
    let live = true
    const load = () => listConsultants().then((rows) => live && rows.length && setConsultants(rows))
    listConsultants().then((rows) => live && setConsultants(rows))
    const timer = setInterval(load, 20_000)
    const onShow = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [])

  const step = (el) =>
    el.children[1] ? el.children[1].offsetLeft - el.children[0].offsetLeft : el.clientWidth

  const onRailScroll = (e) => {
    const i = Math.round(e.currentTarget.scrollLeft / step(e.currentTarget))
    if (i !== slide) setSlide(Math.min(Math.max(i, 0), banners.length - 1))
  }

  const goTo = (i) => {
    const el = rail.current
    if (el) el.scrollTo({ left: i * step(el), behavior: 'smooth' })
  }

  const scrollToList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const filters = ['All', ...categories]
  const q = query.trim().toLowerCase()
  const roster = consultants ?? []
  const list = roster.filter((c) => {
    const inCat = cat === 'All' || (c.practices ?? [c.category]).includes(cat)
    const inQuery =
      !q ||
      [c.name, c.specialization, c.category, ...c.languages].some((f) =>
        f.toLowerCase().includes(q),
      )
    return inCat && inQuery
  })
    // Whoever is online right now comes first (5 Oct 2026, owner's request);
    // within each group the server's order — best rated first — stands.
    .sort((a, b) => Number(b.online) - Number(a.online))

  /* The dot is PRESENCE now (24 Sep 2026), not `verified`. It stood in for
     online while there was no presence — a dot that is always green is
     worse than no dot — and the roster carries the real thing today:
     `accepting_now` and a heartbeat inside ninety seconds, decided by the
     server so two phones with two clocks cannot disagree about it.

     Filtered from `list`, not from `roster`. Taken off the whole roster it
     disagreed with the count beside it — filter to a category holding one
     person and the line read "1 person · 4 verified", more verified than
     people — and the rail went on offering verified astrologers to somebody
     who had just asked for tarot. */
  const featured = list.filter((c) => c.verified)

  /* Nobody approved: the empty state IS the screen, not a line of grey text
     under the furniture. Everything above it — three banners promising
     screened experts, category chips reading `· 0`, a "0 verified" rail, a
     line insisting every session is twenty minutes — describes a roster that
     does not exist, and a page that advertises supply above an empty list
     contradicts itself twice before you finish scrolling.

     Search goes too. There is nothing to search. */
  if (consultants !== null && roster.length === 0) {
    return (
      <>
        <TabHeader />
        <FreeTools />
        <section className="px-5 pt-6">
          <NobodyYet />
        </section>
        <div className="h-24" />
      </>
    )
  }

  return (
    <>
      <TabHeader />

      {/* Search is the header's box since 6 Oct 2026 (Rahul's design): it
          opens /search on Astrologers, and this tab spends no row on it. */}

      <FreeTools />

      {/* ── Banners ─────────────────────────────────────────────────────── */}
      <div className="pt-4">
        <div ref={rail} onScroll={onRailScroll} className="rail gap-3 px-4">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                if (b.remote) followBanner(b, navigate)
                else if (b.id === 'bn-verified') scrollToList()
                else if (b.id === 'bn-refer') showToast(t('con.inviteProto'))
                else showToast(t('con.offerProto'))
              }}
              className="banner h-[150px] w-[86%] p-3 text-left"
              style={{
                ...bannerStyle(b),
                animation: `pop-in .5s cubic-bezier(.2,.7,.3,1) ${i * 80}ms backwards`,
              }}
            >
              <Plate
                seed={b.id}
                variant={b.art}
                className="pointer-events-none absolute -right-8 -top-6 h-[150%] w-2/3 animate-float bg-transparent opacity-25 mix-blend-overlay"
              />
              <span className="sheen animate-sweep" style={{ animationDelay: `${i * 2}s` }} />

              {/* Halved on 7 Sep (197px → 95px), then back up ~50% on 10 Sep
                  by restoring the one line that was cut. `note` was where
                  most of that height lived — two lines of 13px plus its
                  margin, ~46px — so putting it back is the whole change and
                  nothing else moves. ~95px → ~141px.

                  `flex flex-col`, not `block`: as a block the children are
                  inline and the last one carries a line-box descender, 11px
                  of dead space under the CTA that no padding rule explains. */}
              <span className="relative flex flex-col items-start">
                <span className="caps-sm text-white/70">{b.remote ? b.kicker : t(b.kicker, SV)}</span>
                <span className="mt-1 max-w-[22ch] line-clamp-1 text-lead font-medium leading-tight text-white">
                  {b.remote ? b.title : t(b.title, SV)}
                </span>
                <span className="mt-1.5 max-w-[30ch] line-clamp-2 text-meta text-white/75">{b.remote ? b.note : t(b.note, SV)}</span>
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 caps-sm text-ink shadow-md">
                  {b.remote ? b.cta : t(b.cta, SV)} <span aria-hidden="true">→</span>
                </span>
              </span>
            </button>
          ))}
        </div>

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

      {/* ── Category chips ─────────────────────────────────────────────── */}
      <div className="relative mt-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
          {filters.map((f) => {
            const count = f === 'All' ? roster.length : roster.filter((c) => (c.practices ?? [c.category]).includes(f)).length
            return (
              <button
                key={f}
                type="button"
                aria-pressed={cat === f}
                onClick={() => setCat(f)}
                className="pill caps-sm tnum"
              >
                {f === 'All' ? t('a.all') : f} · {count}
              </button>
            )
          })}
        </div>
        <span className="scroll-fade" aria-hidden="true" />
      </div>

      {/* The verified rail ("Unlimited questions in 20 min") and "Your
          sessions" left this screen on 5 Oct 2026 (owner's call): sessions
          live in the chat panel's Sessions tab now, and the rail repeated
          the roster below it. */}
      {/* ── Available now — the full roster ───────────────────────────── */}
      <section ref={listRef} className="px-5 pt-8">
        {/* "Every session is 20 min · unlimited questions" and "Booking a
            slot costs 20% less" left on 6 Oct 2026 (Rahul: extra text). */}
        <Kicker>
          {`${t(list.length === 1 ? 'con.person' : 'con.people', { n: list.length })}${
            featured.length > 0 ? ` · ${t('con.verified', { n: featured.length })}` : ''
          }`}
        </Kicker>

        <ul className="mt-4 space-y-3">
          {list.map((c) => (
            /* The compact card (8 Oct 2026, Rahul's reference): photo left,
               name and tick, the specialty, stars and reviews, experience and
               languages on one line; under a dashed rule, Call and Chat with
               their rate. The old card spent four buttons, badges and two
               sentences on every row. Video and Book stay on the profile. */
            <li key={c.id} className="pop-card p-3">
              <Link to={`/consult/${c.id}`} className="flex items-start gap-3 transition-opacity hover:opacity-70">
                <span className="relative flex-none">
                  <span className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-xl border-2 border-gold bg-surface-2 text-lead font-semibold t-sub">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      c.initials
                    )}
                  </span>
                  {c.online && (
                    <span className="absolute -bottom-1 -right-1 block h-3.5 w-3.5 rounded-full bg-ok ring-2 ring-surface" aria-label="Online" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-body font-semibold text-t1">{c.name}</span>
                    {c.verified && (
                      <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-ok text-white" aria-label="Verified">
                        <Icon name="check" size={10} weight={3} />
                      </span>
                    )}
                    {c.online && c.busy && (
                      <span className="flex-none rounded-full bg-gold-fill/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-gold">
                        Busy
                      </span>
                    )}
                  </span>
                  {(c.specialization || c.practices[0]) && (
                    <span className="mt-1 inline-block max-w-full truncate rounded-md border border-gold/40 px-2 py-0.5 text-[11px] text-gold">
                      {c.specialization || c.practices[0]}
                    </span>
                  )}
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] text-t2 tnum">
                    {c.rating != null ? (
                      <>
                        <Stars value={c.rating} />
                        <span className="text-t3">|</span>
                        <span>({c.reviewCount ?? 0}) Reviews</span>
                      </>
                    ) : (
                      <span className="text-gold">{t('con.new')}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-t3">
                    {[
                      c.experienceYrs ? `${t('con.yrs', { n: c.experienceYrs })} exp` : t('con.practising'),
                      ...c.languages,
                    ].join(' • ')}
                  </span>
                </span>
              </Link>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-stroke pt-3">
                {['audio', 'chat'].map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={!c.online || asking}
                    onClick={() => start(c, kind)}
                    className={`flex flex-col items-center justify-center rounded-xl py-1.5 leading-tight transition active:scale-[0.98] disabled:pointer-events-none ${
                      !c.online
                        ? 'bg-stroke/70 text-t2'
                        : kind === 'chat'
                          ? 'bg-gold-fill text-white'
                          : 'border border-gold text-gold'
                    }`}
                  >
                    <span className="text-[14px] font-semibold">
                      {c.online ? (kind === 'chat' ? t('con.chat') : 'Call') : 'Offline'}
                    </span>
                    {/* A new seeker's first session with this consultant is
                        free for three minutes (7 Oct 2026). */}
                    <span className="text-[11px] tnum opacity-90">
                      {c.freeFirst
                        ? 'First 3 min free'
                        : `₹${c.perMinutePaise != null ? rupees(c.perMinutePaise) : '—'}${t('con.perMin')}`}
                    </span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>

        {consultants === null && (
          <p className="py-10 text-center text-meta text-t3">{t('con.loading')}</p>
        )}

        {/* `consultants !== null` matters: while the fetch is in flight both
            `roster` and `list` are empty, and without it this rendered
            directly under "Reading the roster." — a load in progress reading
            as a search that found nobody. */}
        {consultants !== null && list.length === 0 && (
          <p className="py-10 text-center text-meta text-t3">
            {t('con.noMatch')}
          </p>
        )}
      </section>

      <div className="h-24" />
    </>
  )
}

/**
 * What `/consult` is before there is a marketplace.
 *
 * An empty list is the truthful state of a marketplace with no approved
 * consultants, and it is worth saying plainly rather than dressing up: the
 * alternative considered was seeding six invented astrologers with invented
 * credentials so the page looked busy, which stops being decoration and starts
 * being fraud the day phase 5 can take money for a session.
 *
 * It offers the one action that changes the situation. It does NOT offer to
 * take your number and tell you when readings open: everybody standing here is
 * already signed in, so their number is on file, and nothing in this app can
 * send that message. An unimplemented promise on screen is the same mistake as
 * the cashback label, and that one got deleted rather than deferred.
 */
function NobodyYet() {
  const { t } = useStore()
  return (
    <div className="pop-card mt-4 overflow-hidden">
      <Plate seed="consult-empty" variant="orbit" className="!rounded-none h-32 w-full !shadow-none" />
      <div className="p-5">
        <Kicker>{t('con.empty.title')}</Kicker>
        <p className="mt-3 text-meta t-sub">{t('con.empty.p1')}</p>
        <p className="mt-3 text-meta t-sub">{t('con.empty.p2')}</p>
        {/* The consultant app is a separate deployment — an absolute link,
            not a route this build carries. */}
        <PopButton variant="gold" className="mt-5" href={PRO_APP_URL}>
          {t('con.empty.apply')}
        </PopButton>
        <p className="mt-3 caps-sm t-faint">{t('con.empty.for')}</p>
      </div>
    </div>
  )
}


/** Five stars filled to the rating, a fraction shown as a part star. */
function Stars({ value }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / 5) * 100))
  return (
    <span className="relative inline-block text-[13px] leading-none tracking-[1px]" aria-label={`${value} out of 5`}>
      <span className="text-stroke">★★★★★</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap text-gold" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  )
}
