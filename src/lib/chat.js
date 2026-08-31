import { supabase } from './supabase.js'

/**
 * Every read and write of a metered chat, in one file.
 *
 * The shape to hold in your head: a THREAD is the transcript and lives
 * forever; a SESSION is the paid window and is the only time anybody can
 * write into it. Outside a live session the conversation is read-only, and
 * that is enforced by an RLS policy rather than by this file — a client that
 * forgets cannot give away paid minutes.
 *
 * Nothing here sends a duration, a rate or a minute count. The server owns all
 * three (`backend/schema/014_metered_chat.sql`), and every function below
 * returns the server's own `{ ok, reason }` so a refusal is shown in the words
 * the server chose.
 */

/** Ask for a chat. Costs nothing — the meter starts when the consultant joins. */
export async function requestChat(consultantId, serviceId) {
  const { data, error } = await supabase.rpc('session_request', {
    p_consultant_id: consultantId,
    p_service_id: serviceId,
  })
  if (error) {
    console.error('[chat] request failed:', error.message)
    return { ok: false, reason: 'Could not reach the consultant. Try again.' }
  }
  return data
}

/** The consultant's join. This is where the hold is taken and the clock starts. */
export async function acceptChat(sessionId) {
  const { data, error } = await supabase.rpc('session_accept', { p_session_id: sessionId })
  if (error) {
    console.error('[chat] accept failed:', error.message)
    return { ok: false, reason: 'Could not start that session. Try again.' }
  }
  return data
}

/** Either party may end it. Idempotent — both sides pressing End is normal. */
export async function endChat(sessionId) {
  const { data, error } = await supabase.rpc('session_end', { p_session_id: sessionId })
  if (error) {
    console.error('[chat] end failed:', error.message)
    return { ok: false, reason: 'Could not close that session.' }
  }
  return data
}

/**
 * Says "still here" and asks how long is left.
 *
 * It does NOT advance the meter and cannot extend anything — the cutoff is
 * `expires_at` on the server. A client that stops calling this loses nothing it
 * paid for; it just gets swept sooner, which is the 60-second grace.
 */
export async function heartbeat(sessionId) {
  const { data, error } = await supabase.rpc('session_heartbeat', { p_session_id: sessionId })
  /* A failed REQUEST is not an ended session, and conflating them is expensive:
     the room would tear down its meter and composer on one dropped packet
     while the server kept the session live and kept billing. `live` is left
     UNDEFINED here so the caller can tell "the server says it is over" from
     "I could not ask" — the same distinction `consultantError` draws in the
     store, for the same reason. */
  if (error) return { ok: false, unreachable: true, seconds_left: null }
  return data
}

/** My sessions, either side of them, newest first. */
export async function listSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(50)
  if (error) console.error('[chat] sessions load failed:', error.message)
  return data ?? []
}

/** The thread list, from the view that carries the other party's name —
 *  `profiles` is own-row-only, so the table alone gives a UUID. */
export async function listThreads() {
  const { data, error } = await supabase
    .from('threads_view')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
  if (error) console.error('[chat] threads load failed:', error.message)
  return data ?? []
}

export async function listMessages(threadId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at')
  if (error) console.error('[chat] messages load failed:', error.message)
  return data ?? []
}

/**
 * Send. The only direct client write in v1, and the policy is what bounds it:
 * a message is accepted only into a thread with a live session. Outside one
 * this returns `false` and the caller says so — it is not a network failure,
 * it is the meter having stopped.
 */
export async function sendMessage(threadId, body) {
  const text = body.trim()
  if (!text) return { ok: false, reason: '' }
  const { data: me } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('messages')
    .insert({ thread_id: threadId, sender_id: me?.user?.id, body: text })
    .select()
    .single()
  if (error) {
    console.error('[chat] send failed:', error.message)
    return { ok: false, reason: 'That session has ended. Start another to reply.' }
  }
  // The inserted row comes back so the sender can render it immediately rather
  // than waiting on the Realtime echo.
  return { ok: true, message: data }
}

/** Mark the other party's messages read. `read_at` is the only column a client
 *  may write on `messages`, by column grant. */
export async function markRead(threadId, myId) {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .is('read_at', null)
    .neq('sender_id', myId)
  if (error) console.error('[chat] mark read failed:', error.message)
}

/**
 * Realtime. New rows in this thread, pushed rather than polled.
 *
 * Returns an unsubscribe function — call it on unmount, or the channel
 * outlives the panel and the same message arrives twice.
 */
export function subscribeToThread(threadId, onMessage) {
  const channel = supabase
    .channel(`thread:${threadId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
      (payload) => onMessage(payload.new),
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

/**
 * A seeker's own sessions. This is how the room learns the consultant has
 * JOINED — the thread does not exist until accept, so without this the seeker
 * sits on "No conversations yet" for the whole paid session while the meter
 * runs. `015` publishes `sessions` to Realtime for exactly this and nothing
 * was listening.
 */
export function subscribeToMySessions(seekerId, onChange) {
  const channel = supabase
    .channel(`mysessions:${seekerId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sessions', filter: `seeker_id=eq.${seekerId}` },
      onChange,
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

/** A consultant's incoming requests — the ones waiting for an accept. */
export function subscribeToRequests(consultantId, onChange) {
  const channel = supabase
    .channel(`requests:${consultantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sessions', filter: `consultant_id=eq.${consultantId}` },
      onChange,
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}

/** `mm:ss` from seconds. The room shows this ticking down, because a charge
 *  nobody can see accruing is a charge that gets disputed. */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
