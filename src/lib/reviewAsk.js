/**
 * The ask after a call or chat (17 Oct 2026, Rahul: "when a call with pro
 * caller disconnect it should ask for review"). Whatever ends a session on
 * the seeker's side calls `askReview(id)`; `ReviewAsk`, mounted once in
 * the app, opens the review sheet if the server says that session can be
 * reviewed (it connected, it is theirs, not reviewed yet).
 */
const EVENT = 'namo:review-ask'

export function askReview(sessionId) {
  if (sessionId) window.dispatchEvent(new CustomEvent(EVENT, { detail: sessionId }))
}

export function onReviewAsk(fn) {
  const handler = (e) => fn(e.detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
