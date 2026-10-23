# The Android app's own code

`com.onenamo.app` is a Trusted Web Activity of https://1namo.com built with
Bubblewrap; the full project, the JDK, the SDK and the upload key live on
the owner's laptop in `~/android-build/` (HANDOFF §84). This folder keeps a
copy of the files changed by hand there, so they are not lost with the
laptop: the FCM call ring of 22 Oct 2026 (`Calls.java`,
`CallMessagingService.java`, `CallActivity.java`, `LauncherActivity.java`,
the manifest and both Gradle files). Copy them back over the Bubblewrap
project before building. `google-services.json` is not kept here.

## What a call needs on the phone

A call rings a locked phone full screen only when all of these hold. The
app's ring reports (`Calls.report`, in namo-api's request log under
`/v1/health/?fcm=`) show most of them as `notif`, `fsi` and `batt` (the battery exemption).

Asked of the person:

| Permission | Without it | Who asks |
|---|---|---|
| Notifications (Android 13+) | Nothing rings | The app, before the site opens on the first launch |
| Full screen notifications (Android 14+, Settings > Apps > Special access) | A locked phone vibrates; the call screen never opens | The app opens the setting once a day while it is off. Off by default for an APK installed by hand, and Samsung turned it off again when 1.0.6 was installed over 1.0.5 (23 Oct 2026). A Play install declared as a calling app gets it by default |
| Battery: Unrestricted (Settings > Apps > Namo > Battery) | A sleeping phone may get nothing | Nobody. 1.0.5-1.0.6 asked through `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; 1.0.7 dropped it (23 Oct 2026) because Play restricts it and the tests showed the full-screen setting, not battery, kept a locked phone silent. Support tells a person to set it by hand if rings stop |
| Microphone | No audio or video call | The site, on the first call |
| Camera | No video call | The site, on the first video call |

Phone settings that are on by default and must stay on: notifications on the
lock screen, the app's "Calls" category, and Namo out of Samsung's "Sleeping
apps" and "Deep sleeping apps".

Granted at install without asking: internet, vibrate, wake lock.

The Play listing must declare the full-screen intent as a calling app's.
