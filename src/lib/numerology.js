/**
 * Numerology, against the API.
 *
 * One call, no client cache: the server memoises a reading forever under the
 * name and the date, so a second visit is a row read rather than a vendor
 * call, and keeping a copy here would only make a corrected name harder to
 * see through.
 *
 * The NAME is the one thing the client sends, and it should be: numerology
 * counts the name as it was given at birth, which is often not the name on
 * the profile. The birth date comes from the caller's own row.
 */

import { supabase } from './supabase.js'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL

const UNREACHABLE = {
  ok: false,
  code: 'unavailable',
  reason: 'Could not reach the numbers. Check your connection and try again.',
}

export async function fetchNumerology({ name, lang = 'en' } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, code: 'signed_out', reason: 'Sign in to see your numbers.' }

  const query = new URLSearchParams()
  if (name) query.set('name', name)
  if (lang === 'hi') query.set('lang', 'hi')

  let response
  try {
    response = await fetch(`${API_BASE}/astro/numerology/?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return UNREACHABLE
  }

  let answer = null
  try {
    answer = await response.json()
  } catch {
    return UNREACHABLE
  }

  if (!response.ok || answer?.ok === false) {
    const code = response.status === 401 ? 'signed_out' : (answer?.reason ?? 'unavailable')
    return { ok: false, code, reason: answer?.message ?? UNREACHABLE.reason }
  }
  return answer
}

/**
 * The vendor's two payloads, as the screen reads them.
 *
 * Every field is optional on purpose: the two endpoints are a third party's
 * and a renamed key must leave a gap rather than print "undefined". The
 * numbers lead because they are what somebody came for; the lucky things
 * follow, and they are the deck the vendor is strongest at.
 */
export function numbersFrom(payload) {
  if (!payload) return null
  const table = payload.table ?? {}
  const numbers = payload.numbers ?? {}

  const core = [
    ['Radical', table.radical_number, 'Your birth day, reduced. The number you lead with.'],
    ['Destiny', table.destiny_number, 'The whole birth date. What the life is pointed at.'],
    ['Name', table.name_number, 'The letters of the name you gave.'],
    ['Life path', numbers.lifepath_number, 'The road, as numerology counts it.'],
    ['Expression', numbers.expression_number, 'What you are built to do.'],
    ['Soul urge', numbers.soul_urge_number, 'What you want when nobody is asking.'],
    ['Personality', numbers.personality_number, 'What people meet first.'],
    ['Subconscious self', numbers.subconscious_self_number, 'What you fall back on under pressure.'],
  ].filter(([, value]) => value !== undefined && value !== null)
    .map(([label, value, note]) => ({ label, value, note }))

  const lucky = [
    ['Colour', table.fav_color],
    ['Day', table.fav_day],
    ['Metal', table.fav_metal],
    ['Stone', table.fav_stone],
    ['Second stone', table.fav_substone],
    ['Deity', table.fav_god],
    ['Ruler', table.radical_ruler],
  ].filter(([, value]) => value)
    .map(([label, value]) => ({ label, value }))

  return {
    core,
    lucky,
    mantra: table.fav_mantra ?? '',
    friendly: table.friendly_num ?? '',
    neutral: table.neutral_num ?? '',
    /* The vendor calls it `evil_num`. The screen does not: a number nobody
       chose is not evil, and a seeker reading that about their own chart is
       being told something this product does not mean. */
    difficult: table.evil_num ?? '',
    challenges: Array.isArray(numbers.challenge_numbers) ? numbers.challenge_numbers : [],
  }
}
