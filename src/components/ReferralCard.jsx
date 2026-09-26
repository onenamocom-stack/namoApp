import { useEffect, useState } from 'react'
import { claimCode, myCodes } from '../lib/referrals.js'
import CodeField from './CodeField.jsx'
import { Section } from './Primitives.jsx'
import { PopButton } from './Pop.jsx'
import { useStore } from '../store.jsx'

/**
 * A seeker's own code, and the box for somebody else's.
 *
 * TWO HALVES THAT LOOK ALIKE AND ARE NOT. Sharing yours is unlimited;
 * claiming somebody else's happens once per account, ever. The second
 * half disappears the moment it is used rather than staying as a box
 * that always refuses — a control that can never succeed again is worse
 * than no control, because it invites the attempt.
 *
 * WHAT IT PROMISES IS WHAT THE SERVER GIVES. Three free questions a day
 * for three days, to both sides. Not a discount, not money: the shop
 * cashback is the consultant programme and lives on a different code
 * entirely. Saying "earn money" here would be the wrong offer written
 * over the right one.
 */
export default function ReferralCard() {
  const { showToast } = useStore()
  const [state, setState] = useState(null)
  const [typed, setTyped] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)

  useEffect(() => {
    let alive = true
    myCodes().then((row) => alive && setState(row))
    return () => {
      alive = false
    }
  }, [])

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Code copied')
    } catch {
      showToast('Could not copy. Long-press the code.')
    }
  }

  async function claim() {
    const code = typed.trim()
    if (!code || claiming) return
    setClaiming(true)
    try {
      await claimCode(code)
      setClaimed(true)
      showToast('Code accepted. Three free questions a day, starting tomorrow.')
    } catch (err) {
      // The server's sentence, verbatim. Every refusal it can give names
      // the fix — wrong kind of code, already used one, your own.
      showToast(err.message)
    } finally {
      setClaiming(false)
    }
  }

  if (!state) return null

  const mine = state.codes?.seeker
  const brought = state.referred?.signups ?? 0
  // Somebody who has already been referred has nothing to type. The
  // server tracks this properly; `claimed` covers the same session.
  const canClaim = !claimed && brought === 0 && !state.referred?.claimed

  return (
    <Section label="Invite a friend" tight>
      <p className="horoscope">
        Share your code. When someone joins with it you both get three free
        questions a day with Namo AI for three days, starting the next day.
      </p>

      <button
        type="button"
        onClick={() => copy(mine)}
        className="mt-5 w-full rounded-lg border border-rule px-4 py-5 text-center transition-colors hover:border-t1"
      >
        <span className="block font-display text-display tracking-[0.2em] t-heading">
          {mine}
        </span>
        <span className="mt-2 block caps-sm t-faint">Tap to copy</span>
      </button>

      {/* The number that makes somebody share a code a second time is the
          one that says the first time worked. Shown only once it has. */}
      {brought > 0 && (
        <p className="mt-3 text-micro t-faint tnum">
          {brought} {brought === 1 ? 'person has' : 'people have'} joined with your code.
        </p>
      )}

      {canClaim && (
        <div className="mt-7 border-t border-rule pt-6">
          <p className="caps-sm t-faint">Have someone else&apos;s code?</p>
          <div className="mt-3">
            <CodeField
              value={typed}
              onChange={setTyped}
              label="Their code"
              placeholder="NXXXXXXX"
              hint="Once per account. An astrologer's shop coupon goes in at checkout instead."
            />
          </div>
          <PopButton
            size="sm"
            variant="gold"
            className="mt-3"
            onClick={claim}
            disabled={!typed.trim() || claiming}
          >
            {claiming ? '…' : 'Apply'}
          </PopButton>
        </div>
      )}
    </Section>
  )
}
