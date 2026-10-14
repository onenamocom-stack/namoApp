/**
 * Coming back to the Consult page from the wallet (14 Oct 2026, Rahul).
 *
 * The Consult page's list is an overlay, not a route, so going back from
 * /wallet landed on Consult with the list closed. The wallet card marks
 * the trip here; Consult reopens the list when it sees a recent mark,
 * whether the person pressed the app's back, the phone's, or added money.
 */
const KEY = 'namo-consult-return'
const FRESH_MS = 15 * 60 * 1000

export function markConsultReturn() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* private window: the list simply stays closed */
  }
}

/** True once, when the wallet was opened from the Consult list recently. */
export function takeConsultReturn() {
  try {
    const at = Number(sessionStorage.getItem(KEY))
    sessionStorage.removeItem(KEY)
    return Number.isFinite(at) && Date.now() - at < FRESH_MS
  } catch {
    return false
  }
}
