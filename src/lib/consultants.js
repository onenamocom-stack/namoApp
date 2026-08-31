import { supabase } from './supabase.js'

/**
 * Every read of a consultant, their prices and their open slots, in one file.
 *
 * The point is `openSlots`. Before phase 4 the seeker's booking sheet and the
 * consultant's own availability grid each computed the answer themselves, and
 * they disagreed: one applied booked slots always, the other only when the
 * weekday happened to be Thursday. Two implementations of one rule is the bug
 * that comes back, so there is one caller-facing function here and one
 * function in the database behind it, and neither side does arithmetic.
 *
 * Slot times are IST and the horizon is 14 days. Both are decided in
 * `backend/schema/009_slots.sql` — this file must not re-state them, or
 * there are two answers again.
 */

/**
 * A row from `consultants_public` in the shape the screens already read, with
 * its prices attached.
 *
 * `initials` is derived here rather than stored: it is a rendering of the
 * name, and a column holding it would be a second thing to keep in step.
 * `pricePaise` is the 20-minute session — the one the whole app quotes
 * against — and `perMinutePaise` the instant-call rate, both straight off
 * `consultant_services`. Neither is computed from the other.
 */
function shape(row, services = []) {
  const fixed = services
    .filter((s) => s.billing === 'fixed')
    .sort((a, b) => a.duration_mins - b.duration_mins)
  const base = fixed.find((s) => s.duration_mins === 20) ?? fixed[0] ?? null
  const perMinute = services.find((s) => s.billing === 'per_minute') ?? null

  return {
    id: row.profile_id,
    name: row.name,
    initials: (row.name || '')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
    category: row.category,
    specialization: row.specialization ?? '',
    languages: row.languages ?? [],
    experienceYrs: row.experience_yrs,
    bio: row.bio ?? '',
    credentials: row.credentials ?? [],
    verified: row.verified,
    rating: row.rating_avg_cache,
    reviewCount: row.rating_count_cache,
    fixed,
    perMinute,
    pricePaise: base?.price_paise ?? null,
    perMinutePaise: perMinute?.price_paise ?? null,
  }
}

/** The approved consultants, from the view. Never from `profiles`. */
export async function listConsultants() {
  const { data, error } = await supabase
    .from('consultants_public')
    .select('*')
    .order('rating_avg_cache', { ascending: false, nullsFirst: false })
  if (error) {
    console.error('[consultants] list failed:', error.message)
    return []
  }
  const rows = data ?? []
  if (!rows.length) return []

  /* One query for every price rather than one per consultant. The list is six
     people today and will not be six forever. */
  const { data: services } = await supabase
    .from('consultant_services')
    .select('*')
    .in('consultant_id', rows.map((r) => r.profile_id))
    .eq('active', true)

  const byConsultant = new Map()
  for (const s of services ?? []) {
    if (!byConsultant.has(s.consultant_id)) byConsultant.set(s.consultant_id, [])
    byConsultant.get(s.consultant_id).push(s)
  }

  return rows.map((r) => shape(r, byConsultant.get(r.profile_id) ?? []))
}

/**
 * One consultant, or null.
 *
 * Null is the same answer for "no such id", "not approved yet" and "blocked",
 * and that is deliberate: an unapproved consultant is invisible, not
 * forbidden. The predicate is the view's, so a typed URL cannot reach past it.
 */
export async function getConsultant(id) {
  const { data, error } = await supabase
    .from('consultants_public')
    .select('*')
    .eq('profile_id', id)
    .maybeSingle()
  if (error) console.error('[consultants] load failed:', error.message)
  if (!data) return null
  return shape(data, await listServices(id))
}

/** A consultant's price list. Paise, priced off a platform band, never typed. */
export async function listServices(id) {
  const { data, error } = await supabase
    .from('consultant_services')
    .select('*')
    .eq('consultant_id', id)
    .eq('active', true)
    .order('sort')
  if (error) console.error('[services] load failed:', error.message)
  return data ?? []
}

/**
 * The open slots for one consultant on one date, as
 * `[{ slot: 'HH:MM', startsAt }]`.
 *
 * The server subtracts time off and claimed slots; this returns what is left.
 * A slot is claimed at `pending`, not at `confirmed` — a request holds the
 * time while the consultant decides.
 *
 * `startsAt` is the server's own timestamp, carried through untouched, and it
 * is what `bookSession` hands back. The browser must never rebuild it from the
 * date and the `'HH:MM'`: an IST midnight parsed here reads as the previous
 * UTC day, which is the phase 4 bug that shifted every row of the grid.
 */
export async function openSlots(id, isoDate) {
  const { data, error } = await supabase.rpc('consultant_open_slots', {
    p_consultant_id: id,
    p_date: isoDate,
  })
  if (error) {
    console.error('[slots] load failed:', error.message)
    return []
  }
  return (data ?? []).map((r) => ({ slot: r.slot_time.slice(0, 5), startsAt: r.starts_at }))
}

/** A consultant's own availability rules — the 7 × 6 grid, one row per open
 *  cell. Their own rows only; the seeker never reads this table directly,
 *  they read the subtraction. */
export async function listAvailability(id) {
  const { data, error } = await supabase
    .from('consultant_availability')
    .select('weekday, slot_time')
    .eq('consultant_id', id)
  if (error) console.error('[availability] load failed:', error.message)
  return (data ?? []).map((r) => ({ weekday: r.weekday, slot: r.slot_time.slice(0, 5) }))
}

/** One cell of the grid, on or off. One INSERT or one DELETE, which is why
 *  availability is a row per open slot rather than a range. */
export async function setAvailability(id, weekday, slot, open) {
  const { error } = open
    ? await supabase.from('consultant_availability').insert({ consultant_id: id, weekday, slot_time: slot })
    : await supabase
        .from('consultant_availability')
        .delete()
        .match({ consultant_id: id, weekday, slot_time: slot })
  if (error) console.error('[availability] write failed:', error.message)
  return !error
}

/* ── Bookings ─────────────────────────────────────────────────────────────── */

/** Every booking on this consultant, newest slot first. Read through the view,
 *  which is what carries the seeker's name — `profiles` is own-row-only. */
export async function listBookings(consultantId) {
  const { data, error } = await supabase
    .from('bookings_view')
    .select('*')
    .eq('consultant_id', consultantId)
    .order('starts_at', { ascending: false })
  if (error) console.error('[bookings] load failed:', error.message)
  return data ?? []
}

/** Every booking this seeker has made, newest slot first. Same view as the
 *  consultant's queue, restricting itself by the same predicate — it is what
 *  carries the other party's name, since `profiles` is own-row-only. */
export async function listMyBookings(seekerId) {
  const { data, error } = await supabase
    .from('bookings_view')
    .select('*')
    .eq('seeker_id', seekerId)
    .order('starts_at', { ascending: false })
  if (error) console.error('[bookings] load failed:', error.message)
  return data ?? []
}

/**
 * Book a session. One call, one transaction on the server: the price lookup,
 * the slot claim, the wallet debit, both ledgers, the order and the booking.
 *
 * It sends `{ consultantId, serviceId, startsAt }` and NO PRICE — the total
 * this screen renders is for the person reading it, never for the server
 * (backend/INSTRUCTIONS.md rule 3). `startsAt` comes back from `openSlots`
 * unmodified; nothing here builds a timestamp.
 *
 * Returns the server's own `{ ok, reason }`, so a refusal is shown in the
 * words the server chose rather than a second vocabulary invented here.
 */
export async function bookSession(consultantId, serviceId, startsAt) {
  const { data, error } = await supabase.rpc('book_session', {
    p_consultant_id: consultantId,
    p_service_id: serviceId,
    p_starts_at: startsAt,
  })
  if (error) {
    console.error('[bookings] booking failed:', error.message)
    return { ok: false, reason: 'Could not reach the diary. Try again.' }
  }
  return data
}

/**
 * Accept or decline. A real status write, not a flag — tapping Accept twice
 * cannot un-accept, because the policy only allows the move *out of* pending.
 *
 * A decline reverses the money, and that happens on the server: a trigger on
 * the status change writes the credit. There is deliberately no second call
 * here to forget — 012_bookings_transaction.sql.
 */
export async function decideBooking(id, status) {
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
  if (error) console.error('[bookings] decision failed:', error.message)
  return !error
}

/* ── Dates ──────────────────────────────────────────────────────────────────
   The database speaks (weekday, time) and dates; the screens speak "today" and
   "Thu". These two functions are the whole translation, and they are here
   rather than in a screen so both sides use the same one. */

/** Today in IST, as `YYYY-MM-DD`. The app is Indian; slot times are IST. */
export function istToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

/** `0 = Sunday … 6 = Saturday`, matching Postgres `dow` and the `weekday`
 *  column. `weekDays` in mock.js starts on Monday, so screens index into that
 *  array — they never re-derive the number.
 *
 *  Anchored at NOON UTC, which is not fussiness. `T00:00:00+05:30` is half
 *  past six the previous evening in UTC, so `getUTCDay()` on it returns the
 *  day before — the consultant's grid struck out Wednesday for a Thursday
 *  booking, every row shifted by one, and it looked like a data problem. Noon
 *  is the same calendar day in every zone on earth. */
export function weekdayOf(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay()
}

/** The next date, today included, falling on this weekday. */
export function nextDateFor(weekday) {
  const today = istToday()
  const ahead = (weekday - weekdayOf(today) + 7) % 7
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ahead)
  return d.toISOString().slice(0, 10)
}

/** The consultant's own book — gross, the platform's cut and net, one row per
 *  movement. A decline writes a second, negative row rather than editing the
 *  first, so a session that was refused nets to zero here instead of
 *  disappearing. Paise. */
export async function listEarnings(consultantId) {
  const { data, error } = await supabase
    .from('earnings_ledger')
    .select('*')
    .eq('consultant_id', consultantId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) console.error('[earnings] load failed:', error.message)
  return data ?? []
}
