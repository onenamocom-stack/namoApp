import { notifications } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import { Section, Stub } from '../components/Primitives.jsx'

/**
 * The notification is the most-shared surface in this category of app, so it
 * gets the most typographic care and the least chrome: one or two sentences,
 * a timestamp, a hairline. No icons, no grouping, no unread dots.
 */
export default function Notifications() {
  return (
    <>
      <TopBar title="Notifications" back backTo="/horoscope" sub="One a day, at eight" />

      <Section label="This week">
        <ul>
          {notifications.map((n) => (
            <li key={n.id} className="border-b border-rule py-7 last:border-b-0">
              <p className="mb-3 text-micro uppercase tracking-caps text-t3 tnum">{n.time}</p>
              <p className="text-read text-t1">{n.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Settings" last>
        <Stub className="mb-8" />
        <p className="prose-c">
          One notification a day at 08:00. There is no way to make it send more, and turning it off
          does not change your chart.
        </p>
      </Section>

      <div className="h-8" />
    </>
  )
}
