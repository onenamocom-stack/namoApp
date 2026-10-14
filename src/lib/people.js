/**
 * People by name or username, for Search's People tab (14 Oct 2026, Rahul).
 * The server finds only people the app already shows publicly — somebody who
 * has posted, or an approved Pro (`profiles.services.search_people`).
 */
import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

/** `[{id, name, username, avatar_url, is_consultant, is_creator}]`; [] signed
 *  out, on a failure, or under two characters. */
export async function searchPeople(q) {
  const query = (q || '').trim()
  if (query.replace(/^@/, '').length < 2) return []
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return []
  try {
    const r = await fetch(`${API_BASE}/profiles/search/?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!r.ok) return []
    return (await r.json()).items ?? []
  } catch {
    return []
  }
}
