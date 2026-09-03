import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import {
  Acts,
  Avatar,
  Button,
  Row,
  Ruler,
  Section,
  Segmented,
  Stub,
} from '../components/Primitives.jsx'
import { useStore, useProfileFields } from '../store.jsx'
import { istDate, longDate, readingFrom, useAstro, useMyChart } from '../lib/astro.js'

const TABS = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
]

const OFFSET = { yesterday: -1, today: 0, tomorrow: 1 }
const CONTEXT = { yesterday: 'Looking back.', today: null, tomorrow: 'Looking ahead.' }

/**
 * The daily reading, computed for this person rather than for their sun sign.
 *
 * Three sections the mock had are gone, and they are gone rather than filled:
 * **mood, lucky colour and lucky number**, which nothing computes, and
 * **getting along / harder work**, which is sign-to-sign compatibility the
 * daily endpoint does not return. A lucky number has to come from somewhere,
 * and "we made it up" is not a somewhere this app is willing to have. The link
 * to /people survives, because reading two charts against each other is the
 * real version of what that section was pretending to do.
 *
 * Ratings are the API's 0–100 domain scores, shown as such. The mock's five
 * ticks were a different scale and rounding into it would have thrown away
 * three quarters of the resolution to keep a graphic.
 */
export default function Horoscope() {
  const [key, setKey] = useState('today')
  const { showToast, hasFlag, toggleFlag, session, sessionReady } = useStore()
  const me = useProfileFields()

  // Recomputed only when the tab changes, because it is a `useAstro`
  // dependency — a fresh string every render would refetch every render.
  const date = useMemo(() => istDate(OFFSET[key]), [key])

  const horoscope = useAstro('horoscope', {
    date,
    ready: sessionReady,
    who: session?.user?.id ?? null,
  })

  const day = readingFrom(horoscope.payload, TABS.find((tb) => tb.key === key).label, CONTEXT[key])

  /* The header line comes from the CHART, not from the reading.

     It used to read `horoscope.payload.profile`, which worked only because the
     reading happened to be computed from this person's birth. Two problems with
     that: the line could not appear until the day's reading had loaded, even
     though it is a fact about a birth that never changes; and it would quietly
     become a lie the moment the reading stops being per-person.

     The chart is cached with no expiry, so this now renders immediately and
     stays right. `rising` is already null when the birth time is unknown, so
     there is no second guard here. */
  const mine = useMyChart({ ready: sessionReady, who: session?.user?.id ?? null })
  const sub = [
    mine.rashi && `${mine.rashi} moon`,
    mine.rising && `${mine.rising} rising`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {/* Avatar into Profile on the left, share on the right — the same header
          slots the reference app gives this screen. */}
      <TopBar
        title="Daily horoscope"
        sub={sub}
        left={
          <Link
            to="/profile"
            aria-label="Your profile"
            className="transition-opacity hover:opacity-60"
          >
            <Avatar initials={me.initials} size={28} />
          </Link>
        }
        right={
          <button
            type="button"
            onClick={() => showToast('Reading copied')}
            className="text-label uppercase tracking-label text-t2"
          >
            Share
          </button>
        }
      />

      <Segmented items={TABS} value={key} onChange={setKey} />

      {horoscope.loading && (
        <p className="section text-meta text-t3">Reading the sky for {longDate(date)}.</p>
      )}

      {horoscope.refusal && (
        <div className="section">
          <p className="text-body text-t1">{horoscope.refusal.reason}</p>
          {horoscope.refusal.code === 'no_birth' && (
            <Link to="/profile" className="mt-3 inline-block text-meta text-t2 underline">
              Add them in your profile
            </Link>
          )}
        </div>
      )}

      {day && (
        <>
          {/* ── The reading, immediately ────────────────────────────────────
              The daily horoscope is the product. Burying it under a hero card
              or a greeting is the single most-cited mistake in the reference
              app, so it sits above the fold with nothing competing for the
              position. */}
          <section key={key} className="animate-fade section pt-10">
            <p className="label mb-4">{longDate(day.date)}</p>

            {/* The day's own almanac, directly under its date.
                This is here because it is the only part of the reading that
                CHANGES between the three tabs. Their ruleset builds the
                headline and the scores from the dasha stack and ranked gochar,
                which do not move in three days, so those come back identical
                for yesterday, today and tomorrow — checked field by field, not
                assumed. Leading with the tithi and the nakshatra means
                switching tabs visibly does something true, instead of looking
                like a broken forecast. */}
            {day.panchang && (
              <p className="mb-8 text-center text-micro uppercase tracking-caps text-t3">
                {[day.panchang.tithi, day.panchang.nakshatra, day.panchang.yoga]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}

            {/* Tense marker. Without it, a past-tense reading under a big
                headline reads as a broken forecast rather than a review. */}
            {day.context && (
              <p className="mb-6 text-center text-micro uppercase tracking-caps text-t3">
                {day.context}
              </p>
            )}

            <h1 className="mx-auto max-w-[16ch] text-center text-title font-light">
              {day.headline}
            </h1>
            <Stub className="my-8" />
            <p className="horoscope">{day.body}</p>

            <Acts
              className="mt-8 justify-center"
              items={[
                {
                  label: 'Save',
                  onLabel: 'Saved',
                  on: hasFlag(`save:day-${key}`),
                  onClick: () =>
                    toggleFlag(`save:day-${key}`, {
                      on: 'Saved to your readings',
                      off: 'Removed from your readings',
                    }),
                },
                { label: 'Share', onClick: () => showToast('Reading copied') },
              ]}
            />
          </section>

          {/* ── The one instruction ────────────────────────────────────────
              Everything above is description. This is the only line that asks
              for something, so it gets a section to itself. */}
          {day.focus && (
            <Section label={day.focusLabel}>
              <p className="mx-auto max-w-[20ch] text-center text-lead font-light">{day.focus}</p>
            </Section>
          )}

          {/* ── Day at a glance ─────────────────────────────────────────── */}
          <Section label="Day at a glance">
            <dl className="mx-auto max-w-[18rem]">
              {day.glance.map((g) => (
                <div key={g.key} className="flex items-baseline justify-between gap-6 py-3 rule-b">
                  <dt className="label text-left">{g.key}</dt>
                  <dd className="text-body text-t1">{g.value}</dd>
                </div>
              ))}
            </dl>

            {day.intensity !== null && (
              <div className="mx-auto mt-10 max-w-[18rem]">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="label text-left">Overall</span>
                  <span className="text-body text-t1 tnum">{day.intensity}</span>
                </div>
                <Ruler value={day.intensity} />
                <p className="mt-3 text-meta text-t3">
                  The day's own score, out of a hundred, before you do anything with it.
                </p>
              </div>
            )}
          </Section>

          {/* ── Do / Don't ──────────────────────────────────────────────────
              Labelled, and with a sentence explaining what the two columns
              are. Unlabelled Do/Don't lists are the documented reason new
              users bounce off this section in the reference app. */}
          {(day.do.length > 0 || day.dont.length > 0) && (
            <Section label="Do / Don't">
              <p className="prose-c -mt-3 mb-8">
                Two short lists. The left is worth your energy today. The right will cost more than
                it returns.
              </p>

              <div className="grid grid-cols-2 gap-x-5">
                <div>
                  <p className="label text-left border-b border-rule pb-2">Do</p>
                  <ul className="mt-3">
                    {day.do.map((t) => (
                      <li key={t} className="py-2.5 text-body text-t1">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-l border-rule pl-5">
                  <p className="label text-left border-b border-rule pb-2">Don&apos;t</p>
                  <ul className="mt-3">
                    {day.dont.map((t) => (
                      <li key={t} className="py-2.5 text-body text-t2">
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Section>
          )}

          {/* ── Windows ────────────────────────────────────────────────────
              Abhijit, Rahu kalam, Yamaganda, Gulika. Clock times for the day,
              which is what an almanac is for, and the one part of a reading
              people act on to the minute. */}
          {day.windows.length > 0 && (
            <Section label="Windows">
              <ul>
                {day.windows.map((w) => (
                  <li
                    key={w.key}
                    className="flex items-baseline justify-between gap-4 border-b border-rule py-3.5"
                  >
                    <span className="text-body text-t1">{w.label}</span>
                    <span className="flex-none text-meta text-t2 tnum">
                      {w.start} – {w.end}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-meta text-t3">
                Auspicious first, then the three to work around.
              </p>
            </Section>
          )}

          {/* ── Transits ────────────────────────────────────────────────── */}
          {day.transits.length > 0 && (
            <Section label="Current transits">
              <ul>
                {day.transits.map((t) => (
                  <li key={t.id} className="border-b border-rule pb-6 pt-1 last:border-b-0">
                    <div className="mb-2 flex items-baseline justify-between gap-4">
                      <h3 className="text-lead font-light">{t.title}</h3>
                      <span className="flex-none text-micro uppercase tracking-caps text-t3">
                        {t.weight}
                      </span>
                    </div>
                    <p className="text-body text-t2">{t.body}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ── Power / Pressure ────────────────────────────────────────── */}
          <Section label="Power &amp; pressure">
            <div className="border-b border-rule pb-6">
              <p className="label text-left mb-2">Power</p>
              <p className="text-read text-t1">{day.power}</p>
            </div>
            <div className="pt-6">
              <p className="label text-left mb-2">Pressure</p>
              <p className="text-read text-t2">{day.pressure}</p>
            </div>
          </Section>

          {/* ── Ratings ─────────────────────────────────────────────────── */}
          <Section label="Read across four areas">
            <ul className="mx-auto max-w-[18rem]">
              {Object.entries(day.ratings)
                .filter(([, value]) => value !== null)
                .map(([area, value]) => (
                  <li key={area} className="border-b border-rule py-4">
                    <div className="mb-2 flex items-baseline justify-between gap-5">
                      <span className="label text-left">{area}</span>
                      <span className="text-meta text-t3 tnum">{value}/100</span>
                    </div>
                    <Ruler value={value} />
                  </li>
                ))}
            </ul>
          </Section>

          {/* ── The long readings ───────────────────────────────────────── */}
          {day.sections.length > 0 && (
            <Section label="At length">
              <ul>
                {day.sections.map((s) => (
                  <li key={s.key} className="border-b border-rule pb-6 pt-1 last:border-b-0">
                    <div className="mb-2 flex items-baseline justify-between gap-4">
                      <h3 className="text-lead font-light">{s.title}</h3>
                      <span className="flex-none text-micro uppercase tracking-caps text-t3 tnum">
                        {s.score}
                      </span>
                    </div>
                    <p className="text-body text-t2">{s.summary}</p>
                    {s.advice && <p className="mt-3 text-body text-t1">{s.advice}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ── Reflection ──────────────────────────────────────────────── */}
          {day.reflections.length > 0 && (
            <Section label="Sit with this">
              {day.reflections.map((r, i) => (
                <div key={r}>
                  {i > 0 && <Stub className="my-7" />}
                  <p className="horoscope">{r}</p>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      <Section label="Go deeper" last>
        <Row to="/ask" title="Ask the Stars" note="Put a real question to your chart" />
        <Row to="/chart" title="Your full chart" note="Nine placements, plainly written" />
        <Row to="/people" title="Your people" note="Read their chart against yours" />
        <Row to="/shop" title="Shop" note="Stones and remedies, honestly described" />
        <Row to="/premium" title="Premium" note="Reports, Eros, unlimited questions" />

        {/* The cross-sell. A daily reading is still a reading of one chart by a
            ruleset; this is the one place it is worth saying so out loud. */}
        <Stub className="my-10" />
        <p className="prose-c">
          This is your chart read by a ruleset. If you want it read by a person, that takes a
          person.
        </p>
        <Button to="/consult" variant="solid" className="mt-8">
          Book fifteen minutes
        </Button>
        <Button to="/home" variant="quiet" className="mt-3">
          Read something longer
        </Button>
      </Section>

      <div className="h-8" />
    </>
  )
}
