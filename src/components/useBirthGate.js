import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isPro } from '../side.js'
import { useStore } from '../store.jsx'

/**
 * Date, time and place of birth are missing. A time marked unknown counts
 * as given; a place counts only with its name on file.
 */
export function needsBirth(profile) {
  if (!profile) return false
  const time = profile.birth_time || profile.birth_time_known === false
  return !profile.birth_date || !time || !profile.birth_place
}

/** The details page, asking for birth details, then back to `next`. */
export function birthPath(next) {
  return `/onboarding/details?edit=1&need=1&for=consult&next=${encodeURIComponent(next)}`
}

/**
 * Consult asks for birth details before anything on it (21 Oct 2026,
 * Rahul: "when user accessing any features on consult, ask him to fill his
 * info of dob, time of birth and place"). A signed-in seeker without them
 * who opens the Consult tab or a Pro's page goes to the details page and
 * comes back once they are saved. Replaced, so Back from the details page
 * goes where the seeker was before Consult, not into the gate again.
 *
 * Not in the Pro build, not for a Pro (they are the one answering), not
 * signed out (the Pro's page stays open to a shared link), and not before
 * the profile has arrived.
 */
export default function useBirthGate() {
  const { session, profile, profileLoading, consultant } = useStore()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const ask = !isPro && !!session && !profileLoading && !consultant && needsBirth(profile)

  useEffect(() => {
    if (ask) navigate(birthPath(pathname + search), { replace: true })
  }, [ask, navigate, pathname, search])
}
