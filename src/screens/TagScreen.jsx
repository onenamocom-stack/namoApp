import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import { fetchByTag } from '../lib/content.js'
import { FeedCard } from './Home.jsx'

const SORTS = [
  { key: 'new', label: 'Newest' },
  { key: 'top', label: 'Top' },
]

/**
 * A hashtag's own page, `/tag/:tag` (13 Oct 2026, docs/06 Phase 15a): every
 * post carrying it, newest first or top by likes, saves, comments and
 * reshares, each drawn as the feed draws it. A #tag in any caption links
 * here; it used to open Search with the tag typed in.
 */
export default function TagScreen() {
  const { tag } = useParams()
  const [sort, setSort] = useState('new')
  const [posts, setPosts] = useState(null)

  useEffect(() => {
    let alive = true
    setPosts(null)
    fetchByTag(tag, { sort })
      .then((rows) => alive && setPosts(rows))
      .catch(() => alive && setPosts([]))
    return () => {
      alive = false
    }
  }, [tag, sort])

  return (
    <>
      <TopBar title={`#${tag}`} back backTo="/home" sub={posts ? `${posts.length} posts` : undefined} />

      <div className="flex gap-2 px-4 py-3" role="tablist">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={sort === s.key}
            onClick={() => setSort(s.key)}
            className={`rounded-full px-4 py-1.5 text-meta font-semibold transition-colors ${
              sort === s.key ? 'bg-ink text-white' : 'bg-ink/[0.07] text-t1'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {posts === null && <Loader />}
      {posts && !posts.length && (
        <p className="prose-c px-5 py-6">Nobody has used #{tag} yet. Use it in a post and it starts here.</p>
      )}
      {posts && posts.length > 0 && (
        <div className="bg-white">
          {posts.map((p) => (
            <FeedCard key={p.id} piece={p} />
          ))}
        </div>
      )}
      <div className="h-8" />
    </>
  )
}
