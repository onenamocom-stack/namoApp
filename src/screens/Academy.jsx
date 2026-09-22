import { useEffect, useState } from 'react'
import { TabHeader } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopAvatar, PopBar, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import { rupees, useStore } from '../store.jsx'
import { fetchEventLinks, fetchLessons, fetchMaterials, materialUrl, useAcademy } from '../lib/academy.js'

const TABS = [
  { key: 'courses', label: 'Courses' },
  { key: 'events', label: 'Events' },
  { key: 'downloads', label: 'Downloads' },
]

const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const hoursMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`)

const eventDate = (iso) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const eventTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

/** Academy — courses, live events and course PDFs, all real rows since phase 10b. */
export default function Academy() {
  const { session } = useStore()
  const [tab, setTab] = useState('courses')
  const academy = useAcademy(session)

  return (
    <>
      <TabHeader />

      <Segmented items={TABS} value={tab} onChange={setTab} />

      <div key={tab} className="animate-fade">
        {academy.status === 'error' ? (
          <p className="px-5 py-10 text-center text-meta t-faint">Could not reach the Academy. Try again.</p>
        ) : academy.status === 'loading' ? (
          <p className="px-5 py-10 text-center text-meta t-faint">Loading…</p>
        ) : (
          <>
            {tab === 'courses' && <Courses academy={academy} />}
            {tab === 'events' && <Events academy={academy} />}
            {tab === 'downloads' && <Downloads academy={academy} />}
          </>
        )}
      </div>

      <div className="h-24" />
    </>
  )
}

/**
 * The buy control for a course or event. Nothing charges until one of the two
 * pay buttons is pressed; a free item is one tap. The server prices it either
 * way — the number on the button is what it will say, not what it sends.
 */
function Enrol({ itemType, itemId, pricePaise, label = 'Enrol', disabled, onDone }) {
  const { session, balance, spending, enrolIn, showToast } = useStore()
  const [choosing, setChoosing] = useState(false)

  const go = async (pay) => {
    const res = await enrolIn(itemType, itemId, pay)
    if (!res.ok) return showToast(res.reason)
    setChoosing(false)
    showToast(res.settling ? 'Payment is still settling. Pull down in a moment.' : 'Enrolled')
    onDone()
  }

  if (!choosing) {
    return (
      <PopButton
        variant="gold"
        full={false}
        className="px-5"
        disabled={disabled || spending}
        onClick={() =>
          !session ? showToast('Sign in to enrol.') : pricePaise === 0 ? go('wallet') : setChoosing(true)
        }
      >
        {label}
      </PopButton>
    )
  }

  return (
    <div className="mt-4 flex w-full flex-col gap-2">
      <PopButton size="sm" variant="gold" disabled={spending} onClick={() => go('wallet')}>
        {spending ? 'Enrolling…' : `Pay ₹${rupees(pricePaise)} from wallet · ₹${balance === null ? '—' : rupees(balance)}`}
      </PopButton>
      <PopButton size="sm" disabled={spending} onClick={() => go('razorpay')}>
        Pay by card or UPI
      </PopButton>
      <button type="button" onClick={() => setChoosing(false)} className="caps-sm t-faint">
        Not now
      </button>
    </div>
  )
}

function Courses({ academy }) {
  const { courses, enrolled, reload } = academy
  if (!courses.length) {
    return <p className="px-5 py-10 text-center text-meta t-faint">No courses yet. New ones will appear here.</p>
  }
  const mine = courses.filter((c) => enrolled.has(`course:${c.id}`))

  return (
    <>
      {mine.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Your courses</Kicker>
          <ul className="mt-4 space-y-3">
            {mine.map((c) => (
              <li key={c.id}>
                <MyCourse course={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="px-5 py-6">
        <Kicker>All courses</Kicker>
        <ul className="mt-4 space-y-4">
          {courses.map((c) => {
            const isMine = enrolled.has(`course:${c.id}`)
            return (
              <li key={c.id}>
                <PopCard className="overflow-hidden">
                  <Plate seed={`${c.id}-cover`} className="aspect-video w-full">
                    {c.level && (
                      <span className="absolute left-3 top-3">
                        <PopTag tone="gold">{c.level}</PopTag>
                      </span>
                    )}
                  </Plate>

                  <div className="p-4">
                    <p className="text-body t-heading">{c.title}</p>
                    {c.summary && <p className="mt-2 text-meta t-sub">{c.summary}</p>}

                    <div className="mt-3 flex items-center gap-3">
                      <PopAvatar initials={initialsOf(c.tutor)} size={26} />
                      <span className="min-w-0 flex-1 truncate caps-sm t-faint">{c.tutor}</span>
                      <span className="flex-none caps-sm t-faint tnum">
                        {plural(c.outline.length, 'lesson')}{c.minutes ? ` · ${hoursMinutes(c.minutes)}` : ''}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <p className="flex-1 text-lead gold tnum">
                        {c.pricePaise === 0 ? 'Free' : `₹${rupees(c.pricePaise)}`}
                      </p>
                      {isMine ? (
                        <PopTag tone="gold">Enrolled</PopTag>
                      ) : (
                        <Enrol itemType="course" itemId={c.id} pricePaise={c.pricePaise} onDone={reload} />
                      )}
                    </div>
                  </div>
                </PopCard>
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}

/** An enrolled course: the lessons, with their links. Read under RLS — an
 *  empty list here for an enrolled person means the enrolment is not active. */
function MyCourse({ course: c }) {
  const [lessons, setLessons] = useState(null)

  useEffect(() => {
    let active = true
    fetchLessons(c.id)
      .then((rows) => active && setLessons(rows))
      .catch((err) => {
        console.error('[academy] lessons:', err.message)
        if (active) setLessons([])
      })
    return () => {
      active = false
    }
  }, [c.id])

  return (
    <PopCard raised className="p-4">
      <div className="flex items-start gap-3">
        <Plate seed={c.id} className="h-14 w-14 flex-none" />
        <div className="min-w-0 flex-1">
          <p className="text-body t-heading">{c.title}</p>
          <p className="mt-1 caps-sm t-faint">{c.tutor}</p>
        </div>
      </div>
      {lessons === null ? (
        <p className="mt-4 text-meta t-faint">Loading lessons…</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {lessons.map((l, i) => (
            <li key={l.id} className="pop-inset flex items-center gap-3 p-3">
              <span className="caps-sm gold tnum">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-meta t-heading">{l.title}</span>
                {l.minutes && <span className="caps-sm t-faint tnum">{l.minutes} min</span>}
              </span>
              <PopButton size="sm" href={l.video_url} variant="gold" full={false} className="px-4">
                Watch
              </PopButton>
            </li>
          ))}
        </ol>
      )}
    </PopCard>
  )
}

function Events({ academy }) {
  const { session } = useStore()
  const { events, enrolled, reload } = academy
  const [links, setLinks] = useState({})

  const enrolledKey = [...enrolled].join(',')
  useEffect(() => {
    if (!session) return
    let active = true
    fetchEventLinks()
      .then((l) => active && setLinks(l))
      .catch((err) => console.error('[academy] event links:', err.message))
    return () => {
      active = false
    }
  }, [session, enrolledKey])

  if (!events.length) {
    return <p className="px-5 py-10 text-center text-meta t-faint">No events scheduled. New ones will appear here.</p>
  }

  return (
    <section className="px-5 py-6">
      <Kicker>Webinars &amp; seminars</Kicker>
      <ul className="mt-4 space-y-4">
        {events.map((e) => {
          const joined = enrolled.has(`event:${e.id}`)
          const full = e.seatsLeft <= 0
          const started = new Date(e.startsAt) <= new Date()

          return (
            <li key={e.id}>
              <PopCard className="overflow-hidden">
                <Plate seed={`${e.id}-cover`} variant="orbit" className="aspect-[21/9] w-full">
                  <span className="absolute left-3 top-3">
                    <PopTag tone={e.pricePaise === 0 && !e.cancelled ? 'gold' : 'default'}>
                      {e.cancelled ? 'Cancelled' : e.pricePaise === 0 ? 'Free' : e.kind}
                    </PopTag>
                  </span>
                  <span className="caps-sm absolute bottom-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 shadow-sm t-sub tnum">
                    {eventDate(e.startsAt)} · {eventTime(e.startsAt)}
                  </span>
                </Plate>

                <div className="p-4">
                  <p className="text-body t-heading">{e.title}</p>
                  {e.summary && <p className="mt-2 text-meta t-sub">{e.summary}</p>}

                  <div className="mt-4 flex items-center gap-3">
                    <PopAvatar initials={initialsOf(e.host)} size={28} />
                    <span className="min-w-0 flex-1 truncate caps-sm t-faint">{e.host}</span>
                    <span className="flex-none caps-sm tnum t-faint">
                      {e.cancelled ? '' : full ? 'Sold out' : `${plural(e.seatsLeft, 'seat')} left`}
                    </span>
                  </div>

                  <PopBar value={((e.seats - e.seatsLeft) / e.seats) * 100} className="mt-3" />

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <p className="flex-1 text-meta tnum t-sub">
                      {e.pricePaise === 0 ? 'No charge' : `₹${rupees(e.pricePaise)}`} · {hoursMinutes(e.minutes)}
                    </p>
                    {e.cancelled ? (
                      <span className="caps-sm t-faint">Paid seats refunded to the wallet</span>
                    ) : joined ? (
                      links[e.id] ? (
                        <PopButton href={links[e.id]} variant="gold" full={false} className="px-5">
                          Join
                        </PopButton>
                      ) : (
                        <PopTag tone="gold">Enrolled</PopTag>
                      )
                    ) : (
                      <Enrol
                        itemType="event"
                        itemId={e.id}
                        pricePaise={e.pricePaise}
                        label={full ? 'Sold out' : started ? 'Started' : e.pricePaise === 0 ? 'Join free' : 'Enrol'}
                        disabled={full || started}
                        onDone={reload}
                      />
                    )}
                  </div>
                </div>
              </PopCard>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Downloads({ academy }) {
  const { session, showToast } = useStore()
  const [materials, setMaterials] = useState(null)

  const enrolledKey = [...academy.enrolled].join(',')
  useEffect(() => {
    if (!session) return
    let active = true
    fetchMaterials()
      .then((rows) => active && setMaterials(rows))
      .catch((err) => {
        console.error('[academy] materials:', err.message)
        if (active) setMaterials([])
      })
    return () => {
      active = false
    }
  }, [session, enrolledKey])

  const open = async (m) => {
    // Opened before the await, or the browser treats it as an unrequested popup.
    const tab = window.open('', '_blank')
    try {
      const url = await materialUrl(m.path)
      if (tab) tab.location = url
      else window.location.assign(url)
    } catch (err) {
      tab?.close()
      console.error('[academy] open pdf:', err.message)
      showToast('Could not open that file.')
    }
  }

  if (!session) {
    return <p className="px-5 py-10 text-center text-meta t-faint">Sign in to see the PDFs from your courses.</p>
  }
  if (materials === null) {
    return <p className="px-5 py-10 text-center text-meta t-faint">Loading…</p>
  }
  if (!materials.length) {
    return <p className="px-5 py-10 text-center text-meta t-faint">PDFs from courses you enrol in appear here.</p>
  }

  return (
    <section className="px-5 py-6">
      <Kicker>From your courses</Kicker>
      <ul className="mt-4 space-y-3">
        {materials.map((m) => (
          <li key={m.id}>
            <PopCard className="flex items-center gap-3 p-4">
              <PopTag>PDF</PopTag>
              <div className="min-w-0 flex-1">
                <p className="truncate text-meta t-heading">{m.title}</p>
                <p className="mt-1 caps-sm t-faint">
                  {m.course}
                  {m.sizeBytes ? ` · ${Math.max(1, Math.round(m.sizeBytes / 1024))} KB` : ''}
                </p>
              </div>
              <PopButton onClick={() => open(m)} full={false} className="flex-none px-4">
                Open
              </PopButton>
            </PopCard>
          </li>
        ))}
      </ul>
    </section>
  )
}
