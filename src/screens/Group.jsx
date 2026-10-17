import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Sheet, TopBar } from '../components/Chrome.jsx'
import { Loader } from '../components/Cosmos.jsx'
import Composer from '../components/Composer.jsx'
import { PopAvatar, PopButton } from '../components/Pop.jsx'
import { FeedCard } from './Home.jsx'
import { shapeRows } from '../lib/content.js'
import {
  fetchGroup, groupMembers, groupPostRows, joinGroup, kindLabel, leaveGroup,
  makeAdmin, removeGroupPost, removeMember,
} from '../lib/groups.js'
import { useStore } from '../store.jsx'

const initialsOf = (name) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/**
 * A group's page, `/groups/:id` (14 Oct 2026, Phase 15c): its photo, name,
 * what it is and where, how many members, Join or Leave; then its posts,
 * newest first. A member posts into it with "Post in the group". An admin
 * also sees Members (remove, make admin), Edit, and "Remove from group" under
 * each post. Posts here also reach every member's Home feed.
 */
export default function Group() {
  const { id } = useParams()
  const { showToast, session, profile } = useStore()
  const [group, setGroup] = useState(null)
  const [posts, setPosts] = useState(null)
  const [busy, setBusy] = useState(false)
  const [posting, setPosting] = useState(false)
  const [listing, setListing] = useState(false)
  const [failed, setFailed] = useState(null)

  const load = useCallback(() => {
    fetchGroup(id).then(setGroup).catch((err) => setFailed(err.message))
    groupPostRows(id).then((rows) => setPosts(shapeRows(rows))).catch(() => setPosts([]))
  }, [id])
  useEffect(load, [load])

  if (failed) {
    return (
      <>
        <TopBar title="Group" back backTo="/messages" />
        <p className="px-5 py-8 text-meta t-body">{failed}</p>
      </>
    )
  }
  if (!group) return <Loader />

  const member = group.me?.status === 'active'
  const admin = member && group.me.role === 'admin'
  const removed = group.me?.status === 'removed'
  const sharer = Boolean(profile?.influencer) // the Creator module (docs/06 Phase 18)
  // Everybody posts video (17 Oct 2026, Rahul); only a Creator earns on it.
  const video = true

  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      setGroup(member ? await leaveGroup(id) : await joinGroup(id))
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function takeOut(contentId) {
    try {
      await removeGroupPost(id, contentId)
      setPosts((ps) => ps.filter((p) => p.id !== contentId))
      showToast('Removed from the group.')
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <>
      <TopBar
        title={group.name}
        back
        backTo="/messages"
        right={
          admin && (
            <Link to={`/groups/${id}/edit`} className="text-meta font-semibold gold">
              Edit
            </Link>
          )
        }
      />
      <section className="cosmic-dawn px-5 pb-5 pt-5">
        <div className="flex items-center gap-4">
          <PopAvatar initials={initialsOf(group.name)} src={group.avatar_url} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-lead font-semibold t-heading">{group.name}</h1>
            <p className="mt-0.5 text-meta t-sub">
              {kindLabel(group.kind)}
              {group.city ? ` · ${group.city}` : ''}
            </p>
            <button type="button" onClick={() => setListing(true)} className="mt-1 text-meta font-semibold t-heading tnum">
              {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
            </button>
          </div>
        </div>
        {group.about && <p className="mt-3 text-meta leading-relaxed t-sub">{group.about}</p>}
        <div className="mt-4 flex gap-2">
          {removed ? (
            <p className="text-meta t-faint">An admin removed you from this group.</p>
          ) : (
            <>
              <PopButton
                variant={member ? 'ghost' : 'default'}
                className="flex-1"
                full={false}
                onClick={toggle}
                disabled={busy || !session}
              >
                {member ? 'Leave' : 'Join'}
              </PopButton>
              {member && (
                <PopButton className="flex-1" full={false} onClick={() => setPosting(true)}>
                  Post in the group
                </PopButton>
              )}
            </>
          )}
        </div>
      </section>

      {posts === null && <Loader />}
      {posts && !posts.length && (
        <p className="px-5 py-8 text-meta t-faint">
          {member ? 'Nothing posted yet. Be the first.' : 'Nothing posted yet. Join to post here.'}
        </p>
      )}
      {posts?.map((p) => (
        <div key={p.id}>
          <FeedCard piece={p} />
          {admin && (
            <button
              type="button"
              onClick={() => takeOut(p.id)}
              className="w-full border-b border-rule bg-white px-4 py-2 text-left text-[12px] font-semibold t-faint hover:text-t1"
            >
              Remove from group
            </button>
          )}
        </div>
      ))}
      <div className="h-16" />

      {posting && (
        <div className="absolute inset-0 z-40 flex flex-col bg-white">
          <Composer
            kinds={video ? ['clip', 'post', 'article'] : ['post', 'article']}
            tagProducts={sharer}
            groupId={id}
            onClose={() => setPosting(false)}
            onPublished={() => {
              setPosting(false)
              load()
            }}
          />
        </div>
      )}

      <Members open={listing} onClose={() => setListing(false)} groupId={id} admin={admin} me={session?.user?.id} />
    </>
  )
}

function Members({ open, onClose, groupId, admin, me }) {
  const { showToast } = useStore()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (open) groupMembers(groupId).then(setRows).catch(() => setRows([]))
  }, [open, groupId])

  async function act(fn, pid, said) {
    try {
      await fn(groupId, pid)
      showToast(said)
      setRows(await groupMembers(groupId))
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Members">
      {rows === null && <Loader />}
      <ul className="max-h-[60vh] overflow-y-auto">
        {rows?.map((m) => (
          <li key={m.profile_id} className="flex items-center gap-3 border-b border-rule py-2.5">
            <PopAvatar initials={initialsOf(m.name)} src={m.avatar_url} size={36} />
            <Link to={`/u/${m.profile_id}`} className="min-w-0 flex-1 truncate text-meta t-heading">
              {m.name || 'Somebody'}
              {m.role === 'admin' && <span className="ml-1.5 text-[11px] font-semibold gold">Admin</span>}
            </Link>
            {admin && m.profile_id !== me && (
              <span className="flex flex-none gap-3 text-[12px] font-semibold">
                {m.role !== 'admin' && (
                  <button type="button" className="t-faint hover:text-t1" onClick={() => act(makeAdmin, m.profile_id, 'Made an admin.')}>
                    Make admin
                  </button>
                )}
                <button type="button" className="text-[#c0392b]" onClick={() => act(removeMember, m.profile_id, 'Removed from the group.')}>
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
