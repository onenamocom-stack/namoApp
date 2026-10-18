import { useEffect, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopButton } from '../components/Pop.jsx'
import { blockDates, listBlocked, loadWeek, saveWeek, unblockDates } from '../lib/consultants.js'
import { isPro } from '../side.js'
import { useStore } from '../store.jsx'

/**
 * The booking calendar (15 Oct 2026, Rahul, after TidyCal): each day of the
 * week on or off, with up to two windows ("9 to 12, 4 to 7"); a customer
 * books 20 minutes inside one. Below, whole days blocked off. The server
 * turns the windows into the 20-minute slots the booking sheet offers, so
 * Save is the only write; a booking already made stands whatever changes.
 */

// Monday first, as the rest of the app; the server's weekday is 0 = Sunday.
const DAYS = [['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5], ['Saturday', 6], ['Sunday', 0]]
const MAX_WINDOWS = 2
const NEW_WINDOW = [{ from: '09:00', to: '12:00' }, { from: '16:00', to: '19:00' }]

const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** What is wrong with a day's windows, or null. */
function problem(windows) {
  const spans = windows.map((w) => [minutes(w.from), minutes(w.to)]).sort((a, b) => a[0] - b[0])
  for (let i = 0; i < spans.length; i++) {
    if (spans[i][1] - spans[i][0] < 20) return 'Each window is at least 20 minutes.'
    if (i && spans[i][0] < spans[i - 1][1]) return 'The two windows overlap.'
  }
  return null
}

const ddmm = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 flex-none rounded-full transition-colors ${on ? 'bg-gold-fill' : 'bg-rule'}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export default function ProCalendar() {
  const { consultant, showToast } = useStore()
  const me = consultant?.profile_id
  const [days, setDays] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [blocked, setBlocked] = useState([])
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')

  useEffect(() => {
    if (!me) return
    loadWeek(me).then((w) => setDays(w ?? {}))
    listBlocked(me).then((rows) => setBlocked(rows ?? []))
  }, [me])

  const change = (dow, windows) => {
    setDays((d) => ({ ...d, [dow]: windows }))
    setDirty(true)
  }

  const save = async () => {
    const bad = DAYS.find(([, dow]) => problem(days[dow] || []))
    if (bad) return showToast(`${bad[0]}: ${problem(days[bad[1]])}`)
    setSaving(true)
    const res = await saveWeek(me, days)
    setSaving(false)
    if (!res.ok) return showToast(res.reason)
    setDays(res.days)
    setDirty(false)
    showToast('Calendar saved')
  }

  const block = async () => {
    if (!first) return showToast('Pick a day.')
    const res = await blockDates(me, first, last || first)
    if (!res.ok) return showToast(res.reason)
    setBlocked(res.rows)
    setFirst('')
    setLast('')
    showToast('Blocked')
  }

  return (
    <>
      <TopBar title="Booking calendar" back backTo={isPro ? '/pro/consult' : '/studio'} />
      {days === null ? (
        <Loader label="Loading" className="py-24" />
      ) : (
        <>
          <section className="px-5 pt-4">
            <p className="text-meta t-body">
              Set the hours you take bookings, day by day. Customers book 20 minutes inside them.
            </p>
          </section>

          <section className="mx-4 mt-4 divide-y divide-rule rounded-2xl border border-rule bg-white">
            {DAYS.map(([name, dow]) => {
              const windows = days[dow] || []
              const on = windows.length > 0
              const why = problem(windows)
              return (
                <div key={dow} className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Switch on={on} label={name} onChange={(v) => change(dow, v ? [NEW_WINDOW[0]] : [])} />
                    <span className="text-body t-heading">{name}</span>
                  </div>
                  {!on && <p className="mt-2 text-meta t-faint">Not taking bookings</p>}
                  {windows.map((w, i) => (
                    <div key={i} className="mt-3 flex items-center gap-2">
                      <input
                        type="time"
                        step="300"
                        value={w.from}
                        aria-label={`${name} from`}
                        onChange={(e) => change(dow, windows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
                        className="h-11 rounded-xl border border-rule bg-white px-3 text-body text-t1 outline-none focus:border-gold-fill min-w-0 flex-1 tnum"
                      />
                      <span className="text-meta t-faint">to</span>
                      <input
                        type="time"
                        step="300"
                        value={w.to}
                        aria-label={`${name} to`}
                        onChange={(e) => change(dow, windows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                        className="h-11 rounded-xl border border-rule bg-white px-3 text-body text-t1 outline-none focus:border-gold-fill min-w-0 flex-1 tnum"
                      />
                      <button
                        type="button"
                        aria-label="Remove this window"
                        onClick={() => change(dow, windows.filter((_, j) => j !== i))}
                        className="pill knob !h-9 !w-9 flex-none justify-center"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                  {why && <p className="mt-2 text-micro text-bad">{why}</p>}
                  {windows.length < MAX_WINDOWS && (
                    <button
                      type="button"
                      onClick={() => change(dow, [...windows, NEW_WINDOW[windows.length]])}
                      className="mt-3 caps-sm gold"
                    >
                      + New window
                    </button>
                  )}
                </div>
              )
            })}
          </section>

          <section className="px-5 pb-4 pt-8">
            <Kicker>Blocked dates</Kicker>
            <p className="mt-2 text-meta t-body">Days you take no bookings, whatever the week says.</p>
            <div className="mt-3 flex items-center gap-2">
              <input type="date" min={todayIst()} value={first} aria-label="First day"
                onChange={(e) => setFirst(e.target.value)} className="h-11 rounded-xl border border-rule bg-white px-3 text-body text-t1 outline-none focus:border-gold-fill min-w-0 flex-1" />
              <span className="text-meta t-faint">to</span>
              <input type="date" min={first || todayIst()} value={last} aria-label="Last day (optional)"
                onChange={(e) => setLast(e.target.value)} className="h-11 rounded-xl border border-rule bg-white px-3 text-body text-t1 outline-none focus:border-gold-fill min-w-0 flex-1" />
            </div>
            <PopButton variant="ghost" className="mt-3" onClick={block}>Add blocked dates</PopButton>
            <ul className="mt-3">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between border-b border-rule py-3 last:border-b-0">
                  <span className="text-meta t-heading">{b.from === b.to ? ddmm(b.from) : `${ddmm(b.from)} to ${ddmm(b.to)}`}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const rows = await unblockDates(me, b.id)
                      if (rows) setBlocked(rows)
                    }}
                    className="caps-sm text-bad"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="h-24" />
          <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-rule bg-white px-5 py-3">
            <PopButton disabled={!dirty || saving} onClick={save}>{saving ? 'Saving' : 'Save calendar'}</PopButton>
          </div>
        </>
      )}
    </>
  )
}
