import { useEffect, useRef, useState } from 'react'
import { checkCode } from '../lib/referrals.js'

/**
 * A code box that says whether the code is any good.
 *
 * THE TICK MEANS THE SERVER AGREES. The cart drew its "10% back" line
 * off a regex in the browser, so a well-shaped code nobody had ever
 * issued looked exactly as valid as a real one — right up until Pay
 * refused it. A green tick that only means "eight characters starting
 * with A" is worse than no tick, because it is believed.
 *
 * WHY IT DEBOUNCES. The field is checked while somebody types, and every
 * keystroke of an eight-character code would be eight requests, seven of
 * which are asking about a prefix. 500ms after they stop is the answer
 * to a code, not to a fragment.
 *
 * WHY THE LAST REQUEST WINS. Type, backspace, retype: the answers can
 * come back out of order, and an older one landing second would tick a
 * code that is no longer in the box. Each check carries a sequence
 * number and anything stale is dropped.
 *
 * WHAT IT NEVER DOES: block. A check that fails on a flaky network
 * leaves the field usable and says nothing — the real answer comes at
 * Pay regardless, and refusing to let somebody try is worse than letting
 * them and being told.
 */
export default function CodeField({
  value,
  onChange,
  subtotalPaise = 0,
  label = 'Coupon or code',
  placeholder = 'Optional',
  hint = null,
}) {
  const [state, setState] = useState(null)   // null | 'checking' | result
  const seq = useRef(0)

  useEffect(() => {
    const code = (value || '').trim()
    if (!code) {
      setState(null)
      return undefined
    }
    // Too short to be anything. Checking a two-letter fragment spends a
    // request to be told what the length already says.
    if (code.length < 4) {
      setState(null)
      return undefined
    }

    const mine = ++seq.current
    setState('checking')
    const timer = setTimeout(async () => {
      const answer = await checkCode(code, subtotalPaise)
      // Out-of-order guard: only the newest request may paint.
      if (mine === seq.current) setState(answer)
    }, 500)

    return () => clearTimeout(timer)
  }, [value, subtotalPaise])

  const ok = state && state !== 'checking' && state.ok
  const bad = state && state !== 'checking' && !state.ok

  return (
    <label className="block">
      <span className="caps-sm t-faint">{label}</span>
      <span className="relative mt-2 block">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder={placeholder}
          maxLength={32}
          aria-label={label}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck="false"
          className={`w-full rounded-lg border bg-transparent px-3 py-2.5 pr-10 text-body tracking-[0.1em] text-t1 outline-none transition-colors placeholder:tracking-normal placeholder:text-t4 ${
            ok ? 'border-ok' : bad ? 'border-live' : 'border-rule focus:border-t1'
          }`}
        />
        {/* The mark sits inside the field, against the code it is about.
            Drawn rather than an icon import: a tick and a cross are two
            paths, and this is the only place they appear. */}
        {state && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body leading-none ${
              state === 'checking' ? 'animate-breathe t-faint' : ok ? 'text-ok' : 'text-live'
            }`}
          >
            {state === 'checking' ? '·' : ok ? '✓' : '✕'}
          </span>
        )}
      </span>

      {/* One line, and it is the SERVER's sentence. Every refusal it can
          give names the fix — wrong kind of code, already used one, not
          your first order — so there is nothing to translate here. */}
      <span
        role={bad ? 'alert' : undefined}
        className={`mt-2 block text-micro ${
          ok ? 'text-ok' : bad ? 'text-live' : 't-faint'
        }`}
      >
        {state === 'checking'
          ? 'Checking…'
          : ok
            ? state.note
            : bad
              ? state.reason
              : hint}
      </span>
    </label>
  )
}
