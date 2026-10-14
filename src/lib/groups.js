/**
 * Groups, `/v1/groups/` (14 Oct 2026, docs/06 Phase 15c): a mandir, a
 * sampradaya, a city. Refusals arrive as sentences and are thrown as the
 * Error's message.
 */
import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

async function api(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
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

export const GROUP_KINDS = [
  { key: 'mandir', label: 'Mandir' },
  { key: 'sampradaya', label: 'Sampradaya' },
  { key: 'city', label: 'City' },
  { key: 'other', label: 'Other' },
]

export const myGroups = () => api('/groups/?mine=1').then((d) => d.items)
export const findGroups = (q = '') => api(`/groups/?q=${encodeURIComponent(q)}`).then((d) => d.items)
export const fetchGroup = (id) => api(`/groups/${id}/`)
export const createGroup = (fields) => api('/groups/', { method: 'POST', body: fields })
export const editGroup = (id, fields) => api(`/groups/${id}/`, { method: 'PATCH', body: fields })
export const joinGroup = (id) => api(`/groups/${id}/join/`, { method: 'POST' })
export const leaveGroup = (id) => api(`/groups/${id}/leave/`, { method: 'POST' })
export const groupMembers = (id) => api(`/groups/${id}/members/`).then((d) => d.items)
export const removeMember = (id, profileId) =>
  api(`/groups/${id}/members/remove/`, { method: 'POST', body: { profile_id: profileId } })
export const makeAdmin = (id, profileId) =>
  api(`/groups/${id}/members/admin/`, { method: 'POST', body: { profile_id: profileId } })
export const removeGroupPost = (id, contentId) =>
  api(`/groups/${id}/posts/remove/`, { method: 'POST', body: { content_id: contentId } })
/** The group's posts as raw feed rows; `shapeRows` in content.js shapes them. */
export const groupPostRows = (id) => api(`/groups/${id}/posts/`).then((d) => d.results)

export const kindLabel = (k) => GROUP_KINDS.find((x) => x.key === k)?.label ?? 'Group'
