import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TabHeader } from '../components/Chrome.jsx'
import { DeskHeader } from '../components/ProHeader.jsx'
import { isPro } from '../side.js'
import { callPath, proPath } from '../lib/dashboard.js'
import Icon from '../components/Icon.jsx'
import { Kicker, PopAvatar, PopButton, PopTag } from '../components/Pop.jsx'
import { Segmented, firstName } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import {
  decideBooking,
  listBookings,
} from '../lib/consultants.js'
import { acceptChat, listSessions, subscribeToRequests } from '../lib/chat.js'

/**
 * Consult — everything that runs today's practice, bundled: who is asking,
 * who is booked, and how you reach them. Sessions/Chat/Call are one screen
 * rather than three routes because they are three views onto the same
 * roster, not three separate places.
 *
 * Phase 4 made all of it real. The queue is `bookings` rows, Accept and
 * Decline are status writes the database validates, and the availability grid
 * writes `consultant_availability`. The one thing that has not changed is
 * where the open slots come from — except that now it is the same place the
 * seeker's booking sheet reads, which is the entire point of the phase.
 */
const TABS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'chat', label: 'Chat' },
  { key: 'call', label: 'Call' },
]

export default function ProConsult() {
  const { consultant, consultantError, openChat } = useStore()
  const [tab, setTab] = useState('sessions')
  const [rows, setRows] = useState(null)

  const me = consultant?.profile_id

  const reload = useCallback(() => {
    if (!me) return
    listBookings(me).then(setRows)
  }, [me])

  useEffect(() => {
    reload()
  }, [reload])

  const bookings = rows ?? []
  const pending = bookings.filter((b) => b.status === 'pending')
  const approved = consultant?.status === 'approved'

  return (
    <>
      {isPro ? (
        <TabHeader
          action={pending.length > 0 ? <PopTag tone="gold">{pending.length} waiting</PopTag> : null}
        />
      ) : (
        <DeskHeader />
      )}

      {/* ── Whether clients can see you at all ────────────────────────────
          This was a toggle backed by a browser flag, on a `pro.online` field
          no table has. It is now the one thing that actually decides whether
          you are bookable: `consultants.status`, which is the predicate on
          every public read of your practice. It is not yours to flip. */}
      <section className="px-5 pb-2 pt-5">
        <div className="pop-card flex items-center gap-3 p-4">
          <span
            className={`h-2.5 w-2.5 flex-none rounded-full ${approved ? 'bg-ok' : 'bg-t4'}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            {/* Three states, not two. `consultant` is null both when there is
                no row and when the read failed, and telling somebody they are
                not approved because a request timed out is the same mistake
                as sending them to the signup form. */}
            <span className="block text-meta t-heading">
              {consultantError ? 'Could not check your status' : approved ? 'Visible to clients' : 'Not yet approved'}
            </span>
            <span className="mt-0.5 block caps-sm t-faint">
              {consultantError
                ? 'The connection failed. This says nothing about your practice'
                : approved
                  ? 'You are in search and open for bookings'
                  : 'Invisible, unbookable and earning nothing until we approve you'}
            </span>
          </span>
        </div>
      </section>

      <div className="px-4 pt-4">
        <Segmented items={TABS} value={tab} onChange={setTab} />
      </div>

      <div key={tab} className="animate-fade">
        {tab === 'sessions' && (
          <Sessions me={me} rows={rows} bookings={bookings} reload={reload} />
        )}
        {tab === 'chat' && <Chat onOpen={() => openChat('live')} />}
        {tab === 'call' && <Call />}
      </div>

      <div className="h-24" />
    </>
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

function Sessions({ me, rows, bookings, reload }) {
  const { showToast, openChat } = useStore()
  const navigate = useNavigate()
  /* Incoming CHAT requests. These are not bookings: nobody has been charged,
     the seeker is sitting there waiting, and accepting is what starts both the
     conversation and the meter. Realtime rather than polling, because a
     request nobody sees for thirty seconds is a seeker who has left. */
  const [requests, setRequests] = useState([])

  const loadRequests = useCallback(() => {
    if (!me) return
    listSessions().then((all) =>
      setRequests(all.filter((s) => s.consultant_id === me && s.status === 'requested')),
    )
  }, [me])

  useEffect(() => {
    if (!me) return
    loadRequests()
    return subscribeToRequests(me, loadRequests)
  }, [me, loadRequests])

  const takeChat = async (sess) => {
    const res = await acceptChat(sess.id)
    if (!res?.ok) return showToast(res?.reason ?? 'Could not start that session.')
    loadRequests()
    // A call goes to the call screen; a chat opens on its conversation.
    if ((res.mode ?? sess.mode) !== 'chat') return navigate(callPath(sess.id))
    showToast(`Live · ${res.minutes_held} min held`)
    openChat('live', res.thread_id ?? null)
  }
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
  const done = bookings.filter((b) => b.status === 'completed')

  return (
    <>
      {/* ── Requests ───────────────────────────────────────────────────── */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker>
          {rows === null
            ? 'Reading the queue'
            : pending.length === 0
              ? 'No requests waiting'
              : `${pending.length} requests`}
        </Kicker>

        {pending.length === 0 ? (
          <p className="mt-3 text-meta t-faint">
            Everything is answered. The queue fills again when someone books.
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

      {/* ── Chat requests ─────────────────────────────────────────────────
          Someone is waiting right now. Nothing has been charged yet — the hold
          is taken and the clock starts the moment this is accepted, which is
          why the rate is on the button rather than buried in a confirmation. */}
      {requests.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>{`${requests.length} waiting to chat`}</Kicker>
          <ul className="mt-4 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="pop-inset flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta t-heading">Chat request</span>
                  <span className="mt-0.5 block caps-sm t-faint tnum">
                    ₹{rupees(r.rate_paise)}/min · asked{' '}
                    {new Date(r.requested_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <PopButton size="sm" variant="gold" full={false} onClick={() => takeChat(r)}>
                  Join
                </PopButton>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {/* ── Availability: the booking calendar, its own page since 15 Oct
          2026 (Rahul) — the week as windows, 20-minute bookings. */}
      <section className="border-b border-rule px-5 py-6">
        <Kicker action="Open" to={proPath('/pro/calendar')}>Booking calendar</Kicker>
        <p className="mt-2 text-meta t-body">
          Set your hours each day of the week. Customers book 20 minutes inside them.
        </p>
      </section>

      {/* ── Done ───────────────────────────────────────────────────────── */}
      <section className="px-5 py-6">
        <Kicker action="Earnings" to={proPath('/pro/earnings')}>
          Finished
        </Kicker>
        <ul className="mt-3">
          {done.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-4 border-b border-rule py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-meta t-sub">{b.seeker_name}</span>
                <span className="mt-0.5 block caps-sm t-faint">{dayLabel(b.starts_at)}</span>
              </span>
              <span className="flex-none text-meta tnum t-heading">
                ₹{rupees(b.amount_paise)}
              </span>
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

/** Chat — the store already owns the whole inbox; this is the entry point. */
function Chat({ onOpen }) {
  return (
    <section className="px-5 py-6">
      <Kicker>Messages</Kicker>
      <button type="button" onClick={onOpen} className="pop-card pop-tap mt-4 flex w-full items-center gap-3 p-4">
        <span className="pill knob !h-10 !w-10 flex-none justify-center">
          <Icon name="chat" size={18} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-meta t-heading">Open your inbox</span>
          <span className="mt-0.5 block caps-sm t-faint">Every client thread, in one panel</span>
        </span>
      </button>
    </section>
  )
}

/** Call — where calls arrive (14 Oct 2026: it was a "Pick up" card that
 *  toasted "prototype only"). A client's call rings at the top of the
 *  screen while you are online; there is nothing to press here. */
function Call() {
  return (
    <section className="px-5 py-6">
      <Kicker>Incoming calls</Kicker>
      <div className="pop-card mt-4 flex items-center gap-3 p-4">
        <span className="pill knob !h-10 !w-10 flex-none justify-center">
          <Icon name="phone" size={18} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-meta t-heading">Calls ring at the top of the screen</span>
          <span className="mt-0.5 block caps-sm t-faint">Stay online. Answer or decline there</span>
        </span>
      </div>
    </section>
  )
}
