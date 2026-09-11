import { useEffect, useState } from 'react'
import { fetchByAuthor } from '../lib/content.js'
import { TabHeader } from '../components/Chrome.jsx'
import Composer from '../components/Composer.jsx'
import { Kicker } from '../components/Pop.jsx'
import { Row } from '../components/Primitives.jsx'
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

      <Composer kinds={KINDS} onPublished={() => setReload((n) => n + 1)} />

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
          {published.map((c) => (
            <Row
              key={c.id}
              title={c.title || c.caption}
              meta={c.time}
              note={c.kind === 'clip' ? 'Reel' : c.kind === 'post' ? 'Photo' : 'Blog'}
            />
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
    </>
  )
}
