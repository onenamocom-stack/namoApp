import { useState } from 'react'
import { ActIcon, Count } from './ActIcon.jsx'
import CommentSheet from './CommentSheet.jsx'
import { useReshare } from './ReshareSheet.jsx'
import { shareAsset } from '../lib/bhakti.js'
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
 *
 * `share` adds Home's share icon, the link (wallpapers, bhajans and mantras;
 * a status has its WhatsApp button instead). A priced row has no Reshare —
 * the server refuses it, and a feed card for something you must buy is an
 * advert under a person's name.
 *
 * `light`: white icons and counts, on the Darshan altar's green front (24 Oct
 * 2026, Rahul), where the colours stay readable on the marble.
 */
export default function BhaktiActions({ asset, share = false, light = false }) {
  const { hasFlag, toggleFlag, showToast } = useStore()
  const [thread, setThread] = useState(false)
  const [comments, setComments] = useState(asset.comments ?? 0)
  const liked = hasFlag(`blike:${asset.id}`)
  const reshared = hasFlag(`brepost:${asset.id}`)
  const [was] = useState(() => ({ liked, reshared }))
  const reshare = useReshare(`brepost:${asset.id}`)
  const look = light
    ? { idle: 'text-white/90 hover:text-white drop-shadow', size: 22 }
    : {}
  const count = light ? 'text-white drop-shadow' : undefined

  return (
    <>
      <ActIcon
        icon="heart"
        label="Like"
        onLabel="Liked"
        on={liked}
        tone="text-gold-fill"
        onClick={() => toggleFlag(`blike:${asset.id}`)}
        {...look}
      />
      <Count n={(asset.likes ?? 0) + (liked - was.liked)} className={count} />
      <ActIcon icon="chat" label="Comments" onClick={() => setThread(true)} {...look} />
      <Count n={comments} className={count} />
      {asset.pricePaise == null && (
        <>
          <ActIcon
            icon="repost"
            label="Reshare"
            onLabel="Reshared"
            on={reshared}
            tone={light ? 'text-white' : 'text-[#1f7a4d]'}
            onClick={reshare.tap}
            {...look}
          />
          <Count n={(asset.reposts ?? 0) + (reshared - was.reshared)} className={count} />
          {reshare.sheet}
        </>
      )}
      {share && (
        <ActIcon
          icon="share"
          label="Share"
          onClick={async () => {
            const said = await shareAsset(asset)
            if (said) showToast(said)
          }}
          {...look}
        />
      )}
      <CommentSheet open={thread} onClose={() => setThread(false)} bhaktiId={asset.id} onCount={setComments} />
    </>
  )
}
