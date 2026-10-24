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
 * `rail`: the reels' way, down the right-hand side, each count under its
 * icon, white over the picture (24 Oct 2026, Rahul, on the Darshan murti:
 * "Right hand side vertically laga do. Jaise reels me lagate hai").
 */
export default function BhaktiActions({ asset, share = false, rail = false }) {
  const { hasFlag, toggleFlag, showToast } = useStore()
  const [thread, setThread] = useState(false)
  const [comments, setComments] = useState(asset.comments ?? 0)
  const liked = hasFlag(`blike:${asset.id}`)
  const reshared = hasFlag(`brepost:${asset.id}`)
  const [was] = useState(() => ({ liked, reshared }))
  const reshare = useReshare(`brepost:${asset.id}`)
  const look = rail ? { idle: 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]', size: 27 } : {}
  // One action and its count: side by side in a row, stacked on the rail.
  const pair = (icon, n) =>
    rail ? (
      <span className="flex flex-col items-center gap-0.5">
        {icon}
        {n > 0 && (
          <span className="text-[11px] font-semibold tnum text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]">
            {n.toLocaleString('en-IN')}
          </span>
        )}
      </span>
    ) : (
      <>
        {icon}
        {n != null && <Count n={n} />}
      </>
    )

  return (
    <>
      {pair(
        <ActIcon
          icon="heart"
          label="Like"
          onLabel="Liked"
          on={liked}
          tone={rail ? 'text-live' : 'text-gold-fill'}
          onClick={() => toggleFlag(`blike:${asset.id}`)}
          {...look}
        />,
        (asset.likes ?? 0) + (liked - was.liked),
      )}
      {pair(<ActIcon icon="chat" label="Comments" onClick={() => setThread(true)} {...look} />, comments)}
      {asset.pricePaise == null && (
        <>
          {pair(
            <ActIcon
              icon="repost"
              label="Reshare"
              onLabel="Reshared"
              on={reshared}
              tone={rail ? 'text-[#5fe0a0]' : 'text-[#1f7a4d]'}
              onClick={reshare.tap}
              {...look}
            />,
            (asset.reposts ?? 0) + (reshared - was.reshared),
          )}
          {reshare.sheet}
        </>
      )}
      {share &&
        pair(
          <ActIcon
            icon="share"
            label="Share"
            onClick={async () => {
              const said = await shareAsset(asset)
              if (said) showToast(said)
            }}
            {...look}
          />,
          null,
        )}
      <CommentSheet open={thread} onClose={() => setThread(false)} bhaktiId={asset.id} onCount={setComments} />
    </>
  )
}
