import { useState } from 'react'
import { deleteMyAccount } from '../lib/profile.js'
import { signOut } from '../lib/signout.js'
import { useStore } from '../store.jsx'
import { PopButton } from './Pop.jsx'

/**
 * Delete my account (19 Oct 2026, Rahul: what Google Play asks of a social
 * app — in the app, and at 1namo.com/delete-account.html). Says plainly what
 * goes and what the law keeps, then asks for the word DELETE, so a stray tap
 * cannot do it. The server does the deleting (`profiles.delete_account`).
 */
export default function DeleteAccount() {
  const { showToast } = useStore()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    if (busy) return
    setBusy(true)
    try {
      await deleteMyAccount(word)
      showToast('Your account is deleted.')
      await signOut()
    } catch (err) {
      showToast(err.message)
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full py-2 text-center text-micro font-semibold text-live underline-offset-2 hover:underline"
      >
        Delete my account
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Delete my account" className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50">
          <div className="w-full max-w-[420px] rounded-t-3xl bg-white px-5 pb-8 pt-5">
            <p className="text-lead font-semibold t-heading">Delete my account</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-meta t-body">
              <li>Your name, phone number, birth details, photo, username and bio are deleted.</li>
              <li>Your posts, reels, comments and profile disappear from Namo.</li>
              <li>A Pro or seller account stops, and your referral code stops working.</li>
              <li>Money left in your wallet cannot be returned after this.</li>
              <li>Payment, order and earnings records are kept without your name, as the law requires.</li>
            </ul>
            <p className="mt-4 text-meta t-sub">This cannot be undone. Type DELETE to confirm.</p>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              autoCapitalize="characters"
              placeholder="DELETE"
              aria-label="Type DELETE"
              className="mt-2 w-full rounded-xl border border-rule px-4 py-3 text-body outline-none focus:border-live"
            />
            <PopButton
              variant="ghost"
              className="mt-4 w-full !border-live !text-live"
              disabled={word.trim().toUpperCase() !== 'DELETE' || busy}
              onClick={go}
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </PopButton>
            <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full py-2 text-center caps-sm t-sub">
              Keep my account
            </button>
          </div>
        </div>
      )}
    </>
  )
}
