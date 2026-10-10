import { Link } from 'react-router-dom'

/**
 * Text with its #hashtags as links (10 Oct 2026, Rahul). A tag is a # and
 * the letters, marks and digits after it, in any script — #शिव as well as
 * #shiv. Tapping one opens Search on Posts with the tag typed in, which finds
 * every post among the newest that carries it. Nothing is stored: the tag is
 * the text the author wrote.
 */
const TAG = /(#[\p{L}\p{M}\p{N}_]+)/gu

export function tagHref(tag) {
  return `/search?in=posts&q=${encodeURIComponent(tag)}`
}

export default function Hashtags({ text, className = '' }) {
  if (!text) return null
  const parts = text.split(TAG)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Link
        key={i}
        to={tagHref(part)}
        onClick={(e) => e.stopPropagation()}
        className={`font-semibold ${className || 'text-gold'}`}
      >
        {part}
      </Link>
    ) : (
      part
    ),
  )
}
