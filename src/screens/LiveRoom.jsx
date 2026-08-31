import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { liveChat, liveSessions } from '../data/mock.js'
import { TopBar } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import {
  Acts,
  Avatar,
  Button,
  firstName,
  Section,
} from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

export default function LiveRoom() {
  const { id } = useParams()
  const { showToast, hasFlag, toggleFlag } = useStore()
  const [chat, setChat] = useState(liveChat)
  const [draft, setDraft] = useState('')
  const [hearts, setHearts] = useState(0)

  const room = liveSessions.find((l) => l.id === id)
  if (!room) return <Navigate to="/home" replace />

  const following = hasFlag(`follow:${room.consultantId}`)
  const reminded = hasFlag(`remind:${room.id}`)

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setChat((c) => [...c, { id: `me-${c.length}`, name: 'You', initials: 'A', text }])
    setDraft('')
  }

  return (
    <>
      <TopBar
        title={room.live ? 'Live' : 'Scheduled'}
        back
        backTo="/home"
        sub={room.live ? `${room.viewers} watching` : room.startsIn}
        right={
          <button
            type="button"
            onClick={() => showToast('Room link copied')}
            className="text-label uppercase tracking-label text-t2"
          >
            Share
          </button>
        }
      />

      <Plate seed={room.id} variant="orbit" className="aspect-video w-full">
        <span className="absolute left-3 top-3 border border-rule bg-bg px-2 py-1 text-micro uppercase tracking-caps text-t1">
          {room.live ? '● Live' : 'Soon'}
        </span>
      </Plate>

      <Section label={room.tag} tight>
        <h1 className="text-lead font-light">{room.topic}</h1>
        <div className="mt-5 flex items-center gap-3">
          <Avatar initials={room.initials} size={32} />
          <span className="flex-1 text-meta text-t2">{room.consultant}</span>
          {room.live ? (
            <Button
              className="w-auto px-4"
              variant={following ? 'solid' : 'default'}
              onClick={() =>
                toggleFlag(`follow:${room.consultantId}`, {
                  on: `Following ${firstName(room.consultant)}`,
                  off: `Unfollowed ${firstName(room.consultant)}`,
                })
              }
            >
              {following ? 'Following' : 'Follow'}
            </Button>
          ) : (
            <Button
              className="w-auto px-4"
              variant={reminded ? 'solid' : 'default'}
              onClick={() =>
                toggleFlag(`remind:${room.id}`, {
                  on: 'You will be reminded',
                  off: 'Reminder removed',
                })
              }
            >
              {reminded ? 'Reminder set' : 'Remind me'}
            </Button>
          )}
        </div>

        {/* Reactions. A heart is a counter, not an animation — a stream of
            floating hearts over this palette would be the only motion in the
            app that means nothing. */}
        <Acts
          className="mt-6"
          items={[
            {
              label: 'Heart',
              onLabel: 'Hearted',
              on: hearts > 0,
              count: hearts || null,
              onClick: () => setHearts((h) => h + 1),
            },
            { label: 'Send a gift', onClick: () => showToast('Gifts — prototype only') },
            { label: 'Share', onClick: () => showToast('Room link copied') },
          ]}
        />
      </Section>

      {room.live ? (
        <>
          <Section label="Room" tight>
            <ul>
              {chat.map((m) => (
                <li key={m.id} className="flex items-start gap-3 border-b border-rule py-3">
                  <Avatar initials={m.initials} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="text-micro uppercase tracking-caps text-t3">{m.name}</span>
                    <span className="mt-1 block text-meta text-t1">{m.text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-center gap-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Say something"
                aria-label="Message"
                className="min-w-0 flex-1 border-b border-rule bg-transparent pb-2 text-body text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
              />
              <Button className="w-auto px-4" onClick={send} disabled={!draft.trim()}>
                Send
              </Button>
            </div>
          </Section>

          <Section label="Or ask directly" last>
            <p className="prose-c mb-8">
              A room answers the questions that are useful to everyone. Yours might not be one of
              them.
            </p>
            <Button to={`/consult/${room.consultantId}`} variant="solid">
              Book a private session
            </Button>
          </Section>
        </>
      ) : (
        <Section label="Not started" last>
          <p className="horoscope">This one opens {room.startsIn}. Nothing to watch yet.</p>
          <Button to="/home" variant="quiet" className="mt-10">
            Back to Home
          </Button>
        </Section>
      )}

      <div className="h-8" />
    </>
  )
}
