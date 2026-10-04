import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import Paywall from '../components/Paywall.jsx'
import PlaceField, { placeLabel } from '../components/PlaceField.jsx'
import Icon from '../components/Icon.jsx'
import { PopButton, PopCard } from '../components/Pop.jsx'
import { Section, Segmented, Stub } from '../components/Primitives.jsx'
import { findMuhurat, istDate, longDate, muhuratFrom } from '../lib/astro.js'
import { useStore } from '../store.jsx'

/**
 * When to start something — the vendor's six purposes, a month at a time.
 *
 * **A muhurat is a function of a place**, because it is built out of
 * sunrise, and sunrise moves about two hours across India. The place is
 * prefilled from the birth row because that is the only place this app
 * knows, and it is NAMED on the screen and one tap to change: where you
 * were born is rarely where you are buying a car.
 *
 * **A whole month is asked for at once**, which is what makes this cheap:
 * everyone in the same 11 km cell shares one upstream call a month. Windows
 * that have already passed are dropped here rather than upstream, so the
 * answer does not change key every day.
 *
 * **An empty month is a real answer, not a failure.** Griha pravesh returns
 * nothing through Chaturmas, and saying so is the correct screen.
 */
/* `label` and `note` are i18n keys. */
const PURPOSES = [
  { key: 'general_work', label: 'mu.p.general', note: 'mu.p.generalNote', icon: 'calendar' },
  { key: 'vehicle_purchase', label: 'mu.p.vehicle', note: 'mu.p.vehicleNote', icon: 'car' },
  { key: 'property_purchase', label: 'mu.p.property', note: 'mu.p.propertyNote', icon: 'home' },
  { key: 'griha_pravesh', label: 'mu.p.griha', note: 'mu.p.grihaNote', icon: 'key' },
  { key: 'namkaran', label: 'mu.p.naming', note: 'mu.p.namingNote', icon: 'baby' },
  { key: 'mundan', label: 'mu.p.mundan', note: 'mu.p.mundanNote', icon: 'scissors' },
]

/**
 * Judged against the reader's zodiac, only the best QUARTER of the month's
 * windows is shown (5 Oct 2026, the owner's call — "fewer, and accurate").
 * Ranked by the vendor's own score for this chart, at least one kept, then
 * put back in date order so the list still reads as a calendar.
 */
function bestQuarter(windows) {
  if (windows.length <= 1) return windows
  const keep = Math.max(1, Math.ceil(windows.length / 4))
  return [...windows]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, keep)
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
}

/** This month and the next two, as the API clamps them. Named in the
 *  reader's language; the key is the same either way. */
function months(lang = 'en') {
  const today = istDate()
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  return Array.from({ length: 3 }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 + i, 1))
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-GB', {
        month: 'long',
        timeZone: 'UTC',
      }),
    }
  })
}

export default function Muhurat() {
  const { profile, session, sessionReady, t, lang } = useStore()
  const monthTabs = useMemo(() => months(lang), [lang])

  const [purpose, setPurpose] = useState('general_work')
  const [month, setMonth] = useState(monthTabs[0].key)
  const [place, setPlace] = useState(null)
  const [changingPlace, setChangingPlace] = useState(false)
  const [mine, setMine] = useState(false)
  // Bumped after a purchase, so the refused personal search runs again.
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ loading: true, result: null, refusal: null })

  /* The birth place is the starting point, not the answer: it is the one
     place on file. Named on screen, changed in one tap. */
  useEffect(() => {
    if (place || !profile?.birth_lat) return
    setPlace({
      label: profile.birth_place,
      name: profile.birth_place,
      lat: Number(profile.birth_lat),
      lng: Number(profile.birth_lon),
      timezone: profile.birth_zone || 'Asia/Kolkata',
    })
  }, [profile, place])

  const hasBirth = Boolean(profile?.birth_date && profile?.birth_lat)

  useEffect(() => {
    if (!sessionReady || !place) return undefined
    let live = true
    setState((s) => ({ ...s, loading: true }))
    findMuhurat({ purpose, month, place, mine }).then((res) => {
      if (!live) return
      setState(
        res.ok
          ? (() => {
              const shaped = muhuratFrom(res.data)
              return {
                loading: false,
                result: mine ? { ...shaped, windows: bestQuarter(shaped.windows) } : shaped,
                refusal: null,
              }
            })()
          : { loading: false, result: null, refusal: res },
      )
    })
    return () => { live = false }
  }, [purpose, month, place, mine, sessionReady, session?.user?.id, attempt])

  const found = PURPOSES.find((p) => p.key === purpose)
  const chosen = { ...found, label: t(found.label), note: t(found.note) }
  const result = state.result
  /* ₹49 a purpose a month since 30 Sep 2026. The server refuses with the
     price until it is bought; the shared windows stay free. */
  const locked = state.refusal?.code === 'needs_purchase'

  return (
    <>
      <TopBar title={t('tool.muhurat')} sub={chosen.note} back backTo="/consult" />

      {/* Circle tiles, not pills (5 Oct 2026) — the same row as Consult's tools
          and Bhakti's shelves. It scrolls: six tiles are wider than a phone. */}
      <Section label={t('mu.whatFor')} tight>
        <ul className="no-scrollbar -mx-2 flex gap-1 overflow-x-auto px-1">
          {PURPOSES.map((p) => (
            <li key={p.key} className="flex-none">
              <button
                type="button"
                onClick={() => setPurpose(p.key)}
                className="tile w-[72px]"
                aria-pressed={purpose === p.key}
              >
                <span className={`tile-face ${purpose === p.key ? 'tile-face-on' : ''}`}>
                  <Icon name={p.icon} size={22} />
                </span>
                <span className="text-center text-[12px] font-semibold leading-tight t-body">
                  {t(p.label)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Segmented items={monthTabs} value={month} onChange={setMonth} />

      <Section label={t('mu.where')} tight>
        {changingPlace || !place ? (
          <PlaceField
            place={null}
            onPick={(picked) => { if (picked) { setPlace(picked); setChangingPlace(false) } }}
            placeholder={t('mu.city')}
          />
        ) : (
          <div className="flex items-baseline justify-between gap-4">
            <p className="min-w-0 text-body text-t1">{placeLabel(place)}</p>
            <button
              type="button"
              onClick={() => setChangingPlace(true)}
              className="flex-none caps-sm text-t2 underline"
            >
              {t('mu.change')}
            </button>
          </div>
        )}
        <p className="mt-3 text-meta text-t3">
          {t('mu.sunriseNote')}
        </p>

      </Section>

      {state.loading && (
        <p className="section text-meta text-t3">
          {t('mu.loading', { label: chosen.label.toLowerCase() })}
        </p>
      )}

      {locked && (
        <section className="section">
          <Paywall
            title={t('mu.payTitle', { label: chosen.label })}
            note={t('mu.payNote', { month: monthTabs.find((m) => m.key === month).label })}
            sku="muhurat"
            refKey={`${purpose}:${month}`}
            pricePaise={state.refusal.pricePaise}
            onBought={() => setAttempt((a) => a + 1)}
          />
          <button
            type="button"
            onClick={() => setMine(false)}
            className="mx-auto mt-5 block text-meta text-t2 underline"
          >
            {t('mu.without')}
          </button>
        </section>
      )}

      {state.refusal && !locked && (
        <div className="section">
          <p className="text-body text-t1">{state.refusal.reason}</p>
          {state.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              {t('a.addBirth')}
            </Link>
          )}
        </div>
      )}

      {result && !state.loading && (
        <>
          {/* The personal search often promotes no single moment and says
              why. That sentence IS the answer when it happens. */}
          {mine && result.verdict && (
            <section className="section">
              {result.moment ? (
                <PopCard raised className="p-5">
                  <p className="caps-sm gold">{t('mu.best')}</p>
                  <p className="mt-3 text-title font-semibold tnum">{result.moment.time}</p>
                  <p className="mt-1 text-body t-sub">{longDate(result.moment.date)}</p>
                  <Stub className="my-5" />
                  <p className="text-read t-sub">{result.moment.line}</p>
                </PopCard>
              ) : (
                <p className="prose-c">{result.verdict}</p>
              )}
            </section>
          )}

          {result.windows.length === 0 ? (
            <Section label={t('mu.nothing')} last>
              <p className="prose-c">
                {t('mu.nothingNote', {
                  label: chosen.label.toLowerCase(),
                  month: monthTabs.find((m) => m.key === month).label,
                })}
              </p>
            </Section>
          ) : (
            <Section label={mine ? t('mu.bestForYou', { n: result.windows.length }) : t('mu.windows')}>
              <ul>
                {result.windows.map((w) => (
                  <li key={w.id} className="border-b border-rule py-5 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-body text-t1">{longDate(w.date)}</span>
                      <span className="flex-none text-meta text-t2 tnum">
                        {w.start} – {w.end}
                        {w.overnight && <span className="text-t4"> +1d</span>}
                      </span>
                    </div>
                    {w.hours !== null && (
                      <p className="mt-1 caps-sm t-faint tnum">
                        {t('mu.hours', { n: w.hours })}
                        {w.hours >= 23 && ` · ${t('mu.sunToSun')}`}
                      </p>
                    )}
                    {w.reasons.length > 0 && (
                      <p className="mt-2 caps-sm t-faint">{w.reasons.join(' · ')}</p>
                    )}
                    {w.warnings.map((warning) => (
                      <p key={warning} className="mt-2 text-meta text-t3">{warning}</p>
                    ))}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-meta text-t3">
                {t('mu.localTimes', { place: placeLabel(place) })}
              </p>
            </Section>
          )}
        </>
      )}

      {/* Where "Before you act on this" was (5 Oct 2026). Only offered when
          there is a chart to judge against — a button that refuses on tap
          is worse than none. ₹49 per purpose per month, asked by the
          server on the first tap (the Paywall above). */}
      {hasBirth && !locked && !state.loading && (
        <section className="section">
          <PopCard raised className="p-5 text-center">
            <p className="caps t-heading">{t(mine ? 'mu.judged' : 'mu.judge')}</p>
            <p className="mt-2 text-meta t-body">{t('mu.judgeNote', { label: chosen.label.toLowerCase() })}</p>
            <PopButton
              variant={mine ? 'default' : 'gold'}
              className="mt-5"
              onClick={() => {
                setMine((v) => !v)
                document.querySelector('main')?.scrollTo({ top: 0 })
              }}
            >
              {t(mine ? 'mu.showAll' : 'mu.judge')}
            </PopButton>
          </PopCard>
        </section>
      )}

      <div className="h-8" />
    </>
  )
}
