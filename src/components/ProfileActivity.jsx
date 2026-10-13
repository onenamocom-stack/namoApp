import { useEffect, useState } from 'react'
import { fetchCommented, fetchReposts } from '../lib/content.js'
import { fetchBhaktiReposts } from '../lib/bhakti.js'
import { CommentedCard, ReshareCard } from '../screens/Home.jsx'
import { Loader } from './Cosmos.jsx'
import Icon from './Icon.jsx'
import { useStore } from '../store.jsx'

/**
 * Your own Reshared and Commented tabs (13 Oct 2026, Rahul) — on the seeker
 * Profile and on a pro's own page, never on anybody else's view of you.
 * Each card drawn as the feed draws it, newest first.
 */

function Empty({ icon, text }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-gold">
        <Icon name={icon} size={24} />
      </span>
      <p className="mt-4 text-meta t-faint">{text}</p>
    </div>
  )
}

function useRows(load, dep) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let live = true
    if (!dep) return undefined
    load()
      .then((r) => live && setRows(r))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep])
  return rows
}

export function ResharedTab() {
  const { session, t } = useStore()
  const me = session?.user?.id
  const rows = useRows(
    () =>
      Promise.all([fetchReposts({ by: me, limit: 50 }), fetchBhaktiReposts({ by: me, limit: 50 })]).then(
        ([posts, pictures]) =>
          [...posts, ...pictures.map((r) => ({ ...r, picture: true }))].sort((a, b) =>
            String(b.at).localeCompare(String(a.at)),
          ),
      ),
    me,
  )
  if (rows === null) return <Loader />
  if (!rows.length) return <Empty icon="repost" text={t('prof.resharedEmpty')} />
  return (
    <div className="bg-white">
      {rows.map((r) => (
        <ReshareCard key={r.id} r={r} />
      ))}
    </div>
  )
}

export function CommentedTab() {
  const { session, t } = useStore()
  const rows = useRows(fetchCommented, session?.user?.id)
  if (rows === null) return <Loader />
  if (!rows.length) return <Empty icon="chat" text={t('prof.commentedEmpty')} />
  return (
    <div className="bg-white">
      {rows.map((r) => (
        <CommentedCard key={r.id} r={r} />
      ))}
    </div>
  )
}
