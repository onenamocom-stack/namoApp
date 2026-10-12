import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from './Chrome.jsx'
import { checkUsername, saveUsername } from '../lib/profile.js'
import { useStore } from '../store.jsx'

/**
 * Your username, the readable half of your profile link: 1namo.com/<name>
 * (11 Oct 2026, Rahul). Everybody starts with name-surname-1234; this sheet
 * changes it, once every 30 days. The server checks each name as you type
 * and says which rule it breaks — the rules are not repeated here.
 */
export function usernameNote(profile) {
  return profile?.username ? `1namo.com/${profile.username}` : 'Not set yet'
}

export default function UsernameSheet({ onClose }) {
  const { profile, refreshProfile, session, showToast } = useStore()
  const current = profile?.username ?? ''
  const [draft, setDraft] = useState(current)
  const [check, setCheck] = useState(null)
  const [saving, setSaving] = useState(false)
  const name = draft.trim().toLowerCase()
  const unchanged = name === current

  // Checked a moment after typing stops, not on every key.
  useEffect(() => {
    if (unchanged || !name) {
      setCheck(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      checkUsername(name).then((r) => live && setCheck(r))
    }, 350)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [name, unchanged])

  async function save() {
    setSaving(true)
    try {
      await saveUsername(name)
      await refreshProfile(session?.user?.id)
      showToast(`Your link is 1namo.com/${name}`)
      onClose()
    } catch (err) {
      showToast(err.message)
      setSaving(false)
    }
  }

  const ready = !unchanged && check?.ok && check.username === name && !saving

  return createPortal(
    <div className="fixed inset-y-0 left-1/2 z-[60] w-full max-w-[420px] -translate-x-1/2">
      <Sheet open onClose={onClose} title="Username">
        <p className="text-meta t-sub">
          Your profile link. At least 8 characters: letters, numbers, dot and dash. You can change
          it once every 30 days, and the old link stops working.
        </p>
        <label className="mt-4 flex items-center rounded-xl border border-rule bg-white px-3 py-2.5 focus-within:border-gold-fill">
          <span className="text-meta t-faint">1namo.com/</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\s/g, ''))}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            aria-label="Username"
            className="min-w-0 flex-1 bg-transparent text-meta t-heading outline-none"
          />
        </label>
        <p className={`mt-2 min-h-[1.25rem] text-micro ${check && !check.ok ? 'text-bad' : 't-faint'}`}>
          {unchanged
            ? 'This is your username now.'
            : !check || check.username !== name
              ? 'Checking…'
              : check.ok
                ? 'Available.'
                : check.message}
        </p>
        {profile?.username_changed_at && (
          <p className="text-micro t-faint">
            Last changed {new Date(profile.username_changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!ready}
          className="mt-5 flex w-full items-center justify-center rounded-xl bg-gold-fill py-3 text-center text-meta font-semibold text-white disabled:opacity-40"
        >
          {saving ? 'Saving' : 'Save'}
        </button>
      </Sheet>
    </div>,
    document.body,
  )
}
