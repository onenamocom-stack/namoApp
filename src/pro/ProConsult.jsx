import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TabHeader } from '../components/Chrome.jsx'
import { DeskHeader } from '../components/ProHeader.jsx'
import PresenceToggle from '../components/PresenceToggle.jsx'
import { isPro } from '../side.js'
import { callPath } from '../lib/dashboard.js'
import Icon from '../components/Icon.jsx'
import { Kicker, PopAvatar, PopButton, PopTag } from '../components/Pop.jsx'
import { firstName } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import {
  decideBooking,
  listBookings,
} from '../lib/consultants.js'
import { acceptChat, listMissed, listSessions, subscribeToRequests } from '../lib/chat.js'

/**
 * NAMO Desk (`/desk`; Namo Consult until 16 Oct 2026) — everything that runs
 * today's practice: the big Go live button, then one list, In line: every
 * call and chat waiting, the first to ask on top, each with its type (17 Oct
 * 2026, Rahul: no Audio, Video and Chat tabs). Bookings under it. The
 * calendar and earnings links left the page; the Dashboard has both.
 */
const channelOf = (s) => (s.mode === 'chat' ? 'chat' : s.audio_only ? 'audio' : 'video')
const CHANNEL = {
  audio: { icon: 'phone', label: 'Audio call', verb: 'Answer' },
  video: { icon: 'video', label: 'Video call', verb: 'Answer' },
  chat: { icon: 'chat', label: 'Chat', verb: 'Join' },
}

export default function ProConsult() {
  const { consultant, consultantError, openChat, showToast } = useStore()
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  /* People waiting right now, on any channel. Nothing has been charged: the
     hold is taken and the clock starts when this is accepted. Realtime
     rather than polling, because a request nobody sees for thirty seconds
     is a seeker who has left. */
  const [requests, setRequests] = useState([])
  // Who reached for you while you were busy, the last day (17 Oct 2026).
  const [missed, setMissed] = useState([])
  const missedAt = useRef(0)

  const me = consultant?.profile_id

  const reload = useCallback(() => {
    if (!me) return
    listBookings(me).then(setRows)
  }, [me])

  const loadRequests = useCallback(() => {
    if (!me) return
    listSessions().then((all) =>
      setRequests(all.filter((s) => s.consultant_id === me && s.status === 'requested')),
    )
    // The queue polls every 2 s; missed calls need not, so every 15 s.
    if (Date.now() - missedAt.current > 15000) {
      missedAt.current = Date.now()
      listMissed().then(setMissed)
    }
  }, [me])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!me) return undefined
    loadRequests()
    return subscribeToRequests(me, loadRequests)
  }, [me, loadRequests])

  const take = async (sess) => {
    const res = await acceptChat(sess.id)
    if (!res?.ok) return showToast(res?.reason ?? 'Could not start that session.')
    loadRequests()
    // A call goes to the call screen; a chat opens on its conversation.
    if ((res.mode ?? sess.mode) !== 'chat') return navigate(callPath(sess.id))
    showToast(`Live · ${res.minutes_held} min held`)
    openChat('live', res.thread_id ?? null)
  }

  const bookings = rows ?? []
  const pending = bookings.filter((b) => b.status === 'pending')
  const approved = consultant?.status === 'approved'
  const inLine = [...requests].sort((a, b) => (a.requested_at < b.requested_at ? -1 : 1))

  return (
    <>
      {isPro ? (
        <TabHeader
          action={pending.length > 0 ? <PopTag tone="gold">{pending.length} waiting</PopTag> : null}
        />
      ) : (
        <DeskHeader />
      )}

      <section className="px-5 pb-2 pt-5">
        {approved && !consultantError ? (
          <PresenceToggle big />
        ) : (
          /* Three states, not two. `consultant` is null both when there is
             no row and when the read failed, and telling somebody they are
             not approved because a request timed out is the same mistake as
             sending them to the signup form. */
          <div className="pop-card flex items-center gap-3 p-4">
            <span className="h-2.5 w-2.5 flex-none rounded-full bg-t4" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-meta t-heading">
                {consultantError ? 'Could not check your status' : 'Not yet approved'}
              </span>
              <span className="mt-0.5 block caps-sm t-faint">
                {consultantError
                  ? 'The connection failed. This says nothing about your practice'
                  : 'Invisible, unbookable and earning nothing until we approve you'}
              </span>
            </span>
          </div>
        )}
      </section>

      <InLine requests={inLine} onTake={take} onInbox={() => openChat('live')} />
      <Missed rows={missed} />
      <Bookings rows={rows} bookings={bookings} reload={reload} />

      <div className="h-24" />
    </>
  )
}

/** Everyone waiting, on any channel, in the order they asked. */
function InLine({ requests, onTake, onInbox }) {
  return (
    <section className="px-5 pt-6">
      <Kicker>{requests.length ? `In line · ${requests.length}` : 'In line'}</Kicker>
      {requests.length === 0 ? (
        <div className="pop-card mt-4 flex items-center gap-3 p-4">
          <span className="pill knob !h-10 !w-10 flex-none justify-center">
            <Icon name="phone" size={18} />
          </span>
          <span className="min-w-0 flex-1 text-meta t-body">
            Nobody is waiting. While you are live, a call rings at the top of the screen and a chat appears here.
          </span>
        </div>
      ) : (
        <ol className="mt-4 space-y-2">
          {requests.map((r, i) => {
            const ch = CHANNEL[channelOf(r)]
            return (
              <li key={r.id} className="pop-card flex items-center gap-3 p-3">
                <span className="w-4 flex-none text-center text-meta font-semibold t-faint tnum">{i + 1}</span>
                <PopAvatar initials={initials(r.seeker_name ?? '')} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta t-heading">{r.seeker_name ?? 'A client'}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] gold">
                    <Icon name={ch.icon} size={13} />
                    {ch.label}
                    <span className="t-faint tnum">· ₹{rupees(r.rate_paise)}/min · {hhmm(r.requested_at)}</span>
                  </span>
                </span>
                <PopButton size="sm" variant="gold" full={false} onClick={() => onTake(r)}>
                  {ch.verb}
                </PopButton>
              </li>
            )
          })}
        </ol>
      )}
      <button type="button" onClick={onInbox} className="pop-card pop-tap mt-3 flex w-full items-center gap-3 p-4">
        <span className="pill knob !h-10 !w-10 flex-none justify-center">
          <Icon name="chat" size={18} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-meta t-heading">Open your chats</span>
          <span className="mt-0.5 block caps-sm t-faint">Every client thread</span>
        </span>
      </button>
    </section>
  )
}

/** Missed calls (17 Oct 2026, Rahul): somebody reached for you while you
 *  were on another call or chat. Nothing to press: they can be reached
 *  again only by calling you, so this says someone was in line. */
function Missed({ rows }) {
  if (!rows.length) return null
  return (
    <section className="px-5 pt-6">
      <Kicker>{`Missed while busy · ${rows.length}`}</Kicker>
      <ul className="mt-4 space-y-2">
        {rows.map((m) => {
          const ch = CHANNEL[m.mode === 'chat' ? 'chat' : m.audio_only ? 'audio' : 'video']
          return (
            <li key={m.id} className="pop-card flex items-center gap-3 p-3">
              <PopAvatar initials={initials(m.seeker_name ?? '')} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{m.seeker_name ?? 'A client'}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-live">
                  <Icon name={ch.icon} size={13} />
                  Missed {ch.label.toLowerCase()}
                  <span className="t-faint tnum">· {dayLabel(m.created_at)}</span>
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * How each channel is actually delivered. The consultant's whole job runs
 * through these, so each start button goes somewhere real rather than firing
 * the same toast three times.
 */
const CHANNELS = {
  chat: { icon: 'chat', verb: 'Open chat' },
  call: { icon: 'phone', verb: 'Start call' },
}

const hhmm = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })

const dayLabel = (iso) => {
  const on = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
  if (on === today) return `Today · ${hhmm(iso)}`
  return `${new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} · ${hhmm(iso)}`
}

function Bookings({ rows, bookings, reload }) {
  const { showToast, openChat } = useStore()
  const [busy, setBusy] = useState(null)

  /* Chat opens the panel; a call is the one stub. A `live` mode used to
     navigate to a hardcoded `/live/l1`, which outlived the room it pointed
     at — live video was deleted on 9 Sep 2026, and that route now falls
     through the catch-all to the seeker's Home, which is the worst available
     failure on the consultant side. Anything not chat is the honest toast. */
  const start = (b) => {
    if (b.mode === 'chat') return openChat('live')
    // A booked call is not dialled from here (14 Oct 2026: the toast said
    // "prototype only"): the client calls at the time, and it rings on the
    // consultant's screen like any call.
    return showToast(`At the time, ${firstName(b.seeker_name)} calls you. Stay online and it rings here.`)
  }

  const decide = async (b, status) => {
    if (busy) return
    setBusy(b.id)
    const ok = await decideBooking(b.id, status)
    setBusy(null)
    if (!ok) return showToast('That did not go through. Try again.')
    showToast(
      status === 'confirmed'
        ? `Accepted · ${firstName(b.seeker_name)} at ${hhmm(b.starts_at)}`
        : `Declined · ${firstName(b.seeker_name)}`,
    )
    reload()
  }

  const pending = bookings.filter((b) => b.status === 'pending')
  const confirmed = bookings.filter((b) => b.status === 'confirmed')

  return (
    <>
      {/* ── Requests ───────────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>
          {rows === null
            ? 'Bookings'
            : pending.length === 0
              ? 'Bookings · none to accept'
              : `Bookings · ${pending.length} to accept`}
        </Kicker>

        {pending.length === 0 ? (
          <p className="mt-3 text-meta t-faint">
            No booking is waiting for your yes.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((b) => (
              <li key={b.id} className="pop-card p-4">
                <div className="flex items-start gap-3">
                  <PopAvatar initials={initials(b.seeker_name)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-meta t-heading">{b.seeker_name}</p>
                    <p className="mt-0.5 caps-sm t-faint tnum">
                      {b.mode} · {b.duration_mins} min · {dayLabel(b.starts_at)}
                    </p>
                  </div>
                  <p className="flex-none text-meta gold tnum">₹{rupees(b.amount_paise)}</p>
                </div>

                {b.note && <p className="mt-3 text-meta t-sub">“{b.note}”</p>}

                {/* Not toggles any more. The policy allows pending → confirmed
                    or declined and nothing else, so a second tap on Accept
                    changes nothing rather than undoing the first. */}
                <div className="mt-4 flex items-center gap-2">
                  <PopButton
                    size="sm"
                    variant="gold"
                    full={false}
                    className="flex-1"
                    disabled={busy === b.id}
                    onClick={() => decide(b, 'confirmed')}
                  >
                    <Icon name="check" size={15} weight={2.1} />
                    <span className="ml-1.5">Accept</span>
                  </PopButton>
                  <PopButton
                    size="sm"
                    variant="ghost"
                    full={false}
                    className="flex-1"
                    disabled={busy === b.id}
                    onClick={() => decide(b, 'declined')}
                  >
                    <Icon name="close" size={15} weight={2.1} />
                    <span className="ml-1.5">Decline</span>
                  </PopButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Confirmed ──────────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>{`${confirmed.length} confirmed`}</Kicker>
        <ul className="mt-4 space-y-2">
          {confirmed.map((b) => (
            <li key={b.id} className="pop-inset flex items-center gap-3 p-3">
              <span className="w-12 flex-none text-meta tnum t-heading">{hhmm(b.starts_at)}</span>
              <PopAvatar initials={initials(b.seeker_name)} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{b.seeker_name}</span>
                <span className="mt-0.5 block caps-sm t-faint">
                  {b.mode} · {b.duration_mins} min
                </span>
              </span>
              {/* Prefills /chart with this client's real birth details, which
                  the booking view carries for exactly this reason. The wheel
                  itself is still the seed chart until phase 7 computes one —
                  Chart.jsx says so on screen rather than presenting a
                  stranger's chart as though it were calculated. */}
              <Link
                to={`/chart?name=${encodeURIComponent(b.seeker_name)}&date=${encodeURIComponent(b.birth_date ?? '')}&time=${encodeURIComponent(b.birth_time ?? '')}`}
                aria-label={`View ${firstName(b.seeker_name)}'s kundli`}
                className="pill knob !h-9 !w-9 flex-none justify-center"
              >
                <Icon name="kundli" size={16} />
              </Link>
              <button
                type="button"
                aria-label={`${CHANNELS[b.mode]?.verb ?? 'Open'} with ${firstName(b.seeker_name)}`}
                onClick={() => start(b)}
                className="pill knob !h-9 !w-9 flex-none justify-center"
              >
                <Icon name={CHANNELS[b.mode]?.icon ?? 'chat'} size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>

    </>
  )
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
