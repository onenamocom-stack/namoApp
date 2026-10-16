import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader } from './Cosmos.jsx'
import Icon from './Icon.jsx'
import { Kicker } from './Pop.jsx'
import Plate from './Plate.jsx'
import { ago, contentEarnings } from '../lib/content.js'

/**
 * A Pro's or a Creator's content on their Insights tab (16 Oct 2026, Rahul):
 * rows that slide left to right, by kind — Reels, then Images (photos and
 * text posts), then Blogs — each card with its views, likes, comments,
 * reshares and qualified views; then **Sales from tags and referrals**, what
 * sold through their tags and links together, each with its number of
 * sales. A reel's thumbnail is its own first frame whole at 9:16, with its
 * length. All time: the Earnings tab has the period.
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

  if (failed) return <p className="border-b border-rule px-5 py-6 text-meta t-body">Could not load your content. Open this tab again.</p>
  if (!data) return <Loader className="py-6" />

  const reels = data.posts.filter((p) => p.kind === 'clip')
  const images = data.posts.filter((p) => p.kind === 'post')
  const blogs = data.posts.filter((p) => p.kind === 'article')
  const sales = data.sales ?? []

  return (
    <>
      <Shelf title="Reels" count={reels.length} empty="No reels yet. Post one from Home's +.">
        {reels.map((p) => (
          <PieceCard key={p.id} p={p} width="w-[132px]" aspect="aspect-[9/16]" to={`/reels/${p.id}`} />
        ))}
      </Shelf>
      <Shelf title="Images" count={images.length} empty="No photos or posts yet.">
        {images.map((p) => (
          <PieceCard key={p.id} p={p} width="w-[150px]" aspect="aspect-[4/5]" />
        ))}
      </Shelf>
      <Shelf title="Blogs" count={blogs.length} empty="No blogs yet.">
        {blogs.map((p) => (
          <PieceCard key={p.id} p={p} width="w-[190px]" aspect="aspect-[16/10]" to={`/read/${p.id}`} />
        ))}
      </Shelf>
      <Shelf
        title="Sales from tags and referrals"
        count={sales.reduce((s, x) => s + x.sales, 0)}
        empty="Nothing sold through your tags or links yet. Tag products on your posts, or share a product link."
      >
        {sales.map((x) => (
          <SaleCard key={`${x.kind}:${x.id}`} x={x} />
        ))}
      </Shelf>
    </>
  )
}

function Shelf({ title, count, empty, children }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <section className="border-b border-rule py-6">
      <div className="flex items-center gap-2 px-5">
        <Kicker>{title}</Kicker>
        <span className="rounded-full bg-surface2 px-2 py-0.5 text-micro font-semibold t-sub tnum">{count}</span>
      </div>
      {has ? (
        <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">{children}</div>
      ) : (
        <p className="mt-3 px-5 text-meta t-faint">{empty}</p>
      )}
    </section>
  )
}

const VIDEO = /\.(mp4|webm|mov)$/i

function length(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Media({ p, aspect }) {
  const [secs, setSecs] = useState(null)
  const words = p.title || p.caption || ''
  return (
    <div className={`relative w-full overflow-hidden rounded-xl bg-surface2 ${aspect}`}>
      {p.media_url && VIDEO.test(p.media_url) ? (
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
        // A text post: its words on the tile.
        <div className="flex h-full w-full items-center bg-gradient-to-br from-[var(--orange-hi)] to-[var(--orange-lo)] p-3">
          <p className="line-clamp-5 text-[13px] font-semibold leading-snug text-white">{words}</p>
        </div>
      )}
      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white tnum">
        <Icon name="eye" size={10} />
        {p.views.toLocaleString('en-IN')}
      </span>
      {length(secs) && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-px text-[10px] font-semibold text-white tnum">
          {length(secs)}
        </span>
      )}
    </div>
  )
}

function Count({ icon, n }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon name={icon} size={11} />
      {(n ?? 0).toLocaleString('en-IN')}
    </span>
  )
}

function PieceCard({ p, width, aspect, to }) {
  const words = p.title || p.caption || ''
  const inner = (
    <>
      <Media p={p} aspect={aspect} />
      {words && p.media_url && <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-snug t-heading">{words}</p>}
      <p className="mt-1 text-[11px] t-faint">{p.published_at ? ago(p.published_at) : ''}</p>
      <p className="mt-1 flex items-center gap-2 text-[11px] t-sub tnum">
        <Count icon="heart" n={p.likes} />
        <Count icon="chat" n={p.comments} />
        <Count icon="repost" n={p.reposts} />
      </p>
      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold text-ok tnum">
        <Icon name="check" size={10} />
        {p.qualified_views.toLocaleString('en-IN')} qualified
      </p>
    </>
  )
  const cls = `${width} flex-none snap-start`
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

function SaleCard({ x }) {
  const to = x.kind === 'product' ? `/shop/p/${x.id}` : `/shop/l/${x.id}`
  return (
    <Link to={to} className="w-[140px] flex-none snap-start">
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-surface2">
        {x.image_url ? (
          <img src={x.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Plate seed={x.id} className="h-full w-full !rounded-none !shadow-none" />
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-snug t-heading">{x.name}</p>
      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-ok/10 px-1.5 py-0.5 text-[10px] font-semibold text-ok tnum">
        <Icon name="check" size={10} />
        {x.sales.toLocaleString('en-IN')} {x.sales === 1 ? 'sale' : 'sales'}
      </p>
      <p className="mt-0.5 text-[11px] t-faint tnum">
        {x.buyers} {x.buyers === 1 ? 'buyer' : 'buyers'}
      </p>
    </Link>
  )
}
