/* Namo's service worker — the consultant's phone rings (6 Oct 2026).
 *
 * Registered only by the consultant app (src/lib/push.js). The server
 * pushes {type: 'incoming', session_id, title, body} the moment a seeker
 * asks for a session; this turns it into a notification that stays until
 * it is answered, vibrates like a phone, and carries Answer and Decline —
 * whether or not the app is open. Tapping it opens (or focuses) the app on
 * /pro/ring/<id>, which does what was tapped.
 *
 * Nothing here holds data or caches pages: it exists only to be woken.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const RING = [900, 400, 900, 400, 900, 400, 900, 400, 900, 400, 900]

self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { title: 'Namo', body: event.data ? event.data.text() : '' }
  }
  if (d.type === 'incoming') {
    event.waitUntil(
      self.registration.showNotification(d.title || 'Someone is calling', {
        body: d.body || 'Tap to answer',
        tag: `call-${d.session_id}`,
        renotify: true,
        requireInteraction: true,
        vibrate: RING,
        icon: '/namo-icon.png',
        badge: '/favicon.png',
        data: { session_id: d.session_id },
        actions: [
          { action: 'answer', title: 'Answer' },
          { action: 'decline', title: 'Decline' },
        ],
      }),
    )
    return
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Namo', {
      body: d.body || '',
      icon: '/namo-icon.png',
      badge: '/favicon.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const id = event.notification.data && event.notification.data.session_id
  const act = event.action || 'open'
  const path = id ? `/pro/ring/${id}?do=${act}` : '/pro/studio'
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        if ('focus' in client) {
          await client.focus()
          client.postMessage({ type: 'namo-route', path })
          return
        }
      }
      await self.clients.openWindow(`/#${path}`)
    })(),
  )
})
