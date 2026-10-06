import { useState } from 'react'
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
  const title = piece.title || piece.caption || KIND[piece.kind] || 'Post'

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
          <span>{KIND[piece.kind] ?? ''}</span>
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
      {photo && <PhotoViewer src={piece.mediaUrl} caption={piece.caption} onClose={() => setPhoto(false)} />}
    </>
  )
}

/** A photo, full screen, over everything; tap ✕ to close. */
export function PhotoViewer({ src, caption, onClose }) {
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
      <img src={src} alt="" className="m-auto max-h-full w-full object-contain" />
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
    views: p.views,
    views7d: p.views_7d,
    likes: p.likes,
    comments: p.comments,
  }
}
