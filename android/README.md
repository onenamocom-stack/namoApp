# The Android app's own code

`com.onenamo.app` is a Trusted Web Activity of https://1namo.com built with
Bubblewrap; the full project, the JDK, the SDK and the upload key live on
the owner's laptop in `~/android-build/` (HANDOFF §84). This folder keeps a
copy of the files changed by hand there, so they are not lost with the
laptop: the FCM call ring of 22 Oct 2026 (`Calls.java`,
`CallMessagingService.java`, `CallActivity.java`, `LauncherActivity.java`,
the manifest and both Gradle files). Copy them back over the Bubblewrap
project before building. `google-services.json` is not kept here.
