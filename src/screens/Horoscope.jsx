import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Kicker, PopCard } from '../components/Pop.jsx'
import {
  Acts,
  Button,
  Row,
  Section,
  Segmented,
  Stub,
} from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'
import { istDate, longDate, panchangFrom, readingFrom, useAstro, useMyChart } from '../lib/astro.js'

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

  // Recomputed only when the tab changes, because it is a `useAstro`
  // dependency — a fresh string every render would refetch every render.
  const date = useMemo(() => istDate(OFFSET[key]), [key])

  const horoscope = useAstro('horoscope', {
    date,
    ready: sessionReady,
    who: session?.user?.id ?? null,
  })

  const day = readingFrom(horoscope.payload, TABS.find((tb) => tb.key === key).label, CONTEXT[key])

  /* The almanac comes from the SHARED panchang, not from the reading.
     The reading carries its own, computed at this person's birth place, while
     the home screen shows the one computed at Ujjain for everybody. Two tithis
     for one day is the disagreement phase 7 set out to end, so there is one
     source and this is it. Costs nothing extra: one row a day for the whole
     user base, and the client caches it for the day on top. */
  const almanac = useAstro('panchang', { date, ready: sessionReady })
  const sky = panchangFrom(almanac.payload)

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
      {/* Back, as of 10 Sep 2026. This screen had none — the left slot was an
          avatar into Profile, which is a fine shortcut and a bad answer to
          "how do I get out of here". It is reached from Consult's Horoscope
          tile now, which used to open a slide-over, so the way back matters
          more than the shortcut did. */}
      <TopBar
        title="Daily horoscope"
        sub={sub}
        back
        backTo="/consult"
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

      {/* The two blocks that used to be Profile's Horoscope tab, which is the
          shape people asked for back: today in one card, then the three
          placements that are actually theirs. Everything below the switcher —
          yesterday and tomorrow, the panchang, the timing windows — is what
          this page has that the tab never did, and it stays. */}
      {!horoscope.loading && !horoscope.refusal && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Today</Kicker>
          <PopCard raised className="mt-4 p-5">
            <p className="caps-sm gold">{longDate(readingFrom(horoscope.payload, 'today', null).date)}</p>
            <p className="mt-3 text-read t-sub">
              {readingFrom(horoscope.payload, 'today', null).dayMood}
            </p>
          </PopCard>

          <Kicker action="Full chart" to="/chart" className="mt-8">
            Your placements
          </Kicker>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ['Sun', mine.sun, 'how you push'],
              ['Moon', mine.moon, 'how you feel'],
              /* Null without a birth time, and named as the reason rather than
                 filled in from a noon the person never gave us. */
              ['Rising', mine.rising, mine.rising ? 'how you land' : 'needs your birth time'],
            ].map(([label, sign, note]) => (
              <PopCard key={label} className="p-3">
                <p className="caps-sm gold">{label}</p>
                <p className="mt-2 text-body t-heading">{sign ?? '—'}</p>
                <p className="mt-1 caps-sm t-faint">{note}</p>
              </PopCard>
            ))}
          </div>
        </section>
      )}

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
            {sky && (
              <p className="mb-8 text-center text-micro uppercase tracking-caps text-t3">
                {[sky.tithi, sky.nakshatra, sky.yoga].filter(Boolean).join(' · ')}
                {almanac.city && <span className="text-t4"> · {almanac.city}</span>}
              </p>
            )}

            {/* Tense marker. Without it, a past-tense reading under a big
                headline reads as a broken forecast rather than a review. */}
            {/* NO RASHI LABEL HERE ANY MORE, 9 Sep. The tense marker stays —
                a past-tense reading under a big headline reads as a broken
                forecast rather than a review — but the sign is gone, because
                what is left of this reading is identical across all twelve of
                them. */}
            {day.context && (
              <p className="mb-6 text-center text-micro uppercase tracking-caps text-t3">
                {day.context}
              </p>
            )}

            {/* THE HEADLINE AND THE LONG READING ARE GONE, 9 Sep, and so are
                the instruction, the glance row, the 0-100 score, the Do/Don't
                lists, the transits, power and pressure, the four ratings, the
                long sections and the reflection. Every one of them was computed
                from the canonical birth behind this rashi rather than from the
                reader — the scores are weighted by that invented person's
                dasha, and the only transits the payload carries are alignments
                to it. They describe nobody.

                What is left is the day, read at Ujjain, which is the same day
                for everyone and true for all of them. Saying so on the screen
                is the point: a thin screen that explains itself is honest, and
                a full one that cannot is what this replaced. */}
            <p className="horoscope">{day.dayMood}</p>
            <Stub className="my-8" />
            <p className="mx-auto max-w-[32ch] text-center text-meta text-t3">
              This is the day itself, read at Ujjain, and it is the same for everyone — the
              twelve signs return identical windows, checked. Anything that turns on your own
              birth — your placements, your periods — is on your chart.
            </p>
            <div className="mt-5 text-center">
              <Link to="/chart" className="text-meta text-t2 underline">
                Your chart
              </Link>
            </div>

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
