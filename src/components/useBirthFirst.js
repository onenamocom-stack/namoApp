import { useCallback, useEffect } from 'react'
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

/** The details page, asking for birth details, then back to `next`. A Pro
    service says the Pro reads them; a screen says what it makes from them. */
export function birthPath(next, pro = true) {
  return `/onboarding/details?edit=1&need=1${pro ? '&for=consult' : ''}&next=${encodeURIComponent(next)}`
}

/**
 * Birth details when a seeker takes a service, not when they look (21 Oct
 * 2026, Rahul: "consult page pe jaane do. koi service le tab dob etc
 * bharwani hai"; for a few hours that day opening Consult or a Pro's page
 * sent you to the details page first). Returns `ask(next)`: with date, time
 * or place of birth missing it opens the details page, which comes back to
 * `next` once they are saved, and answers true; otherwise false. `replace`
 * when the asking screen would ask again on Back.
 *
 * Not in the Pro build, not signed out, not before the profile has arrived.
 */
export default function useBirthFirst() {
  const { session, profile, showToast } = useStore()
  const navigate = useNavigate()
  return useCallback(
    (next, { replace = false, pro = true } = {}) => {
      if (isPro || !session || !needsBirth(profile)) return false
      showToast(
        pro
          ? 'Add your date, time and place of birth first. The Pro reads from them.'
          : 'Add your date, time and place of birth first.',
      )
      navigate(birthPath(next, pro), { replace })
      return true
    },
    [navigate, profile, session, showToast],
  )
}

/**
 * The same ask on a screen that reads your birth (21 Oct 2026, Rahul: "ye
 * fir horoscope ya namo ai ya mahurat ya matching kuch bhi"): the full
 * chart, Ask AI, Muhurat and Matching, from wherever they are opened.
 * Replaced, so Back from the details page goes to the screen before, not
 * into this one again. `skip` for a screen showing somebody else's birth.
 */
export function useBirthGate({ skip = false } = {}) {
  const { profile, profileLoading } = useStore()
  const birthFirst = useBirthFirst()
  const { pathname, search } = useLocation()
  const ask = !skip && !profileLoading && needsBirth(profile)

  useEffect(() => {
    if (ask) birthFirst(pathname + search, { replace: true, pro: false })
  }, [ask, birthFirst, pathname, search])
}
