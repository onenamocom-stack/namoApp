import { useCallback, useEffect, useState } from 'react'
import { Sheet } from './Chrome.jsx'
import { PopButton } from './Pop.jsx'
import { firstName } from './Primitives.jsx'
import { listMyBookings } from '../lib/consultants.js'
import { listSessions } from '../lib/chat.js'
import Icon from './Icon.jsx'
import { leaveReview, reviewableBookings, reviewableSessions } from '../lib/content.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Your booked sessions — in the chat panel's Sessions tab since 5 Oct 2026
 * (owner's call), where they sat on Consult before. Real rows from
 * `bookings_view`, so a booking survives a reload; a session waiting on your
 * review comes first, whatever its date.
 */
export default function MySessions({ calls: withCalls = true, pastOnly = false }) {
  const { session, t } = useStore()
  const [mine, setMine] = useState(null)
  const [calls, setCalls] = useState(null)
  const [reviewable, setReviewable] = useState([])
  // Calls and chats that can still be reviewed (17 Oct 2026).
  const [reviewableCalls, setReviewableCalls] = useState([])
  const [reviewing, setReviewing] = useState(null)

  useEffect(() => {
    let live = true
    const uid = session?.user?.id
    if (uid) {
      listMyBookings(uid).then((rows) => live && setMine(rows)).catch(() => live && setMine([]))
      // Calls and chats by the minute (5 Oct 2026) — they were in nobody's
      // history: the seeker could see the money go and nowhere it went.
      listSessions().then((rows) =>
        live &&
        setCalls(
          (rows ?? []).filter(
            (r) => String(r.seeker_id).replace(/-/g, '') === String(uid).replace(/-/g, '') && r.accepted_at,
          ),
        ),
      )
    } else {
      setMine([])
      setCalls([])
    }
    return () => {
      live = false
    }
  }, [session])

  const reloadReviewable = useCallback(() => {
    reviewableBookings()
      .then(setReviewable)
      .catch((err) => console.error('[reviews] load failed:', err.message))
    reviewableSessions()
      .then((rows) => setReviewableCalls(rows ?? []))
      .catch((err) => console.error('[reviews] sessions load failed:', err.message))
  }, [])

  useEffect(() => {
    if (!session) {
      setReviewableCalls([])
      return setReviewable([])
    }
    reloadReviewable()
  }, [session, reloadReviewable])

  if (mine === null || calls === null) {
    return pastOnly ? null : <p className="px-5 py-8 text-center text-meta t-faint">{t('ord.loading')}</p>
  }
  /* In the one consult list (14 Oct 2026) only bookings already past show
     here: the ones ahead are Upcoming, and calls are Recently connected. */
  const now = Date.now()
  const booked = pastOnly
    ? mine.filter((b) => !(['pending', 'confirmed'].includes(b.status) && Date.parse(b.starts_at) + (b.duration_mins || 0) * 6e4 > now))
    : mine
  const callRows = withCalls ? calls : []
  if (!booked.length && !callRows.length) {
    return pastOnly ? null : <p className="px-5 py-8 text-center text-meta t-faint">{t('con.noSessions')}</p>
  }

  const shown = [
    ...booked.filter((b) => reviewable.some((r) => r.id === b.id)),
    ...booked.filter((b) => !reviewable.some((r) => r.id === b.id)),
  ]

  return (
    <>
      {callRows.length > 0 && (
        <>
          <p className="px-4 pt-4 caps-sm t-faint">Calls and chats</p>
          <ul className="space-y-2 px-4 pt-2">
            {callRows.map((r) => (
              <li key={r.id} className="pop-inset flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface t-body">
                  <Icon name={r.mode === 'chat' ? 'chat' : r.audio_only ? 'phone' : 'video'} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-meta t-heading">{r.consultant_name}</span>
                  <span className="mt-0.5 block caps-sm gold tnum">
                    {new Date(r.started_at || r.accepted_at).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Kolkata',
                    })}{' '}
                    · {minutesOf(r)}
                  </span>
                </span>
                <span className="flex-none text-right">
                  {r.status === 'live' ? (
                    <span className="block caps-sm text-ok">Live now</span>
                  ) : (
                    <span className="block caps-sm tnum t-heading">₹{rupees(r.charged_paise ?? 0)}</span>
                  )}
                  {reviewableCalls.some((x) => x.id === r.id) && (
                    <button
                      type="button"
                      onClick={() => setReviewing({ ...r, kind: 'session' })}
                      className="act-link mt-0.5 block caps-sm"
                    >
                      {t('con.review')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {booked.length > 0 && <p className="px-4 pt-5 caps-sm t-faint">{pastOnly ? 'Past bookings' : 'Booked slots'}</p>}
      <ul className="space-y-2 px-4 py-2">
        {shown.map((b) => (
          <li key={b.id} className="pop-inset flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-meta t-heading">{b.consultant_name}</span>
              <span className="mt-0.5 block caps-sm gold tnum">
                {new Date(b.starts_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Kolkata',
                })}{' '}
                · {t('a.min', { n: b.duration_mins })}
              </span>
            </span>
            <span className="flex-none text-right">
              <span className="block caps-sm tnum t-heading">₹{rupees(b.amount_paise)}</span>
              {reviewable.some((r) => r.id === b.id) ? (
                <button type="button" onClick={() => setReviewing({ ...b, kind: 'booking' })} className="act-link mt-0.5 block caps-sm">
                  {t('con.review')}
                </button>
              ) : (
                <span className={`mt-0.5 block caps-sm ${STATUS[b.status]?.tone ?? 't-faint'}`}>
                  {STATUS[b.status] ? t(STATUS[b.status].label) : b.status}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <ReviewSheet
        item={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null)
          reloadReviewable()
        }}
      />
    </>
  )
}

/**
 * Leaving a review.
 *
 * The rating is required and the words are not — a star with no sentence is
 * still a signal, and demanding prose is how review counts stay at three.
 *
 * There is no client-side check that the booking is completed and unreviewed.
 * The RLS policy is the enforcement (`020_content_reviews.sql`), and a second
 * copy of the rule here would be a second thing to keep in step. What this does
 * instead is show the server's refusal in the app's voice.
 */
export function ReviewSheet({ item, onClose, onDone }) {
  const { showToast, t } = useStore()
  const [rating, setRating] = useState(0)
  const [solved, setSolved] = useState(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  /* Reset when a different booking opens the sheet, so last time's four stars
     are not sitting there waiting to be submitted against somebody else. */
  useEffect(() => {
    setRating(0)
    setSolved(null)
    setBody('')
  }, [item?.id])

  if (!item) return null

  async function submit() {
    setBusy(true)
    try {
      await leaveReview({
        bookingId: item.kind === 'session' ? null : item.id,
        sessionId: item.kind === 'session' ? item.id : null,
        consultantId: item.consultant_id,
        rating,
        solved,
        body: body.trim() || null,
      })
      // A 1 or 2 star review waits for the console (20 Oct 2026).
      showToast(t(rating <= 2 ? 'con.reviewPosted' : 'con.reviewLive'))
      onDone()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('con.reviewTitle', { name: firstName(item.consultant_name) })}>
      <div className="px-5 pb-6">
        <p className="prose-c">{t('con.rateNote')}</p>

        <div className="mt-5 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} out of 5`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-body leading-none tnum transition-colors ${
                n <= rating ? 'border-gold bg-gold/10 t-heading' : 'border-rule t-faint'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* "Is your answer solved", Yes or No (20 Oct 2026, Rahul). */}
        <p className="mt-6 text-center text-meta t-heading">{t('con.solvedQ')}</p>
        <div className="mt-3 flex justify-center gap-3">
          {[
            [true, 'con.solvedYes'],
            [false, 'con.solvedNo'],
          ].map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={solved === value}
              onClick={() => setSolved(value)}
              className={`h-11 min-w-24 rounded-full border px-5 text-body transition-colors ${
                solved === value ? 'border-gold bg-gold/10 t-heading' : 'border-rule t-faint'
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={t('con.reviewPh')}
          aria-label="Your review"
          className="mt-5 w-full resize-none border-b border-rule bg-transparent pb-2 text-body outline-none transition-colors placeholder:text-t4 focus:border-gold t-sub"
        />

        <PopButton
          variant="gold"
          className="mt-6"
          disabled={!rating || solved === null || busy}
          onClick={submit}
        >
          {busy
            ? t('con.posting')
            : !rating
              ? t('con.pickRating')
              : solved === null
                ? t('con.pickSolved')
                : t('con.postReview')}
        </PopButton>
        <button type="button" onClick={onClose} className="mt-4 block w-full text-center caps-sm t-faint">
          {t('con.notNow')}
        </button>
        <p className="mt-3 text-center text-micro t-faint">{t('con.reviewChecked')}</p>
      </div>
    </Sheet>
  )
}

/**
 * The seven booking statuses as a seeker reads them, and what colour each one
 * is. Rendering `b.status` raw printed the enum — `no_show` came out as
 * "NO_SHOW" under `caps-sm` — and colouring everything except `declined` with
 * `text-ok` painted a cancelled or missed session as a green success row.
 * `03-APP-FLOW.md` §8.1 is the machine; this is its vocabulary.
 */
const STATUS = {
  pending: { label: 'con.st.pending', tone: 't-faint' },
  confirmed: { label: 'con.st.confirmed', tone: 'text-ok' },
  completed: { label: 'con.st.completed', tone: 'text-ok' },
  declined: { label: 'con.st.declined', tone: 't-faint' },
  cancelled: { label: 'con.st.cancelled', tone: 't-faint' },
  rescheduled: { label: 'con.st.rescheduled', tone: 't-faint' },
  no_show: { label: 'con.st.noShow', tone: 't-faint' },
}


/** "3 min", or why there is no number. */
function minutesOf(r) {
  if (r.status === 'live') return r.started_at ? 'in progress' : 'connecting'
  if (!r.started_at) return 'did not connect'
  const secs = (new Date(r.ended_at) - new Date(r.started_at)) / 1000
  return `${Math.max(1, Math.round(secs / 60))} min`
}

/** "Today 6:30 pm", "Tomorrow 11:00 am", "Sat 18 Oct, 7:00 pm", in IST. */
function whenIs(iso) {
  const tz = 'Asia/Kolkata'
  const day = (d) => d.toLocaleDateString('en-CA', { timeZone: tz })
  const at = new Date(iso)
  const time = at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const today = new Date()
  const tomorrow = new Date(Date.now() + 864e5)
  if (day(at) === day(today)) return `Today ${time}`
  if (day(at) === day(tomorrow)) return `Tomorrow ${time}`
  const date = at.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })
  return `${date}, ${time}`
}

/**
 * Sessions you have booked that are still ahead, the nearest first, at the
 * top of the consult panel (14 Oct 2026, Rahul: one list, "remember to
 * attend"). Nothing when there are none.
 */
export function UpcomingSessions() {
  const { session, t } = useStore()
  const [rows, setRows] = useState([])

  useEffect(() => {
    let live = true
    const uid = session?.user?.id
    if (uid) {
      listMyBookings(uid)
        .then((all) => {
          const now = Date.now()
          const ahead = (all ?? [])
            .filter((b) => ['pending', 'confirmed'].includes(b.status) && Date.parse(b.starts_at) + (b.duration_mins || 0) * 6e4 > now)
            .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
          if (live) setRows(ahead)
        })
        .catch(() => {})
    }
    return () => {
      live = false
    }
  }, [session])

  if (!rows.length) return null
  return (
    <section className="border-b border-rule pb-3">
      <p className="px-4 pb-1 pt-3 caps-sm t-faint">Upcoming</p>
      <ul className="space-y-2 px-4 pt-1">
        {rows.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-xl border border-gold-fill/40 bg-gold-fill/5 p-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white gold">
              <Icon name="calendar" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-meta font-semibold t-heading">{b.consultant_name}</span>
              <span className="mt-0.5 block text-[12px] font-semibold gold tnum">
                {whenIs(b.starts_at)} · {t('a.min', { n: b.duration_mins })}
              </span>
              <span className="mt-0.5 block text-[12px] font-semibold gold">
                {b.status === 'pending' ? 'Waiting for them to confirm' : 'Remember to attend'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
