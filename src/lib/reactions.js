import { supabase } from './supabase.js'

/**
 * `follow` / `save` / `like` / `remind`, moved out of a browser `Set` and into
 * rows that survive a reload and a different device.
 *
 * ── WHY THIS FILE DOES NOT REPLACE `flags` ──────────────────────────────────
 * The store keeps one flat Set of namespaced strings — `follow:a1`, `save:po2`,
 * `like:r3` — and `docs/05-BACKEND-SCHEMA.md` §5.1 notes it maps one-to-one
 * onto the `reactions` table. It does, for those four kinds. It is NOT the
 * whole Set:
 *
 *   setting:croppedDeityImage   a preference, not a reaction
 *   offair:<room>               local UI state for one screen
 *   event:<id>                  phase 10's academy
 *   tarot:*                     §5.6's `tarot_pulls`, a rolling window
 *   save:day-<key>              a saved READING, which is derived and has no
 *                               table to point at
 *
 * So this file answers one question — "is this key a persistable reaction?" —
 * and the store routes on the answer. Everything else stays in the Set exactly
 * as it was, and the twenty-odd `toggleFlag` call sites do not change at all.
 *
 * ── AND WHY THE TARGET HAS TO LOOK LIKE A UUID ──────────────────────────────
 * `reactions.target_id` is a uuid column. Real consultants and real content
 * have UUIDs; the mock rows that are still on screen have `a1` and `po2`. A
 * reaction against a mock row cannot be stored and must not throw — it stays a
 * local flag, and it starts persisting by itself the moment that screen is
 * reading real rows. That is the seam this phase is crossing, and it is meant
 * to be crossable one screen at a time rather than all at once.
 */

const KINDS = { follow: 'consultant', save: 'content', like: 'content', remind: 'live_session' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `'follow:9f2c…'` → `{ kind, targetType, targetId }`, or null when the key is
 * not a reaction this table can hold.
 */
export function parseKey(key) {
  const at = key.indexOf(':')
  if (at < 0) return null

  const kind = key.slice(0, at)
  const targetId = key.slice(at + 1)
  const targetType = KINDS[kind]

  if (!targetType || !UUID.test(targetId)) return null
  return { kind, targetType, targetId }
}

/** Every reaction this user has, as the store's namespaced strings. */
export async function fetchMine() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('reactions')
    .select('kind, target_id')
    .eq('actor_id', user.id)
  if (error) throw error

  return (data ?? []).map((r) => `${r.kind}:${r.target_id}`)
}

/**
 * Write one reaction on or off.
 *
 * `on` is passed in rather than read back, because the store has already
 * flipped its own copy and this call is catching up. Toggling on twice is the
 * same row — the unique constraint says so — so no read is needed first.
 */
export async function setReaction(key, on) {
  const parsed = parseKey(key)
  if (!parsed) return false

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { kind, targetType, targetId } = parsed

  if (on) {
    const { error } = await supabase.from('reactions').insert({
      actor_id: user.id,
      target_type: targetType,
      target_id: targetId,
      kind,
    })
    // 23505 is the same reaction arriving twice, which is the desired state
    // already being true. Not an error worth showing anybody.
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('reactions')
      .delete()
      .eq('actor_id', user.id)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('kind', kind)
    if (error) throw error
  }
  return true
}
