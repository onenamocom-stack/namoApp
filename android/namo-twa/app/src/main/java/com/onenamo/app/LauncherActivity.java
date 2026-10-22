/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.onenamo.app;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.google.firebase.messaging.FirebaseMessaging;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    

    

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
        // The FCM token for calls (22 Oct 2026): kept, and handed to 1namo.com
        // on this or the next launch.
        Calls.channels(this);
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t ->
                    getSharedPreferences(Calls.PREFS, MODE_PRIVATE).edit().putString(Calls.KEY_TOKEN, t).apply());
        } catch (Exception ignored) {
            // No Google Play services: calls ring through web push only.
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();
        // 1namo.com registers the install's FCM token for whoever signs in
        // (src/lib/push.js catchFcmToken), and takes it out of the address.
        String token = getSharedPreferences(Calls.PREFS, MODE_PRIVATE).getString(Calls.KEY_TOKEN, null);
        if (token != null && uri != null && uri.getQueryParameter("fcm") == null) {
            uri = uri.buildUpon().appendQueryParameter("fcm", token).build();
        }
        return uri;
    }
}
