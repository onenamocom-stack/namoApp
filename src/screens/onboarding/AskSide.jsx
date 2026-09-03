import { Link, useNavigate } from 'react-router-dom'
import Plate from '../../components/Plate.jsx'
import { Kicker } from '../../components/Pop.jsx'

/**
 * The fork, immediately after Intro.
 *
 * It sits before the birth questions on purpose: a consultant should not have
 * to give his own moment of birth to reach his own bookings. The seeker branch
 * carries on into the four questions; the consultant branch skips straight to
 * the practice, since he is pinned to an existing record.
 *
 * Two tappable cards rather than a QuestionFrame — there is nothing to
 * validate and nothing to continue past, so a Continue button would be a
 * second tap for no reason.
 *
 * The consultant branch used to link straight to `/pro/studio`, which is how
 * anyone who tapped it became consultants[0] with no account at all. It now
 * carries `?next=pro` through the same name and phone steps the seeker takes,
 * and lands on the application instead of the birth questions — a consultant
 * still does not give us his own moment of birth.
 *
 * `signInTo` is the other door, straight to the phone step with nothing to
 * fill in first — this is what closes the gap where a returning person had
 * to re-answer name/date/time/place just to reach the code screen. It carries
 * the same `?next=pro` a side already threads, because which door is which
 * account is still the one thing this screen has to decide.
 */
const SIDES = [
  {
    key: 'seeker',
    to: '/onboarding/name',
    signInTo: '/onboarding/phone?mode=signin',
    kicker: 'I want a reading',
    line: 'Bring the question you have been rewriting in your head. Not the polite version of it.',
    art: 'orbit',
  },
  {
    key: 'pro',
    to: '/onboarding/name?next=pro',
    signInTo: '/onboarding/phone?mode=signin&next=pro',
    kicker: 'I give readings',
    line: 'You take the sessions. We take the scheduling, the payments and the arguing about time zones.',
    art: 'contour',
  },
]

export default function AskSide() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-full flex-col px-5 pb-10 pt-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="text-body text-t2 transition-transform duration-150 hover:-translate-x-0.5 active:-translate-x-1"
      >
        ←
      </button>

      <h1 className="mx-auto mt-8 max-w-[14ch] text-center text-display font-light">
        Which side of the chart are you on?
      </h1>

      <div className="mt-10 space-y-4">
        {SIDES.map((s) => (
          <div key={s.key} className="pop-card overflow-hidden">
            <Link to={s.to} className="pop-tap block">
              <Plate seed={`side-${s.key}`} variant={s.art} className="!rounded-none h-28 w-full !shadow-none" />
              <span className="block p-5 pb-3">
                <Kicker>{s.kicker}</Kicker>
                <span className="mt-2 block text-meta t-sub">{s.line}</span>
              </span>
            </Link>
            <Link
              to={s.signInTo}
              className="block border-t border-rule px-5 py-3 text-center text-meta text-t2 underline"
            >
              Already have an account? Sign in
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-auto pt-10 text-center text-micro uppercase tracking-caps text-t3">
        Takes about a minute
      </p>
    </div>
  )
}
