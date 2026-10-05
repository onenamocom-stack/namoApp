import { useCallback, useEffect, useState } from 'react'
import { Sheet } from './Chrome.jsx'
import { PopButton } from './Pop.jsx'
import { firstName } from './Primitives.jsx'
import { listMyBookings } from '../lib/consultants.js'
import { leaveReview, reviewableBookings } from '../lib/content.js'
import { rupees, useStore } from '../store.jsx'

/**
 * Your booked sessions — in the chat panel's Sessions tab since 5 Oct 2026
 * (owner's call), where they sat on Consult before. Real rows from
 * `bookings_view`, so a booking survives a reload; a session waiting on your
 * review comes first, whatever its date.
 */
export default function MySessions() {
  const { session, t } = useStore()
  const [mine, setMine] = useState(null)
  const [reviewable, setReviewable] = useState([])
  const [reviewing, setReviewing] = useState(null)

  useEffect(() => {
    let live = true
    const uid = session?.user?.id
    if (uid) listMyBookings(uid).then((rows) => live && setMine(rows)).catch(() => live && setMine([]))
    else setMine([])
    return () => {
      live = false
    }
  }, [session])

  const reloadReviewable = useCallback(() => {
    reviewableBookings()
      .then(setReviewable)
      .catch((err) => console.error('[reviews] load failed:', err.message))
  }, [])

  useEffect(() => {
    if (!session) return setReviewable([])
    reloadReviewable()
  }, [session, reloadReviewable])

  if (mine === null) return <p className="px-5 py-8 text-center text-meta t-faint">{t('ord.loading')}</p>
  if (!mine.length) return <p className="px-5 py-8 text-center text-meta t-faint">{t('con.noSessions')}</p>

  const shown = [
    ...mine.filter((b) => reviewable.some((r) => r.id === b.id)),
    ...mine.filter((b) => !reviewable.some((r) => r.id === b.id)),
  ]

  return (
    <>
      <ul className="space-y-2 px-4 py-4">
        {shown.map((b) => (
          <li key={b.id} className="pop-inset flex items-center gap-3 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-meta t-heading">{b.consultant_name}</span>
              <span className="mt-0.5 block caps-sm t-faint tnum">
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
                <button type="button" onClick={() => setReviewing(b)} className="act-link mt-0.5 block caps-sm">
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
        booking={reviewing}
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
function ReviewSheet({ booking, onClose, onDone }) {
  const { showToast, t } = useStore()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  /* Reset when a different booking opens the sheet, so last time's four stars
     are not sitting there waiting to be submitted against somebody else. */
  useEffect(() => {
    setRating(0)
    setBody('')
  }, [booking?.id])

  if (!booking) return null

  async function submit() {
    setBusy(true)
    try {
      await leaveReview({
        bookingId: booking.id,
        consultantId: booking.consultant_id,
        rating,
        body: body.trim() || null,
      })
      showToast(t('con.reviewPosted'))
      onDone()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={t('con.reviewTitle', { name: firstName(booking.consultant_name) })}>
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
          disabled={!rating || busy}
          onClick={submit}
        >
          {busy ? t('con.posting') : rating ? t('con.postReview') : t('con.pickRating')}
        </PopButton>
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
