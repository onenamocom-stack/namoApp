import { useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Button, Section, Stub } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

const LINK = 'aether.app/i/ananya-4f21'

export default function Invite() {
  const { showToast } = useStore()
  const [sent, setSent] = useState(false)

  return (
    <>
      <TopBar title="Invite" back backTo="/people" />

      <section className="section pt-14">
        <h1 className="mx-auto max-w-[13ch] text-center text-display font-light">
          Send them one link.
        </h1>
        <Stub className="my-8" />
        <p className="horoscope">
          They answer the same three questions. You both get the reading. Neither of you gets to
          edit it.
        </p>
      </section>

      <Section label="Your link">
        <p className="pop-inset break-all px-4 py-5 text-center text-body text-t1">
          {LINK}
        </p>
        <Button
          className="mt-6"
          variant="solid"
          onClick={() => {
            setSent(true)
            showToast('Link copied')
          }}
        >
          {sent ? 'Copied' : 'Copy link'}
        </Button>
        <p className="mt-6 text-center text-meta text-t3">
          Prototype — nothing is sent and nothing is stored.
        </p>
      </Section>

      <Section label="Before you send it" last>
        <ul className="mx-auto max-w-measure">
          {[
            'They will see how they read to you. Some people take that badly.',
            'Birth time to the minute, or the reading is decoration.',
            'You can remove a person later. They are not told.',
          ].map((t) => (
            <li key={t} className="border-b border-rule py-4 text-body text-t2 last:border-b-0">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <div className="h-8" />
    </>
  )
}
