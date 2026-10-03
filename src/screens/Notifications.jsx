import { Loader } from '../components/Cosmos.jsx'
import { useEffect, useState } from 'react'
import { ago, fetchAlerts } from '../lib/notifications.js'
import { TopBar } from '../components/Chrome.jsx'
import { Section } from '../components/Primitives.jsx'

/**
 * The notification is the most-shared surface in this category of app, so it
 * gets the most typographic care and the least chrome: one or two sentences,
 * a timestamp, a hairline. No icons, no grouping, no unread dots.
 *
 * The same rows as the Alerts tab in ChatPanel, read once rather than polled.
 * Until 30 Sep this rendered `notifications` from mock.js — "Kabir opened your
 * chart" and a daily 08:00 reading nothing sends — to every real account. It
 * does not mark anything read; opening the Alerts tab does that.
 */
export default function Notifications() {
  const [items, setItems] = useState(null)

  useEffect(() => {
    let alive = true
    fetchAlerts({ limit: 100 }).then((payload) => {
      if (alive) setItems(payload.items)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      <TopBar title="Notifications" back backTo="/profile" sub="History" />

      <Section label="Everything so far" last>
        {items === null && <Loader />}

        {items && !items.length && (
          <p className="prose-c">
            Nothing yet. Cashback, referrals and anything the sky does worth interrupting you for
            land here.
          </p>
        )}

        {items && items.length > 0 && (
          <ul>
            {items.map((n) => (
              <li key={n.id} className="border-b border-rule py-7 last:border-b-0">
                <p className="mb-3 text-micro uppercase tracking-caps text-t3 tnum">
                  {ago(n.created_at)}
                </p>
                <p className="text-read text-t1">{n.title}</p>
                {n.body && <p className="mt-2 text-meta text-t2">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="h-8" />
    </>
  )
}
