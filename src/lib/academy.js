import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

/**
 * Every Academy call in one file (phase 10b, `backend/schema/031_academy.sql`),
 * on the Django API since the move (`/v1/academy/`, backend-django/apps/shop).
 *
 * Nothing here sends a price: enrolling sends what and how it pays. And nothing
 * here decides who may watch — lesson links, join links and PDFs come back only
 * for an ACTIVE enrolment because the database's policies say so, and the API
 * reads them AS YOU. A row this file cannot read is a row the person has not
 * bought.
 */

/* Already ends in /v1 — see the note in shop.js. */
const API = import.meta.env.VITE_DJANGO_API_URL

async function api(path, { method = 'GET', body } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, data }
}

/** Rows, or a thrown error naming where it failed. */
async function read(path) {
  const { ok, status, data } = await api(path)
  if (!ok) throw new Error(`${path} ${status}`)
  return data
}

/** `{ status, courses, events, enrolled, reload }` — `enrolled` holds `course:<id>` / `event:<id>`. */
export function useAcademy(session) {
  const uid = session?.user?.id ?? null
  const [state, setState] = useState({ status: 'loading', courses: [], events: [], enrolled: new Set() })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let active = true
    // `uid` is a dependency so signing in or out reads again; the token rides
    // on the request, and the server answers `enrolled` for whoever sent it.
    read('/academy/')
      .then(({ courses, outline, events, enrolled }) => {
        if (!active) return
        setState({
          status: 'ready',
          courses: courses.map((row) => {
            const lessons = outline.filter((l) => l.course_id === row.id)
            return {
              id: row.id,
              title: row.title,
              tutor: row.tutor,
              level: row.level,
              summary: row.summary,
              pricePaise: row.price_paise,
              outline: lessons,
              minutes: lessons.reduce((n, l) => n + (l.minutes ?? 0), 0),
            }
          }),
          // A past event is not for sale and not worth a card; a cancelled one
          // stays visible so an enrolled person sees why it vanished.
          events: events
            .filter((row) => new Date(row.starts_at).getTime() + row.minutes * 60_000 > Date.now())
            .map((row) => ({
              id: row.id,
              title: row.title,
              host: row.host,
              kind: row.kind,
              summary: row.summary,
              startsAt: row.starts_at,
              minutes: row.minutes,
              seats: row.seats,
              seatsLeft: row.seats_left,
              pricePaise: row.price_paise,
              cancelled: row.status === 'cancelled',
            })),
          enrolled: new Set(enrolled),
        })
      })
      .catch((err) => {
        console.error('[academy] load:', err.message)
        if (active) setState((s) => ({ ...s, status: 'error' }))
      })
    return () => {
      active = false
    }
  }, [uid, tick])

  return { ...state, reload }
}

/** The video links of a course you are enrolled in. Empty otherwise — by policy. */
export function fetchLessons(courseId) {
  return read(`/academy/courses/${courseId}/lessons/`)
}

/** Join links for the events you are enrolled in, as `{ [eventId]: url }`. */
export function fetchEventLinks() {
  return read('/academy/event-links/')
}

/** PDFs from every course you are enrolled in. */
export async function fetchMaterials() {
  const rows = await read('/academy/materials/')
  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    path: m.storage_path,
    sizeBytes: m.size_bytes,
    course: m.course ?? '',
  }))
}

/** A ten-minute link to one PDF. Refused to anyone not enrolled. */
export async function materialUrl(path) {
  const { ok, status, data } = await api('/academy/materials/url/', { method: 'POST', body: { path } })
  if (!ok) throw new Error(data?.reason ?? `material ${status}`)
  return data.url
}

/** `pay` is 'wallet' or 'razorpay'. Returns the server's `{ ok, reason?, order_id?, status? }`. */
export async function enrol(itemType, itemId, pay) {
  const { ok, status, data } = await api('/academy/enrol/', {
    method: 'POST',
    body: { item_type: itemType, item_id: itemId, pay },
  })
  if (!ok) {
    console.error('[academy] enrol:', status)
    return { ok: false, reason: 'Could not reach the Academy. Try again.' }
  }
  return data
}
