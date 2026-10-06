import { useEffect, useState } from 'react'
import { looksLikeReferral } from './referrals.js'

/**
 * The consultant's code a shop link brought (`?ref=A…`), if any — on the
 * shop or on a product's page (6 Oct 2026: a tagged product now opens its
 * page, so the page must catch the code too).
 *
 * Kept in sessionStorage as well as state. The journey from a shared link
 * is rarely one page — arrive, browse, sign in, then buy — and a code that
 * lived only in the address would be gone by the time it mattered, with
 * nobody able to explain why the consultant was not credited. Session
 * storage, not local: it belongs to this visit. CartSheet reads it at Pay.
 *
 * Only A… codes. An N… code is a sign-up code claimed once at onboarding,
 * and silently treating one as a shop coupon would send a seeker to a till
 * to be told, correctly but uselessly, that it is the wrong kind.
 */
export function useReferralFromLink() {
  const [code, setCode] = useState(() => {
    try {
      return sessionStorage.getItem('namo.ref') || null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const found = new URLSearchParams(window.location.search).get('ref')
    if (!found || !looksLikeReferral(found) || !found.toUpperCase().startsWith('A')) return
    const upper = found.toUpperCase()
    setCode(upper)
    try {
      sessionStorage.setItem('namo.ref', upper)
    } catch {
      /* private window, blocked storage — the code still works this page */
    }
  }, [])

  return code
}
