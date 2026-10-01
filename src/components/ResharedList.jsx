import { useEffect, useState } from 'react'
import { authorHref } from '../screens/Home.jsx'
import { fetchReposts } from '../lib/content.js'
import { Kicker } from './Pop.jsx'
import { Row } from './Primitives.jsx'

/**
 * What a person has reshared, newest first — on their own Profile and on
 * their public page (30 Sep 2026). A reel opens the reel, an article opens
 * the article; a photo post has no page of its own, so it opens its author.
 * Renders nothing until there is something, so a profile with no reshares
 * does not grow an empty heading.
 */
export default function ResharedList({ by, className = '' }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    let active = true
    if (!by) return undefined
    fetchReposts({ by, limit: 50 }).then((r) => active && setRows(r))
    return () => {
      active = false
    }
  }, [by])

  if (!rows.length) return null

  return (
    <section className={className}>
      <Kicker>{`Reshared · ${rows.length}`}</Kicker>
      <div className="mt-3">
        {rows.map(({ id, post, time }) => {
          const kind = post.kind === 'clip' ? 'Reel' : post.kind === 'article' ? 'Blog' : 'Photo'
          const words = post.title || post.caption || post.body
          return (
            <Row
              key={id}
              to={
                post.kind === 'clip'
                  ? `/reels/${post.id}`
                  : post.kind === 'article'
                    ? `/read/${post.id}`
                    : authorHref(post)
              }
              // An uncaptioned reel has no words of its own; say what it is.
              title={words || `${kind} by ${post.consultant}`}
              note={words ? `${kind} by ${post.consultant}` : undefined}
              meta={time}
            />
          )
        })}
      </div>
    </section>
  )
}
