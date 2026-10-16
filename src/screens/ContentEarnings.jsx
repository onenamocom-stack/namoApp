import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Icon from '../components/Icon.jsx'
import { Kicker, PopCard, Stat } from '../components/Pop.jsx'
import { Segmented } from '../components/Primitives.jsx'
import { kindLabel, Thumb } from '../components/Pieces.jsx'
import { Insights, RANGES } from '../pro/ProEarnings.jsx'
import { contentEarnings } from '../lib/content.js'
import { rupees } from '../store.jsx'

/**
 * Content & Referrals: earnings and insights (16 Oct 2026, Rahul).
 *
 * Earnings is one figure, "Content earnings": what the period's qualified
 * views earned (₹20 per 1,000 by default, the console's) plus commission from
 * links, tags and code. The two are never shown apart (Rahul). Then every
 * reel, photo, post and blog the person made, with its views — every view,
 * the same person again too — and the period's qualified views: a reel
 * played 30 seconds, a blog read 30 seconds, a like, comment or reshare on a
 * post, once per person per post per day.
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
        {tab === 'insights' ? <Insights links={false} /> : <Earned />}
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
                Namo works out your content earnings from your views, qualified views and sales through your tags.
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

          <section className="px-5 py-6">
            <Kicker>{`Your content · ${data.posts.length}`}</Kicker>
            {data.posts.length === 0 ? (
              <p className="mt-3 text-meta t-faint">
                Nothing posted yet. Reels, photos and blogs you post from Home&apos;s + show here with their views.
              </p>
            ) : (
              <ul className="mt-2">
                {data.posts.map((p) => (
                  <PostRow key={p.id} p={p} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}

function PostRow({ p }) {
  const piece = { id: p.id, kind: p.kind, title: p.title, caption: p.caption, mediaUrl: p.media_url }
  const title = p.title || p.caption || kindLabel(piece) || 'Post'
  const to = p.kind === 'clip' ? `/reels/${p.id}` : p.kind === 'article' ? `/read/${p.id}` : null
  const body = (
    <>
      <Thumb piece={piece} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta t-heading">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] t-faint tnum">
          <span className="inline-flex items-center gap-1 font-semibold t-sub">
            <Icon name="eye" size={13} />
            {p.views.toLocaleString('en-IN')}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-ok">
            <Icon name="check" size={13} />
            {p.qualified_views.toLocaleString('en-IN')} qualified
          </span>
          <span>{kindLabel(piece)}</span>
        </span>
      </span>
    </>
  )
  const cls = 'flex w-full items-center gap-3 border-b border-rule py-3 last:border-b-0'
  return <li>{to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>
}
