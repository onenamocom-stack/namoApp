import { lazy } from 'react'

const RELOADED = 'namo.chunk-reload'

/**
 * `React.lazy` that survives a deploy (21 Oct 2026). A screen's code is its
 * own file since the split; after a new build the old file names are gone,
 * so a tab opened before the deploy asks for a chunk that no longer exists.
 * The first failure reloads the page once, into the new build. A second
 * failure in the same tab is a real one and goes to the screen's Boundary.
 */
export function lazyScreen(load, pick = 'default') {
  return lazy(() =>
    load().then(
      (m) => {
        try {
          sessionStorage.removeItem(RELOADED)
        } catch {
          /* storage blocked: nothing to clear */
        }
        return pick === 'default' ? m : { default: m[pick] }
      },
      (err) => {
        let again = false
        try {
          again = sessionStorage.getItem(RELOADED) === '1'
          if (!again) sessionStorage.setItem(RELOADED, '1')
        } catch {
          again = true
        }
        if (!again) {
          window.location.reload()
          return new Promise(() => {})
        }
        throw err
      },
    ),
  )
}
