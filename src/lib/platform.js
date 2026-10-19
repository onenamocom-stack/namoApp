/**
 * Is this the Android app from the Play Store (a Trusted Web Activity of
 * 1namo.com), rather than a browser? (19 Oct 2026.)
 *
 * Google Play allows a digital purchase inside an app only through Google
 * Play's own billing, so the app does not sell paid listings, downloads,
 * muhurats or predictions (`Paywall`, `ListingPage`);
 * the website does. Physical products and consultations with a person are
 * not digital goods and are sold as everywhere else.
 *
 * Chrome opens the app with `document.referrer` set to the package, on the
 * first page only, so it is noted for the rest of the visit.
 */
const KEY = 'namo:android-app'
const PACKAGE = 'android-app://com.onenamo.app'

export function noteAndroidApp() {
  try {
    if (document.referrer.startsWith(PACKAGE)) sessionStorage.setItem(KEY, '1')
  } catch {
    /* storage off: treated as a browser */
  }
}

export function inAndroidApp() {
  try {
    return sessionStorage.getItem(KEY) === '1' || document.referrer.startsWith(PACKAGE)
  } catch {
    return false
  }
}
