import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader } from './Cosmos.jsx'
import Icon from './Icon.jsx'
import { Kicker } from './Pop.jsx'
import Plate from './Plate.jsx'
import { contentEarnings } from '../lib/content.js'

/**
 * Every reel, photo, post and blog a Pro or a Creator made, as a two-column
 * masonry of cards (16 Oct 2026, Rahul: in Insights, the thumbnail in the
 * piece's own proportion — a square crop cut the reels — and the post's
 * likes, comments and reshares). The media takes its natural height: a
 * reel's first frame, a photo, a blog's cover. Views and qualified views are
 * all time here; the Earnings tab has the period.
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
        <div className="mt-3 columns-2 gap-3">
          {data.posts.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  )
}

const KIND = { clip: 'Reel', article: 'Blog', post: 'Post', live_session: 'Live' }
const VIDEO = /\.(mp4|webm|mov)$/i

function Card({ p }) {
  const to = p.kind === 'clip' ? `/reels/${p.id}` : p.kind === 'article' ? `/read/${p.id}` : null
  const words = p.title || p.caption || ''
  const media = !p.media_url ? (
    <Plate seed={p.id} className="aspect-[4/5] w-full !rounded-none !shadow-none" />
  ) : VIDEO.test(p.media_url) ? (
    <video src={`${p.media_url}#t=0.5`} preload="metadata" muted playsInline className="block h-auto w-full bg-black" />
  ) : (
    <img src={p.media_url} alt="" loading="lazy" className="block h-auto w-full" />
  )

  const inner = (
    <>
      <div className="relative overflow-hidden bg-surface2">
        {media}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
          {p.kind === 'clip' && <Icon name="play" size={10} />}
          {KIND[p.kind] ?? 'Post'}
        </span>
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-[12px] font-semibold text-white tnum">
          <Icon name="eye" size={13} />
          {p.views.toLocaleString('en-IN')}
        </span>
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        {words && <p className="line-clamp-2 text-[13px] leading-snug t-heading">{words}</p>}
        <p className="mt-1.5 flex items-center gap-2.5 text-[12px] t-faint tnum">
          <span className="inline-flex items-center gap-0.5">
            <Icon name="heart" size={12} />
            {p.likes ?? 0}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Icon name="chat" size={12} />
            {p.comments ?? 0}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Icon name="repost" size={12} />
            {p.reposts ?? 0}
          </span>
        </p>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-ok tnum">
          <Icon name="check" size={11} />
          {p.qualified_views.toLocaleString('en-IN')} qualified
        </p>
      </div>
    </>
  )
  const cls = 'mb-3 block break-inside-avoid overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-rule'
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
