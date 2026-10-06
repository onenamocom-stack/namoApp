/**
 * Share a link to somewhere in this app.
 *
 * The phone's own share sheet where there is one (WhatsApp is where these
 * go), the clipboard where there is not. Returns the sentence to toast, or
 * null when the person dismissed the sheet — a cancelled share is not an
 * error and says nothing.
 *
 * This replaced toasts that said "link copied" and copied nothing.
 */
export async function shareLink(path, { title } = {}) {
  // A real address since the move off the hash router (6 Oct 2026).
  const url = `${window.location.origin}${path}`
  if (navigator.share) {
    try {
      // `text` too: WhatsApp drops `title` and shows only text and link.
      await navigator.share({ url, title, ...(title ? { text: title } : {}) })
      return null
    } catch (err) {
      if (err?.name === 'AbortError') return null
      // Any other refusal (an in-app browser that exposes share and then
      // blocks it) falls through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'Link copied'
  } catch {
    return 'Could not copy. Long-press the address bar to copy the link.'
  }
}
