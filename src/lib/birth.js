/**
 * Where "Add your birth details" goes (13 Oct 2026, docs/06 Phase 15a):
 * sign-up no longer asks for them, so the first screen that needs them sends
 * you to the details page and it brings you back here once they are saved.
 */
export function birthHref() {
  const here = window.location.pathname + window.location.search
  return `/onboarding/details?edit=1&need=1&next=${encodeURIComponent(here)}`
}
