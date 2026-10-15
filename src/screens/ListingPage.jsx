import { useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import Icon from '../components/Icon.jsx'
import { MarketPrice } from '../components/MarketCard.jsx'
import Plate from '../components/Plate.jsx'
import { PopButton } from '../components/Pop.jsx'
import VerifiedMark from '../components/VerifiedMark.jsx'
import { useStore } from '../store.jsx'

/**
 * A course's and an event's own pages (15 Oct 2026, Rahul: "show product
 * page for events and courses also"). Designed ahead of the listings: no
 * table holds a course or an event yet (docs/06 Phase 17), so nothing in
 * the app links here. `/shop/preview/course` and `/shop/preview/event`
 * render them with the sample below in a development build only — a
 * production build never carries the route or the sample.
 *
 * A course sells hours of teaching: what you will learn, the lessons (the
 * first a free preview), who teaches it. An event sells a seat at a time:
 * when, how long, where (online — the link comes after booking), how many
 * seats are left, the agenda, who hosts it.
 */

function Facts({ items }) {
  return (
    <ul className="mt-4 grid grid-cols-3 divide-x divide-rule rounded-2xl border border-rule text-center">
      {items.map(([icon, head, note]) => (
        <li key={head} className="flex flex-col items-center gap-0.5 px-2 py-3">
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

function Seller({ who, t }) {
  return (
    <section className="px-5 pt-7">
      <h2 className="caps-sm t-faint">{t('ls.about')}</h2>
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-rule p-4">
        <Plate seed={who.name} variant="contour" className="h-12 w-12 flex-none rounded-full" />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-meta font-semibold t-heading">
            {who.name} {who.verified && <VerifiedMark size={15} />}
          </p>
          <p className="text-micro t-faint">{who.line}</p>
          <p className="mt-2 text-meta t-body">{who.bio}</p>
        </div>
      </div>
    </section>
  )
}

function Head({ l, kindLabel, t }) {
  return (
    <section className="px-5 pt-5">
      <span className="pill caps-sm">{kindLabel}</span>
      <h1 className="mt-3 text-title t-heading">{l.title}</h1>
      <p className="mt-1 flex items-center gap-1 text-meta t-faint">
        {t('dl.by', { name: l.seller.name })} {l.seller.verified && <VerifiedMark size={14} />}
      </p>
      <div className="mt-3 text-lead">
        <MarketPrice price={l.price} mrp={l.mrp} free={t('ac.free')} />
      </div>
    </section>
  )
}

function Foot({ price, action, note }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[420px] items-center gap-3 border-t border-rule bg-bg px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]">
      <span className="flex-1">
        <span className="block text-lead font-semibold t-heading tnum">{price}</span>
        {note && <span className="block text-micro t-faint">{note}</span>}
      </span>
      <PopButton variant="gold" full={false} className="px-6">
        {action}
      </PopButton>
    </div>
  )
}

export function CoursePage({ course: c }) {
  const { t } = useStore()
  return (
    <>
      <TopBar title={t('ac.tab.courses')} back backTo="/shop?cat=courses" />
      <div className="relative">
        <Plate seed={c.title} variant="contour" className="aspect-video w-full" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg">
            <Icon name="play" size={24} />
          </span>
        </span>
        <span className="caps-sm absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-white">{t('ls.c.trailer')}</span>
      </div>

      <Head l={c} kindLabel={t('ls.c.kind')} t={t} />
      <section className="px-5">
        <Facts
          items={[
            ['play', t('ls.c.lessons', { n: c.lessons.length }), t('ls.c.hours', { n: c.hours })],
            ['chat', c.language, t('ls.c.lang')],
            ['infinity', t('ls.c.yours'), t('ls.c.yoursNote')],
          ]}
        />
      </section>

      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('ls.c.learn')}</h2>
        <ul className="mt-3 space-y-2">
          {c.learn.map((x) => (
            <li key={x} className="flex items-start gap-2 text-meta t-body">
              <span className="mt-0.5 flex-none text-ok">
                <Icon name="check" size={16} />
              </span>
              {x}
            </li>
          ))}
        </ul>
      </section>

      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('ls.c.content')}</h2>
        <ol className="mt-3 divide-y divide-rule rounded-2xl border border-rule">
          {c.lessons.map(([name, mins], i) => (
            <li key={name} className="flex items-center gap-3 px-4 py-3">
              <span className="w-5 flex-none text-micro t-faint tnum">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-meta t-heading">{name}</span>
              {i === 0 ? (
                <span className="caps-sm gold">{t('ls.c.preview')}</span>
              ) : (
                <span className="text-micro t-faint tnum">{t('ls.c.mins', { n: mins })}</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <Seller who={c.seller} t={t} />
      <div className="h-28" />
      <Foot price={`₹${c.price.toLocaleString('en-IN')}`} action={t('ls.c.enroll')} note={t('ls.c.footNote')} />
    </>
  )
}

export function EventPage({ event: e }) {
  const { t } = useStore()
  return (
    <>
      <TopBar title={t('ac.tab.events')} back backTo="/shop?cat=events" />
      <div className="relative">
        <Plate seed={e.title} variant="contour" className="aspect-[16/9] w-full" />
        {/* The date as a calendar leaf over the banner. */}
        <span className="absolute left-4 top-4 flex w-14 flex-col items-center overflow-hidden rounded-xl bg-white text-center shadow-lg">
          <span className="w-full bg-live py-0.5 caps-sm text-white">{e.month}</span>
          <span className="py-1 text-title font-semibold leading-none t-heading tnum">{e.day}</span>
        </span>
        <span className="caps-sm absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-white">
          <span className="h-2 w-2 rounded-full bg-ok" /> {t('ls.e.online')}
        </span>
      </div>

      <Head l={e} kindLabel={t('ls.e.kind')} t={t} />
      <section className="px-5">
        <Facts
          items={[
            ['calendar', e.when, e.time],
            ['video', t('ls.e.online'), t('ls.e.linkNote')],
            ['groups', t('ls.e.left', { n: e.seatsLeft }), t('ls.e.of', { n: e.seats })],
          ]}
        />
        {e.seatsLeft <= 10 && <p className="mt-3 caps-sm text-live">{t('ls.e.filling', { n: e.seatsLeft })}</p>}
      </section>

      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('ls.e.agenda')}</h2>
        <ol className="mt-3 border-l-2 border-gold-fill/40 pl-4">
          {e.agenda.map(([at, what]) => (
            <li key={at} className="relative pb-4 last:pb-0">
              <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-bg bg-gold-fill" />
              <span className="block text-micro t-faint tnum">{at}</span>
              <span className="block text-meta t-heading">{what}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-5 pt-7">
        <h2 className="caps-sm t-faint">{t('ls.e.how')}</h2>
        <ul className="mt-3 space-y-2">
          {[t('ls.e.how1'), t('ls.e.how2'), t('ls.e.how3')].map((x) => (
            <li key={x} className="flex items-start gap-2 text-meta t-body">
              <span className="mt-0.5 flex-none text-ok">
                <Icon name="check" size={16} />
              </span>
              {x}
            </li>
          ))}
        </ul>
      </section>

      <Seller who={e.seller} t={t} />
      <div className="h-28" />
      <Foot price={`₹${e.price.toLocaleString('en-IN')}`} action={t('ls.e.book')} note={t('ls.e.left', { n: e.seatsLeft })} />
    </>
  )
}

/* The design's sample: invented, and only ever rendered by the
   development-only preview route. */
const SAMPLE_SELLER = {
  name: 'Acharya Raghav Shastri',
  verified: true,
  line: 'Vedic astrologer · 18 years',
  bio: 'Teaches Parashari jyotish in plain Hindi and English. Has read over 20,000 charts.',
}
const SAMPLE = {
  course: {
    title: 'Read Your Own Kundli in 7 Days',
    price: 1499,
    mrp: 2999,
    hours: 6,
    language: 'Hindi',
    seller: SAMPLE_SELLER,
    learn: [
      'Find your lagna, Moon sign and nakshatra',
      'Read the twelve houses and what rules each',
      'Judge a planet: strong, weak, friendly or not',
      'Read your current dasha and what it brings',
    ],
    lessons: [
      ['What a kundli is, and what it is not', 8],
      ['The twelve houses', 42],
      ['The nine planets', 55],
      ['Signs and their lords', 38],
      ['Nakshatras', 47],
      ['Dashas: timing in a chart', 61],
      ['Putting it together: one chart, start to end', 70],
    ],
  },
  event: {
    title: 'Sharad Purnima Lakshmi Sadhana — Live',
    price: 299,
    mrp: 499,
    month: 'OCT',
    day: '17',
    when: 'Fri, 17 Oct',
    time: '7:00 – 8:30 pm',
    seats: 200,
    seatsLeft: 8,
    seller: SAMPLE_SELLER,
    agenda: [
      ['7:00 pm', 'Sankalp and the meaning of Sharad Purnima'],
      ['7:15 pm', 'Lakshmi puja, step by step, together'],
      ['7:50 pm', 'Shri Suktam chanting'],
      ['8:15 pm', 'Your questions, answered live'],
    ],
  },
}

export function ListingPreview() {
  const { kind } = useParams()
  return kind === 'event' ? <EventPage event={SAMPLE.event} /> : <CoursePage course={SAMPLE.course} />
}
