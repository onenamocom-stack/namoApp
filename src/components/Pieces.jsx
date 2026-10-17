import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import Plate from './Plate.jsx'

/**
 * A consultant's own post as one row (4 Oct 2026): a small thumbnail, the
 * title, its numbers, and a tap that opens it — a reel in the reel viewer,
 * a blog post on its page, a photo full screen. Used by Studio's published
 * list and the Insights tab, and only ever fed the consultant's own posts.
 *
 * No thumbnail is stored anywhere, so a reel's is the video's own frame at
 * half a second (`#t=0.5`, metadata only — the whole file is not fetched),
 * a photo's is the photo, and a blog post gets a generated plate.
 */

const KIND = { clip: 'Reel', post: 'Photo', article: 'Blog', live_session: 'Live' }
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|$)/i

/** What a piece is, in a word. A `post` with no picture is a text post
 *  (10 Oct 2026) and says so — it read "Photo" over a blank tile. */
export function kindLabel(piece) {
  if (piece.kind === 'post' && !piece.mediaUrl) return 'Text'
  return KIND[piece.kind] ?? ''
}

export function Thumb({ piece, size = 56 }) {
  const style = { width: size, height: size }
  if (piece.mediaUrl && VIDEO.test(piece.mediaUrl)) {
    return (
      <span className="relative flex-none overflow-hidden rounded-xl bg-ink" style={style}>
        <video
          src={`${piece.mediaUrl}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center text-white/90">
          <Icon name="play" size={16} filled />
        </span>
      </span>
    )
  }
  if (piece.mediaUrl) {
    return (
      <span className="flex-none overflow-hidden rounded-xl bg-surface" style={style}>
        <img src={piece.mediaUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    )
  }
  // A text post: "Aa" on the colours the feed sets its words on.
  if (piece.kind === 'post') {
    return (
      <span
        className="flex flex-none items-center justify-center overflow-hidden rounded-xl text-meta font-semibold text-t1"
        style={{ ...style, background: 'linear-gradient(145deg, #fff4ea 0%, #ffe4cc 55%, #e3f5ec 100%)' }}
      >
        Aa
      </span>
    )
  }
  return (
    <span className="flex-none overflow-hidden rounded-xl" style={style}>
      <Plate seed={piece.id} className="h-full w-full" />
    </span>
  )
}

export function PieceRow({ piece, onEdit }) {
  if (onEdit) {
    return (
      <div className="flex items-center gap-2 border-b border-rule last:border-b-0">
        <div className="min-w-0 flex-1 [&>*]:border-b-0">
          <PieceRowInner piece={piece} />
        </div>
        <button type="button" onClick={onEdit} className="flex-none rounded-full border border-stroke px-3 py-1 caps-sm t-sub">
          Edit
        </button>
      </div>
    )
  }
  return <PieceRowInner piece={piece} />
}

function PieceRowInner({ piece }) {
  const [photo, setPhoto] = useState(false)
  const title = piece.title || piece.caption || kindLabel(piece) || 'Post'

  const body = (
    <>
      <Thumb piece={piece} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-meta t-heading">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] t-faint tnum">
          <span className="inline-flex items-center gap-1 font-semibold t-sub">
            <Icon name="eye" size={13} />
            {(piece.views ?? 0).toLocaleString('en-IN')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="heart" size={13} />
            {piece.likes ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="chat" size={13} />
            {piece.comments ?? 0}
          </span>
          <span>{kindLabel(piece)}</span>
        </span>
        {piece.views7d > 0 && (
          <span className="mt-0.5 block text-[12px] text-ok tnum">+{piece.views7d} views this week</span>
        )}
      </span>
      <span aria-hidden="true" className="flex-none text-meta t-faint">→</span>
    </>
  )
  const cls = 'flex w-full items-center gap-3 border-b border-rule py-3 text-left last:border-b-0'

  if (piece.kind === 'clip') return <Link to={`/reels/${piece.id}`} className={cls}>{body}</Link>
  if (piece.kind === 'article') return <Link to={`/read/${piece.id}`} className={cls}>{body}</Link>
  return (
    <>
      <button type="button" className={cls} onClick={() => piece.mediaUrl && setPhoto(true)}>
        {body}
      </button>
      {photo && <PhotoViewer src={piece.mediaUrl} photos={[piece.mediaUrl, ...(piece.gallery ?? [])]} caption={piece.caption} onClose={() => setPhoto(false)} />}
    </>
  )
}

/** A photo, full screen, over everything; tap ✕ to close. */
/** The photos of one post or listing, swiped sideways, one at a time, with
 *  the count and dots over them (17 Oct 2026, Rahul: up to ten, as
 *  Instagram shows them). One photo is just the photo. */
export function PhotoSwiper({ photos, alt = '', className = '', imgClassName = 'w-full object-cover', onOpen }) {
  const [at, setAt] = useState(0)
  const strip = useRef(null)
  const list = (photos || []).filter(Boolean)
  if (!list.length) return null
  const Frame = onOpen ? 'button' : 'div'
  if (list.length === 1) {
    return (
      <Frame type={onOpen ? 'button' : undefined} onClick={onOpen ? () => onOpen(0) : undefined} className={`block w-full ${className}`}>
        <img src={list[0]} alt={alt} className={imgClassName} />
      </Frame>
    )
  }
  const onScroll = (e) => {
    const el = e.currentTarget
    setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
  }
  return (
    <div className={`relative ${className}`}>
      <div ref={strip} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory items-center overflow-x-auto">
        {list.map((src, i) => (
          <Frame
            key={`${src}-${i}`}
            type={onOpen ? 'button' : undefined}
            onClick={onOpen ? () => onOpen(i) : undefined}
            className="block w-full flex-none snap-center"
          >
            <img src={src} alt={i === 0 ? alt : ''} loading={i ? 'lazy' : undefined} className={imgClassName} />
          </Frame>
        ))}
      </div>
      <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white tnum">
        {Math.min(at, list.length - 1) + 1}/{list.length}
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
        {list.map((src, i) => (
          <span key={`${src}-dot-${i}`} className={`block h-1.5 w-1.5 rounded-full ${i === at ? 'bg-white' : 'bg-white/50'}`} />
        ))}
      </span>
    </div>
  )
}

/** Two squares, one over the other: "more than one photo", on a grid tile. */
export function ManyMark() {
  return (
    <span className="pointer-events-none absolute right-1.5 top-1.5 text-white drop-shadow" aria-label="More than one photo">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <rect x="8" y="8" width="13" height="13" rx="2.5" />
        <path d="M16 4H6a2 2 0 0 0-2 2v10" />
      </svg>
    </span>
  )
}

export function PhotoViewer({ src, photos, caption, onClose }) {
  const list = photos?.length ? photos : [src]
  return createPortal(
    <div className="fixed inset-0 z-[70] mx-auto flex w-full max-w-[420px] flex-col bg-black">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
      >
        <Icon name="close" size={18} />
      </button>
      <PhotoSwiper photos={list} className="m-auto w-full" imgClassName="m-auto max-h-[85vh] w-full object-contain" />
      {caption && <p className="px-5 pb-6 text-meta text-white/85">{caption}</p>}
    </div>,
    document.body,
  )
}

/** From an Insights row (snake_case, from the API) to a piece. */
export function fromInsights(p) {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    caption: p.caption,
    mediaUrl: p.media_url,
    gallery: p.gallery ?? [],
    views: p.views,
    views7d: p.views_7d,
    likes: p.likes,
    comments: p.comments,
  }
}
