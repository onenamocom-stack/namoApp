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
  const url = `${window.location.origin}${window.location.pathname}#${path}`
  if (navigator.share) {
    try {
      await navigator.share({ url, title })
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
