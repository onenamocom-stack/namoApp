import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchByAuthor } from '../lib/content.js'
import { TabHeader } from '../components/Chrome.jsx'
import Composer from '../components/Composer.jsx'
import EditSheet from '../components/EditSheet.jsx'
import { Kicker } from '../components/Pop.jsx'
import { PieceRow } from '../components/Pieces.jsx'
import { useStore } from '../store.jsx'

/**
 * The studio — what a consultant publishes.
 *
 * The composer itself is `components/Composer.jsx`, shared with the seeker's
 * own posting section on `/profile`. The only difference between the two is
 * this `kinds` list: a consultant gets reels, a seeker does not. That is a
 * `025` policy decision, and this prop only decides which tabs are drawn — it
 * grants nothing, and the server refuses a reel from a seeker whatever the UI
 * offers.
 */
const KINDS = ['clip', 'post', 'article']

export default function ProStudio() {
  const { session } = useStore()
  const [published, setPublished] = useState([])
  const [editing, setEditing] = useState(null)
  const [reload, setReload] = useState(0)

  /* What this consultant has already published, read back from the same view
     the seeker's feed reads. The studio showing its own optimistic copy is how
     a publish that silently failed still looks like it worked — which is the
     bug this screen shipped with: a toast that wrote nothing. */
  const me = session?.user?.id

  useEffect(() => {
    if (!me) return
    let active = true
    fetchByAuthor(me)
      .then((rows) => active && setPublished(rows))
      .catch((err) => console.error('[studio] load failed:', err.message))
    return () => {
      active = false
    }
  }, [me, reload])

  return (
    <>
      <TabHeader />

      <Composer kinds={KINDS} tagProducts onPublished={() => setReload((n) => n + 1)} />

      {/* The way in to affiliate links, above the composer's output rather
          than buried in the profile tab. A screen reachable only by typing
          its URL is a screen nobody uses — the dashboard learned that the
          hard way on 22 Sep. This sits where a consultant already is when
          they have just finished posting about a product. */}
      <Link
        to="/pro/affiliate"
        className="mx-5 mt-2 flex items-center justify-between gap-3 rounded-lg border border-rule px-4 py-3.5 transition-colors hover:border-t1"
      >
        <span className="min-w-0">
          <span className="block text-body text-t1">Share a product, earn 10%</span>
          <span className="mt-0.5 block text-micro t-faint">
            Your link, and what it pays
          </span>
        </span>
        <span aria-hidden="true" className="flex-none caps-sm gold">Open</span>
      </Link>

      <section className="px-5 py-6">
        <Kicker action="See all" to="/pro/profile">
          Already published
        </Kicker>
        <p className="mt-2 caps-sm t-faint tnum">
          {published.filter((c) => c.kind === 'clip').length} reels ·{' '}
          {published.filter((c) => c.kind === 'post').length} photos ·{' '}
          {published.filter((c) => c.kind === 'article').length} blog posts
        </p>
        <div className="mt-3">
          {/* Your own posts only, each with its thumbnail and views, and a tap
              that opens it (4 Oct 2026; they were untappable text rows). */}
          {published.map((c) => (
            <PieceRow key={c.id} piece={c} onEdit={() => setEditing(c)} />
          ))}
          {/* An empty studio says so. The counts above are COUNTED, never
              quoted — the mock said three pieces with 12.1k views against
              nothing at all. */}
          {!published.length && (
            <p className="prose-c">
              Nothing published yet. What you post here appears in the feed.
            </p>
          )}
        </div>
      </section>

      <div className="h-24" />
      <EditSheet piece={editing} onClose={() => setEditing(null)} onSaved={() => setReload((n) => n + 1)} />
    </>
  )
}
