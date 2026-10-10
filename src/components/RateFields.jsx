import { RATE_MAX, RATE_MIN, SLOT_MINS } from '../lib/consultants.js'

/**
 * The four rates a consultant types (10 Oct 2026, Rahul): chat, video,
 * audio and booking, whole rupees a minute from ₹5 to ₹110. A booking is
 * one 20-minute slot, so its line says what the client pays for it.
 *
 * `value` holds what was typed, as strings, so a half-typed field is not
 * forced into a number. `rateErrors(value)` is the same check the server
 * makes; the server's refusal is still the last word.
 */
export const RATE_FIELDS = [
  ['chat', 'Chat'],
  ['video', 'Video call'],
  ['audio', 'Audio call'],
  ['booking', 'Booking'],
]

const valid = (v) => /^\d+$/.test(String(v ?? '').trim()) && +v >= RATE_MIN && +v <= RATE_MAX

/** { key: true } for every field that is not a whole number in range. */
export function rateErrors(value) {
  return Object.fromEntries(RATE_FIELDS.filter(([k]) => !valid(value[k])).map(([k]) => [k, true]))
}

/** The typed strings as the numbers the API takes. */
export function rateNumbers(value) {
  return Object.fromEntries(RATE_FIELDS.map(([k]) => [k, parseInt(value[k], 10)]))
}

export default function RateFields({ value, onChange }) {
  const errors = rateErrors(value)
  return (
    <div className="mt-2">
      {RATE_FIELDS.map(([key, label]) => {
        const typed = String(value[key] ?? '')
        const bad = typed !== '' && errors[key]
        return (
          <label key={key} className="flex items-center gap-3 border-b border-rule py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-meta font-semibold t-heading">{label}</span>
              <span className={`block text-micro tnum ${bad ? 'text-live' : 't-faint'}`}>
                {bad
                  ? `₹${RATE_MIN} to ₹${RATE_MAX}, whole rupees`
                  : key === 'booking'
                    ? `${SLOT_MINS} min · client pays ₹${valid(typed) ? +typed * SLOT_MINS : '—'}`
                    : 'Charged while it runs'}
              </span>
            </span>
            <span className="flex flex-none items-baseline gap-1 text-meta t-heading">
              ₹
              <input
                type="text"
                inputMode="numeric"
                value={typed}
                onChange={(e) => onChange({ ...value, [key]: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                aria-label={`${label}, rupees a minute`}
                aria-invalid={bad || undefined}
                placeholder="—"
                className={`w-14 rounded-lg border bg-white px-2 py-1.5 text-right tnum outline-none ${
                  bad ? 'border-live' : 'border-rule focus:border-gold-fill'
                }`}
              />
              <span className="text-micro t-faint">/min</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
