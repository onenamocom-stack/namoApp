import { useState } from 'react'
import { Link } from 'react-router-dom'
import { days } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import {
  Acts,
  Avatar,
  Button,
  Label,
  Row,
  Ruler,
  Section,
  Segmented,
  Stub,
  Ticks,
} from '../components/Primitives.jsx'
import { useStore, useProfileFields } from '../store.jsx'

const TABS = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
]

export default function Horoscope() {
  const [key, setKey] = useState('today')
  const { showToast, hasFlag, toggleFlag } = useStore()
  const me = useProfileFields()
  const day = days[key]

  return (
    <>
      {/* Avatar into Profile on the left, share on the right — the same header
          slots the reference app gives this screen. */}
      <TopBar
        title="Daily horoscope"
        sub={`${me.sunSign} · ${me.moonSign} · ${me.risingSign}`}
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

      {/* ── The reading, immediately ──────────────────────────────────────
          The daily horoscope is the product. Burying it under a hero card or
          a greeting is the single most-cited mistake in the reference app, so
          it sits above the fold with nothing competing for the position. */}
      <section key={key} className="animate-fade section pt-10">
        <p className="label mb-8">{day.date}</p>

        {/* Tense marker. Without it, a past-tense reading under a big
            headline reads as a broken forecast rather than a review. */}
        {day.context && (
          <p className="mb-6 text-center text-micro uppercase tracking-caps text-t3">
            {day.context}
          </p>
        )}

        <h1 className="mx-auto max-w-[16ch] text-center text-title font-light">{day.headline}</h1>
        <Stub className="my-8" />
        <p className="horoscope">{day.body}</p>

        {/* Mood / colour / number — the three throwaway values people
            actually screenshot. Set as a specimen line, not as badges. */}
        <dl className="mx-auto mt-10 grid max-w-[18rem] grid-cols-3 border-y border-rule">
          {[
            ['Mood', day.mood],
            ['Colour', day.luckyColour],
            ['Number', day.luckyNumber],
          ].map(([k, v], i) => (
            <div key={k} className={`py-4 text-center ${i > 0 ? 'border-l border-rule' : ''}`}>
              <dt className="text-micro uppercase tracking-caps text-t3">{k}</dt>
              <dd className="mt-1.5 text-meta text-t1 tnum">{v}</dd>
            </div>
          ))}
        </dl>

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

      {/* ── The one instruction ──────────────────────────────────────────
          Everything above is description. This is the only line that asks
          for something, so it gets a section to itself. */}
      <Section label={day.focusLabel}>
        <p className="mx-auto max-w-[20ch] text-center text-lead font-light">{day.focus}</p>
      </Section>

      {/* ── Day at a glance ─────────────────────────────────────────────── */}
      <Section label="Day at a glance">
        <dl className="mx-auto max-w-[18rem]">
          {day.glance.map((g) => (
            <div key={g.key} className="flex items-baseline justify-between gap-6 py-3 rule-b">
              <dt className="label text-left">{g.key}</dt>
              <dd className="text-body text-t1">{g.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mx-auto mt-10 max-w-[18rem]">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="label text-left">Intensity</span>
            <span className="text-body text-t1 tnum">{day.intensity}</span>
          </div>
          <Ruler value={day.intensity} />
          <p className="mt-3 text-meta text-t3">
            How much the sky is asking of you, relative to your own average.
          </p>
        </div>
      </Section>

      {/* ── Do / Don't ──────────────────────────────────────────────────────
          Labelled, and with a sentence explaining what the two columns are.
          Unlabelled Do/Don't lists are the documented reason new users bounce
          off this section in the reference app. */}
      <Section label="Do / Don't">
        <p className="prose-c -mt-3 mb-8">
          Two short lists. The left is worth your energy today. The right will cost more than it
          returns.
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

      {/* ── Getting along with ──────────────────────────────────────────── */}
      <Section label="Getting along with">
        <ul>
          {day.gettingAlong.map((g) => (
            <li key={g.sign} className="flex items-baseline gap-4 border-b border-rule py-3.5">
              <span className="w-24 flex-none text-body text-t1">{g.sign}</span>
              <span className="text-meta text-t2">{g.note}</span>
            </li>
          ))}
        </ul>

        <Label align="left" className="mt-8 mb-1">
          Harder work
        </Label>
        <ul>
          {day.friction.map((g) => (
            <li key={g.sign} className="flex items-baseline gap-4 border-b border-rule py-3.5">
              <span className="w-24 flex-none text-body text-t2">{g.sign}</span>
              <span className="text-meta text-t3">{g.note}</span>
            </li>
          ))}
        </ul>

        <Row to="/people" title="Your people" note="Read the whole chart against theirs" className="mt-6" />
      </Section>

      {/* ── Transits ────────────────────────────────────────────────────── */}
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
              <p className="mb-3 text-micro uppercase tracking-caps text-t3 tnum">{t.window}</p>
              <p className="text-body text-t2">{t.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Power / Pressure ────────────────────────────────────────────── */}
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

      {/* ── Ratings ─────────────────────────────────────────────────────── */}
      <Section label="Read across four areas">
        <ul className="mx-auto max-w-[18rem]">
          {Object.entries(day.ratings).map(([area, value]) => (
            <li key={area} className="flex items-center gap-5 border-b border-rule py-4">
              <span className="w-16 flex-none label text-left">{area}</span>
              <Ticks value={value} className="flex-1" />
              <span className="w-8 flex-none text-right text-meta text-t3 tnum">{value}/5</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Reflection ──────────────────────────────────────────────────── */}
      <Section label="Sit with this">
        {day.reflections.map((r, i) => (
          <div key={r}>
            {i > 0 && <Stub className="my-7" />}
            <p className="horoscope">{r}</p>
          </div>
        ))}
      </Section>

      <Section label="Go deeper" last>
        <Row to="/ask" title="Ask the Stars" note="Put a real question to your chart" />
        <Row to="/chart" title="Your full chart" note="Eight placements, plainly written" />
        <Row to="/people" title="Your people" note="Read their chart against yours" />
        <Row to="/shop" title="Shop" note="Stones and remedies, honestly described" />
        <Row to="/premium" title="Premium" note="Reports, Eros, unlimited questions" />

        {/* The cross-sell. A daily reading is a general forecast; this is the
            one place it is worth saying so out loud. */}
        <Stub className="my-10" />
        <p className="prose-c">
          This is written for everyone with your placements. If you want it read against your whole
          chart, that takes a person.
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
