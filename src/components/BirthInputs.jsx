/**
 * Date and time of birth, typed on the number pad.
 *
 * A phone's number pad has no "/" and no ":", so a field that wants
 * DD/MM/YYYY and opens that pad cannot be filled in (reported 3 Oct 2026, in
 * Namo AI's "someone else" form). These fields take digits only and put the
 * separators in themselves: type 14111996, see 14/11/1996. Deleting through a
 * separator deletes the digit before it too, so backspace never sticks.
 *
 * Shared by sign-up's About-you page and SubjectForm (Namo AI and Matching),
 * so the three agree on format and validation.
 */
import { Segmented } from './Primitives.jsx'

/** Digits → "DD/MM/YYYY", partial as typed. */
export function maskDate(next, prev = '') {
  let digits = next.replace(/\D/g, '').slice(0, 8)
  // Backspace over a "/" removes the digit before it as well.
  if (next.length < prev.length && prev.endsWith('/') && !next.endsWith('/')) {
    digits = digits.slice(0, -1)
  }
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean)
  let out = parts.join('/')
  // Show the separator as soon as a part is full, so the next digit lands after it.
  if ((digits.length === 2 || digits.length === 4) && next.length >= prev.length) out += '/'
  return out
}

/** Digits → "HH:MM", partial as typed. */
export function maskTime(next, prev = '') {
  let digits = next.replace(/\D/g, '').slice(0, 4)
  if (next.length < prev.length && prev.endsWith(':') && !next.endsWith(':')) {
    digits = digits.slice(0, -1)
  }
  let out = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
  if (digits.length === 2 && next.length >= prev.length) out += ':'
  return out
}

/** A real calendar day between 1900 and today, not just a plausible shape. */
export function isValidDate(ddmmyyyy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy || '')
  if (!m) return false
  const [dd, mm, yy] = [+m[1], +m[2], +m[3]]
  if (yy < 1900) return false
  const at = new Date(yy, mm - 1, dd)
  if (at > new Date()) return false
  return at.getFullYear() === yy && at.getMonth() === mm - 1 && at.getDate() === dd
}

/** 12-hour clock: 01–12 and 00–59. */
export function isValidTime(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '')
  return Boolean(m) && +m[1] >= 1 && +m[1] <= 12 && +m[2] <= 59
}

/** "04:35" + "PM" → "16:35". */
export function to24(hhmm, ampm) {
  let [h, min] = hhmm.split(':').map(Number)
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** "16:35:00" → { time: "04:35", ampm: "PM" } — for prefilling an edit. */
export function from24(hhmmss) {
  if (!hhmmss) return { time: '', ampm: 'AM' }
  let [h, min] = hhmmss.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return { time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, ampm }
}

export function DateField({ value, onChange, className = 'field-line', ...rest }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(maskDate(e.target.value, value))}
      placeholder="DD/MM/YYYY"
      inputMode="numeric"
      autoComplete="bday"
      maxLength={10}
      className={`${className} tnum`}
      {...rest}
    />
  )
}

export function TimeField({ value, onChange, ampm, onAmpm, disabled, className = 'field-line', ...rest }) {
  return (
    <div className={`flex items-center gap-3 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <input
        value={value}
        onChange={(e) => onChange(maskTime(e.target.value, value))}
        placeholder="HH:MM"
        inputMode="numeric"
        maxLength={5}
        disabled={disabled}
        className={`${className} min-w-0 flex-1 tnum`}
        {...rest}
      />
      <Segmented items={['AM', 'PM']} value={ampm} onChange={onAmpm} className="w-[7.5rem] flex-none" />
    </div>
  )
}
