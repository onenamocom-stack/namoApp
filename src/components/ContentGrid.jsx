import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader } from './Cosmos.jsx'
import Icon from './Icon.jsx'
import { Kicker } from './Pop.jsx'
import Plate from './Plate.jsx'
import { ago, contentEarnings } from '../lib/content.js'

/**
 * Every reel, photo, post and blog a Pro or a Creator made (16 Oct 2026,
 * Rahul, after YouTube Studio's Shorts list): one row each — the thumbnail
 * on the left, then the title, how long ago and its numbers: views, likes,
 * comments, reshares and qualified views. A reel's thumbnail is its own
 * first frame at 9:16, whole, with its length; a photo's or a blog's is a
 * small 4:5. Views and qualified views are all time here; the Earnings tab
 * has the period.
 */
export default function ContentGrid() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    contentEarnings('lifetime')
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="border-b border-rule px-5 py-6">
      <Kicker>{data ? `Your content · ${data.posts.length}` : 'Your content'}</Kicker>
      {failed ? (
        <p className="mt-3 text-meta t-body">Could not load your content. Open this tab again.</p>
      ) : !data ? (
        <Loader className="py-6" />
      ) : data.posts.length === 0 ? (
        <p className="mt-3 text-meta t-faint">
          Nothing posted yet. Reels, photos and blogs you post from Home&apos;s + show here.
        </p>
      ) : (
        <ul className="mt-3 space-y-4">
          {data.posts.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </ul>
      )}
    </section>
  )
}

const KIND = { clip: 'Reel', article: 'Blog', post: 'Post', live_session: 'Live' }
const VIDEO = /\.(mp4|webm|mov)$/i

function length(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Thumb({ p }) {
  const [secs, setSecs] = useState(null)
  const video = p.media_url && VIDEO.test(p.media_url)
  const reel = p.kind === 'clip' || video
  return (
    <div className={`relative w-[76px] flex-none overflow-hidden rounded-xl bg-black/5 ${reel ? 'aspect-[9/16]' : 'aspect-[4/5]'}`}>
      {video ? (
        <video
          src={`${p.media_url}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={(e) => setSecs(e.currentTarget.duration)}
          className="h-full w-full bg-black object-cover"
        />
      ) : p.media_url ? (
        <img src={p.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Plate seed={p.id} className="h-full w-full !rounded-none !shadow-none" />
      )}
      {length(secs) && (
        <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-px text-[10px] font-semibold text-white tnum">
          {length(secs)}
        </span>
      )}
    </div>
  )
}

function Stat({ icon, n, tone = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <Icon name={icon} size={14} />
      {(n ?? 0).toLocaleString('en-IN')}
    </span>
  )
}

function Row({ p }) {
  const to = p.kind === 'clip' ? `/reels/${p.id}` : p.kind === 'article' ? `/read/${p.id}` : null
  const words = p.title || p.caption || KIND[p.kind] || 'Post'
  const inner = (
    <>
      <Thumb p={p} />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 text-meta font-semibold leading-snug t-heading">{words}</p>
        <p className="mt-1 text-[12px] t-faint">
          {KIND[p.kind] ?? 'Post'}
          {p.published_at ? ` · ${ago(p.published_at)}` : ''}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] t-sub tnum">
          <Stat icon="eye" n={p.views} />
          <Stat icon="heart" n={p.likes} />
          <Stat icon="chat" n={p.comments} />
          <Stat icon="repost" n={p.reposts} />
        </p>
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok tnum">
          <Icon name="check" size={11} />
          {p.qualified_views.toLocaleString('en-IN')} qualified
        </p>
      </div>
    </>
  )
  const cls = 'flex items-start gap-3.5'
  return <li>{to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>}</li>
}
