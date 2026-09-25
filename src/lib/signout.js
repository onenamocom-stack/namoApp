import { supabase } from './supabase.js'
import { beat } from './consultants.js'
import { isPro } from '../side.js'

/**
 * Sign out, from either app.
 *
 * ONE IMPLEMENTATION, TWO CALLERS — the seeker's settings and the
 * consultant's. They must do the same things in the same order, and the
 * order is the part that matters.
 *
 * THE CONSULTANT GOES OFFLINE FIRST. `accepting_now` left true on a
 * logout puts a green dot on somebody who has gone home: seekers press
 * it, nobody answers, and yesterday's presence work is undone by the one
 * screen that did not know about it. It runs BEFORE the token is thrown
 * away, because afterwards there is nothing to authenticate it with.
 *
 * A FAILED go-offline DOES NOT BLOCK THE SIGN-OUT. Somebody on a bad
 * connection still gets signed out — the heartbeat stops either way and
 * the dot goes dark within ninety seconds on its own. That is the whole
 * reason presence is a heartbeat and not a flag somebody has to remember
 * to clear.
 *
 * THE DRAFT IS CLEARED BECAUSE IT IS THE NEXT PERSON'S DEVICE. The
 * onboarding draft in sessionStorage holds a name, a birth time and a
 * birth place, and it also holds any referral code carried in from a
 * link. None of that belongs to whoever signs in next, and on a shared
 * phone — which is most phones here — "next" is a real person.
 *
 * EVERYTHING ELSE IS ALREADY HANDLED. `store.jsx` watches
 * `onAuthStateChange` and, on a null session, drops the profile, the
 * consultant row, the wallet and the cached charts. `SessionGate` then
 * sends the app back to onboarding. Repeating any of that here would be
 * a second place for it to drift.
 */
export async function signOut() {
  if (isPro) {
    try {
      await beat(false)
    } catch {
      /* The heartbeat stops regardless; the dot goes dark by itself. */
    }
  }

  try {
    sessionStorage.clear()
  } catch {
    /* Private window, blocked storage. Signing out still has to work. */
  }

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
