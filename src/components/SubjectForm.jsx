import { useState } from 'react'
import PlaceField, { placeLabel } from './PlaceField.jsx'
import { DateField, TimeField, isValidDate, isValidTime, to24 } from './BirthInputs.jsx'

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
export default function SubjectForm({
  onDone,
  onCancel,
  title = 'Whose chart?',
  cta = 'Read their chart',
}) {
  const [form, setForm] = useState({
    name: '', date: '', time: '', ampm: 'AM', timeKnown: true, place: null,
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const put = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  /* Date and time fill their own "/" and ":" (BirthInputs) — the number pad
     has neither. The time is 12-hour with AM/PM: a 24-hour box read "04:35"
     typed for an evening birth as the morning, with nothing to say so. */
  const valid =
    form.name.trim() &&
    isValidDate(form.date) &&
    form.place &&
    (!form.timeKnown || isValidTime(form.time))

  const submit = () => {
    if (!valid) return
    const [d, m, y] = form.date.split('/')
    onDone({
      name: form.name.trim(),
      birth_date: `${y}-${m}-${d}`,
      birth_time: form.timeKnown ? `${to24(form.time, form.ampm)}:00` : null,
      birth_time_known: form.timeKnown,
      birth_place: placeLabel(form.place),
      birth_lat: form.place.lat,
      birth_lon: form.place.lon ?? form.place.lng,
      birth_zone: form.place.zone ?? form.place.timezone ?? 'Asia/Kolkata',
    })
  }

  return (
    <div className="pop-card space-y-3 p-4">
      <p className="caps t-heading">{title}</p>

      <Field label="Their name">
        <input
          value={form.name}
          onChange={set('name')}
          placeholder="Amma"
          className="field-line"
        />
      </Field>

      <Field label="Date of birth">
        <DateField value={form.date} onChange={put('date')} />
      </Field>

      <Field label="Time of birth">
        <TimeField
          value={form.time}
          onChange={put('time')}
          ampm={form.ampm}
          onAmpm={put('ampm')}
          disabled={!form.timeKnown}
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
        <PlaceField
          place={form.place}
          onPick={(place) => setForm((f) => ({ ...f, place }))}
          placeholder="City of birth"
        />
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
          {cta}
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
