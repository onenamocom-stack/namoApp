import { useState } from 'react'
import { academyEvents, courses, downloads } from '../data/mock.js'
import { TabHeader } from '../components/Chrome.jsx'
import Plate from '../components/Plate.jsx'
import { Kicker, PopAvatar, PopBar, PopButton, PopCard, PopTag } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import { useStore } from '../store.jsx'

const TABS = [
  { key: 'courses', label: 'Courses' },
  { key: 'events', label: 'Events' },
  { key: 'downloads', label: 'Downloads' },
]

/** Academy — courses, live events and saved content. */
export default function Academy() {
  const [tab, setTab] = useState('courses')

  return (
    <>
      <TabHeader />

      <Segmented items={TABS} value={tab} onChange={setTab} />

      <div key={tab} className="animate-fade">
        {tab === 'courses' && <Courses />}
        {tab === 'events' && <Events />}
        {tab === 'downloads' && <Downloads />}
      </div>

      <div className="h-24" />
    </>
  )
}

function Courses() {
  const { showToast } = useStore()
  const inProgress = courses.filter((c) => c.progress > 0)

  return (
    <>
      {inProgress.length > 0 && (
        <section className="border-b border-rule px-5 py-6">
          <Kicker>Continue</Kicker>
          <ul className="mt-4 space-y-3">
            {inProgress.map((c) => (
              <li key={c.id}>
                <PopCard raised className="p-4">
                  <div className="flex items-start gap-3">
                    <Plate seed={c.id} className="h-14 w-14 flex-none" />
                    <div className="min-w-0 flex-1">
                      <p className="text-body t-heading">{c.title}</p>
                      <p className="mt-1 caps-sm t-faint tnum">{c.tutor}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="caps-sm t-faint">Progress</span>
                      <span className="caps-sm gold tnum">{c.progress}%</span>
                    </div>
                    <PopBar value={c.progress} />
                  </div>
                  <PopButton size="sm" href={c.url} variant="gold" className="mt-4">
                    Resume · watch now
                  </PopButton>
                </PopCard>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="px-5 py-6">
        <Kicker>All courses</Kicker>
        <ul className="mt-4 space-y-4">
          {courses.map((c) => (
            <li key={c.id}>
              <PopCard className="overflow-hidden">
                <Plate seed={`${c.id}-cover`} className="aspect-video w-full">
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="is-round flex h-12 w-12 items-center justify-center border border-gold bg-bg gold"
                    >
                      <span className="caps-sm leading-none">▶</span>
                    </span>
                  </span>
                  <span className="absolute left-3 top-3">
                    <PopTag tone="gold">{c.level}</PopTag>
                  </span>
                </Plate>

                <div className="p-4">
                  <p className="text-body t-heading">{c.title}</p>

                  <div className="mt-3 flex items-center gap-3">
                    <PopAvatar initials={c.initials} size={26} />
                    <span className="min-w-0 flex-1 truncate caps-sm t-faint">{c.tutor}</span>
                    <span className="flex-none caps-sm t-faint tnum">
                      {c.lessons} · {c.duration}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <p className="flex-1 text-lead gold tnum">
                      ₹{c.price.toLocaleString('en-IN')}
                    </p>
                    <PopButton
                      onClick={() => showToast(`Enrolled · ${c.title}`)}
                      full={false}
                      className="px-4"
                    >
                      Enrol
                    </PopButton>
                    <PopButton size="sm" href={c.url} variant="gold" full={false} className="px-4">
                      Watch
                    </PopButton>
                  </div>
                </div>
              </PopCard>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function Events() {
  const { showToast, hasFlag, toggleFlag } = useStore()

  return (
    <section className="px-5 py-6">
      <Kicker>Webinars &amp; seminars</Kicker>
      <ul className="mt-4 space-y-4">
        {academyEvents.map((e) => {
          const full = e.taken >= e.seats
          const joined = hasFlag(`event:${e.id}`)
          const left = e.seats - e.taken

          return (
            <li key={e.id}>
              <PopCard className="overflow-hidden">
                {/* A cover, so an event reads as the same kind of object as a
                    course. Without one these were settings rows sitting next
                    to cards. */}
                <Plate seed={`${e.id}-cover`} variant="orbit" className="aspect-[21/9] w-full">
                  <span className="absolute left-3 top-3">
                    <PopTag tone={e.price === 0 ? 'gold' : 'default'}>
                      {e.price === 0 ? 'Free' : e.kind}
                    </PopTag>
                  </span>
                  <span className="caps-sm absolute bottom-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 shadow-sm t-sub tnum">
                    {e.date} · {e.time}
                  </span>
                </Plate>

                <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body t-heading">{e.title}</p>
                  </div>
                  <div className="flex-none text-right">
                    <p className="caps-sm t-faint tnum">{e.date}</p>
                    <p className="mt-1 text-meta gold tnum">{e.time}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <PopAvatar initials={e.initials} size={28} />
                  <span className="min-w-0 flex-1 truncate caps-sm t-faint">{e.host}</span>
                  <span className="flex-none caps-sm tnum t-faint">
                    {full ? 'Sold out' : `${left} seats left`}
                  </span>
                </div>

                {/* Seat fill, drawn on the same rail as course progress. */}
                <PopBar value={(e.taken / e.seats) * 100} className="mt-3" />

                <div className="mt-4 flex items-center gap-3">
                  <p className="flex-1 text-meta tnum t-sub">
                    {e.price === 0 ? 'No charge' : `₹${e.price.toLocaleString('en-IN')}`}
                  </p>
                  <PopButton
                    variant={joined ? 'default' : 'gold'}
                    disabled={full && !joined}
                    onClick={() =>
                      full
                        ? showToast('That one is full')
                        : toggleFlag(`event:${e.id}`, {
                            on: `Enrolled · ${e.title}`,
                            off: 'Enrolment cancelled',
                          })
                    }
                    full={false}
                    className="px-5"
                  >
                    {full && !joined ? 'Sold out' : joined ? 'Enrolled' : 'Enrol'}
                  </PopButton>
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

function Downloads() {
  const { showToast } = useStore()

  return (
    <section className="px-5 py-6">
      <Kicker>Saved to this device</Kicker>
      <ul className="mt-4 space-y-4">
        {downloads.map((d) => (
          <li key={d.id}>
            <PopCard className="overflow-hidden">
              <Plate seed={`${d.id}-cover`} variant="contour" className="aspect-[21/9] w-full">
                <span className="absolute left-3 top-3">
                  <PopTag>{d.kind}</PopTag>
                </span>
                <span className="caps-sm absolute bottom-3 left-3 rounded-full bg-surface/90 px-2.5 py-1 shadow-sm t-sub tnum">
                  {d.size} · {d.saved}
                </span>
              </Plate>

              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-meta t-heading">{d.title}</p>
                  <p className="mt-1 caps-sm t-faint">From {d.course}</p>
                </div>
                <PopButton
                  onClick={() => showToast(`Opening ${d.kind.toLowerCase()}`)}
                  full={false}
                  className="flex-none px-4"
                >
                  {d.kind === 'Video' ? 'Play' : 'Open'}
                </PopButton>
              </div>
            </PopCard>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-center text-meta t-faint">
        Downloads are a prototype list. Nothing is actually stored on the device.
      </p>
    </section>
  )
}
