import { useState } from 'react'
import { REPORT_REASONS, report } from '../lib/content.js'
import { Sheet } from './Chrome.jsx'
import { PopButton } from './Pop.jsx'
import { useStore } from '../store.jsx'

/**
 * "Report" — one sheet, three callers.
 *
 * A post card in the feed, a reel, and a person's profile all raise this.
 * The only difference is what is being reported, which is the `contentId`
 * / `profileId` pair: with a content id it is a post, without one it is
 * the account. The copy changes with it, because "report this post" and
 * "report this person" are not the same accusation and a sheet that says
 * the wrong one gets the wrong reports filed.
 *
 * WHY A SHEET AND NOT A CONFIRM DIALOG. A reason is required, and a list
 * of five is a thing you read rather than a thing you dismiss. The note is
 * optional and last, because most reports do not need one and a required
 * text box is how you get reports that say "bad".
 *
 * WHAT IT PROMISES. Nothing about the post. The closing line says somebody
 * will look, and that is the whole promise the product can keep: a report
 * never removes anything by itself, however many arrive (see
 * apps/content/services.py). Telling the reporter "this has been removed"
 * when it has not is the one thing that would make this untrustworthy.
 */
export default function ReportSheet({ open, onClose, contentId = null, profileId = null, name }) {
  const { showToast } = useStore()
  const [reason, setReason] = useState(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const aboutAPerson = !contentId

  function close() {
    setReason(null)
    setNote('')
    onClose()
  }

  async function send() {
    if (!reason || sending) return
    setSending(true)
    try {
      await report({ contentId, profileId, reason, note })
      // The same words whether this was the first report or the fourth.
      // The server answers ok either way, and a seeker who is told "you
      // already reported this" taps again looking for a different result.
      showToast('Reported. Someone will look at this.')
      close()
    } catch (err) {
      showToast(err.message || 'Could not send that report')
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title={aboutAPerson ? 'Report this person' : 'Report this post'}>
      <p className="text-meta t-sub">
        {aboutAPerson
          ? `Tell us what ${name || 'this person'} is doing. An admin reads every report.`
          : 'Tell us what is wrong with it. An admin reads every report.'}
      </p>

      <ul className="mt-5 space-y-2">
        {REPORT_REASONS.map((r) => (
          <li key={r.value}>
            <button
              type="button"
              onClick={() => setReason(r.value)}
              aria-pressed={reason === r.value}
              className={`w-full rounded-lg border px-4 py-3 text-left text-body transition-colors ${
                reason === r.value
                  ? 'border-t1 bg-surface-2 text-t1'
                  : 'border-rule text-t2 hover:border-t3'
              }`}
            >
              {r.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Optional, and last. A required note gets you reports that say
          "bad"; an optional one gets you the few that are actually worth
          reading. */}
      <label className="mt-5 block">
        <span className="caps-sm t-faint">Anything to add (optional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          className="mt-2 w-full resize-none rounded-lg border border-rule bg-transparent p-3 text-body text-t1 outline-none transition-colors placeholder:text-t4 focus:border-t1"
          placeholder="What should the admin know?"
        />
      </label>

      <PopButton
        variant="gold"
        className="mt-5 w-full"
        onClick={send}
        disabled={!reason || sending}
      >
        {sending ? 'Sending…' : 'Send report'}
      </PopButton>

      {/* Said plainly, because the alternative is somebody refreshing the
          feed to see whether the post is gone. */}
      <p className="mt-4 text-micro t-faint">
        Reporting does not remove anything on its own. An admin decides, and
        can take the post down or block the account.
      </p>
    </Sheet>
  )
}
