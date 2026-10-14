/**
 * Person-to-person messages, `/v1/dms/` (13 Oct 2026, docs/06 Phase 15b).
 * Free, and apart from the paid chat in `chat.js`: nothing here touches a
 * session or the wallet. Refusals arrive as sentences and are thrown as
 * the Error's message.
 */
import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

/* Three seconds while a conversation is open, as the paid chat polls. */
export const DM_POLL_MS = 3_000

async function accessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await accessToken()
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }
  return data
}

/** `{ items, requests, unread }`; `box` is 'inbox' or 'requests'. */
export const fetchDmThreads = (box = 'inbox') => api(`/dms/threads/?box=${box}`)

/** The conversation with a person, made if there is none. */
export const startDm = (to) => api('/dms/start/', { method: 'POST', body: { to } })

/** `{ thread, items }`, oldest first; `after` pages forward from a message id. */
export const fetchDmMessages = (id, after) =>
  api(`/dms/threads/${id}/messages/${after ? `?after=${after}` : ''}`)

export const sendDm = (id, body) => api(`/dms/threads/${id}/send/`, { method: 'POST', body: { body } })
export const markDmRead = (id) => api(`/dms/threads/${id}/read/`, { method: 'POST' })
export const acceptDm = (id) => api(`/dms/threads/${id}/accept/`, { method: 'POST' })
export const declineDm = (id) => api(`/dms/threads/${id}/decline/`, { method: 'POST' })
export const blockPerson = (profileId, on = true) =>
  api('/dms/block/', { method: on ? 'POST' : 'DELETE', body: { profile_id: profileId } })

/** Delete a message you sent, for both people (14 Oct 2026). */
export const deleteDm = (threadId, messageId) =>
  api(`/dms/threads/${threadId}/messages/${messageId}/delete/`, { method: 'POST' })

/** Delete chat: the conversation leaves your side only, until a new message. */
export const clearDm = (threadId) => api(`/dms/threads/${threadId}/clear/`, { method: 'POST' })
