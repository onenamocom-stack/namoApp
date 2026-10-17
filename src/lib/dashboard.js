import { isPro } from '../side.js'

/**
 * Where a consultant screen lives in this build (Phase 16, 14 Oct 2026).
 *
 * The pro app keeps its `/pro/...` paths. The main app carries the same
 * screens under `/studio/...`: not `/pro`, because the store reads a
 * `/pro` path as the consultant app and would switch on the online beat,
 * showing a Pro as online on a screen where no call can ring.
 *
 * The call queue and availability (`/pro/consult`) and a call
 * notification's landing (`/pro/ring/:id`) belong to Namo Consult,
 * `/desk`, the one main-app screen where calls ring.
 */
export function proPath(path) {
  if (isPro) return path
  if (path === '/pro/consult') return '/desk'
  // No Studio in the main app (14 Oct 2026, Rahul): Home's + posts.
  if (path === '/pro/studio') return '/home?compose=1'
  // The mixed Earnings page went into the Dashboard's sections (16 Oct 2026).
  if (path === '/pro/earnings') return '/studio/consulting'
  if (path.startsWith('/pro/ring/')) return path.replace('/pro/ring/', '/desk/ring/')
  return path.replace(/^\/pro(?=\/|$)/, '/studio')
}

/** Where a consultant lands after a call or a ring: the studio in the pro
 *  app, Namo Consult in the main app. */
export const DUTY_HOME = isPro ? '/pro/studio' : '/desk'

/** The call screen for a session the consultant answered. In the main app
 *  it carries `?from=desk`, so hanging up returns to Namo Consult and not
 *  to the seeker's Consult tab. */
export function callPath(id) {
  return isPro ? `/call/${id}` : `/call/${id}?from=desk`
}
