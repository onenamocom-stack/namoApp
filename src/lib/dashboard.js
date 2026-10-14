import { isPro } from '../side.js'

/**
 * Where a consultant screen lives in this build (Phase 16, 14 Oct 2026).
 *
 * The pro app keeps its `/pro/...` paths. The main app carries the same
 * screens under `/dashboard/...`: not `/pro`, because the store reads a
 * `/pro` path as the consultant app and would switch on the online beat,
 * showing a Pro as online on a screen where no call can ring. Calls stay in
 * the pro app until Namo Consult (`/desk`) takes them.
 *
 * Returns null for a screen the main app does not carry — the call queue
 * and availability (`/pro/consult`), which belong to the calling app.
 */
export function proPath(path) {
  if (isPro) return path
  if (path === '/pro/consult' || path.startsWith('/pro/ring')) return null
  return path.replace(/^\/pro(?=\/|$)/, '/dashboard')
}
