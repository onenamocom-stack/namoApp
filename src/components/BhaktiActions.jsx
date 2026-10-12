import { useState } from 'react'
import { ActIcon, Count } from './ActIcon.jsx'
import CommentSheet from './CommentSheet.jsx'
import { useStore } from '../store.jsx'

/**
 * Like, comment and reshare on a Bhakti picture, with their counts — Home's
 * icons (12 Oct 2026, Rahul). On the Status and Wallpapers shelves and on a
 * reshared picture in the feed. A reshare puts the plain picture on your
 * profile and in the feed under "you reshared".
 *
 * The counts are the server's, moved by your own tap the instant you press.
 * The server's number already holds your like from before, so the change
 * since the screen opened is what is added, not the state. `blike:` and
 * `brepost:` are a Bhakti picture's flags, not a post's.
 */
export default function BhaktiActions({ asset }) {
  const { hasFlag, toggleFlag, t } = useStore()
  const [thread, setThread] = useState(false)
  const [comments, setComments] = useState(asset.comments ?? 0)
  const liked = hasFlag(`blike:${asset.id}`)
  const reshared = hasFlag(`brepost:${asset.id}`)
  const [was] = useState(() => ({ liked, reshared }))

  return (
    <>
      <ActIcon
        icon="heart"
        label="Like"
        onLabel="Liked"
        on={liked}
        tone="text-gold-fill"
        onClick={() => toggleFlag(`blike:${asset.id}`)}
      />
      <Count n={(asset.likes ?? 0) + (liked - was.liked)} />
      <ActIcon icon="chat" label="Comments" onClick={() => setThread(true)} />
      <Count n={comments} />
      <ActIcon
        icon="repost"
        label="Reshare"
        onLabel="Reshared"
        on={reshared}
        tone="text-[#1f7a4d]"
        onClick={() => toggleFlag(`brepost:${asset.id}`, { on: t('home.reshared'), off: t('home.reshareRemoved') })}
      />
      <Count n={(asset.reposts ?? 0) + (reshared - was.reshared)} />
      <CommentSheet open={thread} onClose={() => setThread(false)} bhaktiId={asset.id} onCount={setComments} />
    </>
  )
}
