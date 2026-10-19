import { useEffect, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { PopCard } from '../components/Pop.jsx'
import { myDailyReport } from '../lib/consultants.js'

/**
 * A Pro's day, scored (19 Oct 2026, Rahul): how long the Online switch was
 * on, calls received and answered by chat, audio and video, the score out of
 * 100, customers who recharged after reaching them, and their badge. Today
 * first, then the six days before. The server does the arithmetic
 * (`apps/consultants/report.py`); a video answered weighs 2, audio 1.5,
 * chat 1, and Online time is 30% of the score, 8 hours full marks. A day is
 * 00:00 to 24:00; yesterday's numbers arrive as a notification at 10 am.
 * Only the Pro's own report, here; the console has everybody's.
 */
const BADGE = { pro: 'Pro', expert: 'Expert', master: 'Master' }

function hm(seconds) {
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

function dayLabel(iso, i) {
  if (i === 0) return 'Today, so far'
  if (i === 1) return 'Yesterday'
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function tone(score) {
  return score >= 70 ? '#30a46c' : score >= 40 ? '#f5782c' : '#e5484d'
}

export default function DailyReport() {
  const [days, setDays] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    myDailyReport().then(setDays).catch(() => setFailed(true))
  }, [])

  return (
    <>
      <TopBar title="Daily report" back backTo="/studio" />
      {failed ? (
        <p className="px-5 py-10 text-center text-meta t-faint">Could not load your report. Open it again.</p>
      ) : !days ? (
        <Loader />
      ) : (
        <div className="space-y-3 px-4 pb-10 pt-4">
          <p className="px-1 text-micro t-sub">
            Score: calls answered out of calls received (a video counts double, an audio call one and a half) for 70,
            and time Online for 30 — 8 hours is full marks. Online time is counted from 19 Oct 2026.
          </p>
          {days.map((d, i) => (
            <PopCard key={d.day} className="p-4">
              <div className="flex items-center justify-between">
                <span>
                  <span className="block text-meta font-semibold t-heading">{dayLabel(d.day, i)}</span>
                  <span className="mt-0.5 inline-block rounded-full bg-gold/10 px-2 py-0.5 text-micro font-semibold text-gold-fill">
                    {BADGE[d.badge] || 'Pro'}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[28px] font-semibold leading-none tnum" style={{ color: tone(d.score) }}>
                    {d.score}
                  </span>
                  <span className="text-micro t-faint">out of 100</span>
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ['Online', hm(d.live_seconds)],
                  ['Received', d.received_total],
                  ['Answered', d.attended_total],
                  ['Recharged', d.recharged],
                ].map(([label, value]) => (
                  <span key={label} className="rounded-xl bg-surface px-1 py-2">
                    <span className="block text-body font-semibold t-heading tnum">{value}</span>
                    <span className="block text-[10px] t-faint">{label}</span>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-micro t-sub tnum">
                Chat {d.attended.chat}/{d.received.chat} · Audio {d.attended.audio}/{d.received.audio} · Video{' '}
                {d.attended.video}/{d.received.video} answered
              </p>
            </PopCard>
          ))}
        </div>
      )}
    </>
  )
}
