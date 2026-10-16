import { useEffect, useState } from 'react'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { PopCard, Stat } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import ContentGrid from '../components/ContentGrid.jsx'
import { Insights, RANGES } from '../pro/ProEarnings.jsx'
import { contentEarnings } from '../lib/content.js'
import { rupees } from '../store.jsx'

/**
 * Content & Referrals: earnings and insights (16 Oct 2026, Rahul).
 *
 * Earnings is one figure, "Content earnings": what the period's qualified
 * views earned (₹20 per 1,000 by default, the console's) plus commission from
 * links, tags and code. The two are never shown apart (Rahul). Then the
 * period's views (every one, up to yesterday) and qualified views — a reel
 * played 30 seconds, a blog read 30 seconds, a like, comment or reshare on a
 * post, once per person per post per day — and lifetime views. Every piece
 * the person made is on the Insights tab (`ContentGrid`).
 *
 * The line under the figure is Rahul's intent in words that are true today:
 * no ads run yet, and nothing but the views and the tags decides the sum.
 * When ads run, the code changes and the line stays. Insights is the tab
 * that was on the mixed Earnings page.
 */
const TABS = [
  { key: 'earnings', label: 'Earnings' },
  { key: 'insights', label: 'Insights' },
]

export default function ContentEarnings() {
  const [tab, setTab] = useState('earnings')

  return (
    <>
      <TopBar title="Content & Referrals" back backTo="/dashboard" />
      <div className="px-4 pt-4">
        <Segmented items={TABS} value={tab} onChange={setTab} />
      </div>
      <div key={tab} className="animate-fade">
        {tab === 'insights' ? <Insights links={false} posts={<ContentGrid />} window="month" /> : <Earned />}
      </div>
      <div className="h-24" />
    </>
  )
}

function Earned() {
  const [range, setRange] = useState('this_month')
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setData(null)
    setFailed(false)
    contentEarnings(range)
      .then((d) => live && setData(d))
      .catch((err) => {
        console.error('[content earnings] load failed:', err?.message)
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [range])

  const label = RANGES.find((r) => r.key === range)?.label.toLowerCase()

  return (
    <>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
            className="pill flex-none text-meta"
          >
            {r.label}
          </button>
        ))}
      </div>

      {failed ? (
        <p className="px-5 py-8 text-meta t-body">Could not load your content earnings. Open this page again to retry.</p>
      ) : !data ? (
        <Loader label="Adding it up" className="py-8" />
      ) : (
        <>
          <section className="px-5 pb-2 pt-4">
            <PopCard raised className="p-5">
              <p className="caps-sm t-faint">Content earnings, {label}</p>
              <p className="mt-2 font-display text-huge leading-none tnum t-heading">₹{rupees(data.earnings_paise)}</p>
              <p className="mt-2 text-meta t-body">
                Namo works out your content earnings from your views, qualified views, sales through your tags and sign-ups with your code.
                When ads run between posts, they count too.
              </p>
            </PopCard>
          </section>

          <section className="border-b border-rule px-5 py-6">
            <div className="grid grid-cols-2 gap-3">
              {/* Up to yesterday; the number moves once a day (16 Oct 2026, Rahul). */}
              <Stat label={`Views, ${label}`} value={data.views.toLocaleString('en-IN')} sub="Till yesterday" />
              <Stat label={`Qualified views, ${label}`} value={data.qualified_views.toLocaleString('en-IN')} />
            </div>
            <p className="mt-3 text-micro t-faint">
              A qualified view is a reel played 30 seconds, a blog read 30 seconds, or a like, comment or reshare
              on a post. Once per person per post a day; your own do not count.
            </p>
            {/* Lifetime apart, below (16 Oct 2026, Rahul). */}
            <div className="mt-4 flex items-baseline justify-between rounded-xl bg-surface2 px-4 py-3">
              <span className="caps-sm t-faint">Lifetime views</span>
              <span className="text-lead font-semibold tnum t-heading">{(data.views_all_time ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </section>

          {/* Sign-ups with your code, ₹25 each (16 Oct 2026, Rahul). */}
          <section className="border-b border-rule px-5 py-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="caps-sm t-faint">Sign-ups with your code, {label}</p>
                <p className="mt-1 text-meta t-body tnum">{(data.signups?.count ?? 0).toLocaleString('en-IN')} joined</p>
              </div>
              <span className="text-lead font-semibold tnum t-heading">₹{rupees(data.signups?.paise ?? 0)}</span>
            </div>
            <p className="mt-2 text-micro t-faint">
              Each person who joins with your code or link adds to your content earnings. Find your code in Profile.
            </p>
          </section>

        </>
      )}
    </>
  )
}
