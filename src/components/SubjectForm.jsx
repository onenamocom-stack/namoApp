import { useEffect, useState } from 'react'
import { callAstro } from '../lib/astro.js'

/**
 * Three questions about somebody else, asked inside the conversation.
 *
 * Not a screen and not a route: a seeker who wants to know about their
 * mother is mid-thought, and sending them to an onboarding flow loses the
 * thought. It is three fields because three is what a chart needs — a
 * fourth would be curiosity, and this is data about a person who is not
 * here to be asked.
 *
 * ── NO MODEL CALL HAPPENS HERE ──────────────────────────────────────────────
 * This is a form. The tokens are spent on the question that follows it, not
 * on collecting the details, which is why the quota is untouched until
 * something is actually asked.
 *
 * ── AND NOTHING IS SAVED ────────────────────────────────────────────────────
 * What this returns lives in the conversation's state and nowhere else. The
 * server computes a chart from it and writes none of it down (21 Sep
 * decision; docs/01-PRD.md §4.4). Reopen the app and it is gone — which is
 * the cost of not holding a third party's birth record, and worth saying on
 * screen rather than letting people discover.
 */
export default function SubjectForm({ onDone, onCancel }) {
  const [form, setForm] = useState({
    name: '', date: '', time: '', timeKnown: true, place: null,
  })
  const [placeQuery, setPlaceQuery] = useState('')
  const [hits, setHits] = useState([])
  const [searching, setSearching] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  /* Debounced, because every keystroke is an upstream geo call and the
     provider's quota is money — the same reason AskPlace debounces. */
  useEffect(() => {
    const q = placeQuery.trim()
    if (q.length < 3 || form.place) return setHits([])
    setSearching(true)
    const id = setTimeout(() => {
      callAstro('geo', { q })
        .then((res) => setHits((res?.data ?? res ?? []).slice(0, 5)))
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(id)
  }, [placeQuery, form.place])

  const valid =
    form.name.trim() &&
    /^\d{2}\/\d{2}\/\d{4}$/.test(form.date) &&
    form.place &&
    (!form.timeKnown || /^\d{2}:\d{2}$/.test(form.time))

  const submit = () => {
    if (!valid) return
    const [d, m, y] = form.date.split('/')
    onDone({
      name: form.name.trim(),
      birth_date: `${y}-${m}-${d}`,
      birth_time: form.timeKnown ? `${form.time}:00` : null,
      birth_time_known: form.timeKnown,
      birth_place: form.place.label ?? form.place.name,
      birth_lat: form.place.lat,
      birth_lon: form.place.lon ?? form.place.lng,
      birth_zone: form.place.zone ?? form.place.timezone ?? 'Asia/Kolkata',
    })
  }

  return (
    <div className="pop-card space-y-3 p-4">
      <p className="caps t-heading">Whose chart?</p>

      <Field label="Their name">
        <input
          value={form.name}
          onChange={set('name')}
          placeholder="Amma"
          className="field-line"
        />
      </Field>

      <Field label="Date of birth">
        <input
          value={form.date}
          onChange={set('date')}
          placeholder="DD/MM/YYYY"
          inputMode="numeric"
          className="field-line"
        />
      </Field>

      <Field label="Time of birth">
        <input
          value={form.time}
          onChange={set('time')}
          placeholder="HH:MM"
          inputMode="numeric"
          disabled={!form.timeKnown}
          className="field-line disabled:opacity-40"
        />
        {/* The houses are unreliable without a time and the answer says so.
            Offering "not known" beats a guessed time that looks certain. */}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, timeKnown: !f.timeKnown, time: '' }))}
          className="mt-1.5 text-micro uppercase tracking-caps text-t3 underline"
        >
          {form.timeKnown ? 'Nobody knows the time' : 'I know the time'}
        </button>
      </Field>

      <Field label="Place of birth">
        {form.place ? (
          <button
            type="button"
            onClick={() => { setForm((f) => ({ ...f, place: null })); setPlaceQuery('') }}
            className="field-line w-full text-left"
          >
            {form.place.label ?? form.place.name} ·{' '}
            <span className="t-faint">change</span>
          </button>
        ) : (
          <>
            <input
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder="City of birth"
              className="field-line"
            />
            {searching && <p className="mt-1.5 caps-sm t-faint">Searching</p>}
            {hits.map((h) => (
              <button
                key={`${h.lat}${h.lon ?? h.lng}`}
                type="button"
                onClick={() => setForm((f) => ({ ...f, place: h }))}
                className="act-row !py-2.5"
              >
                <span className="text-meta t-body">{h.label ?? h.name}</span>
              </button>
            ))}
          </>
        )}
      </Field>

      <p className="text-micro t-faint">
        Used for this conversation and not saved. They did not sign up here, so we do not
        keep their details — ask again next time and it takes a moment.
      </p>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          className="pop-btn flex-1 caps-sm disabled:opacity-40"
        >
          Read their chart
        </button>
        <button type="button" onClick={onCancel} className="pill caps-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-micro uppercase tracking-caps text-t3">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
