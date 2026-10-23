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

import android.Manifest;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.google.firebase.messaging.FirebaseMessaging;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    

    

    // Calls need the app's own notification permission (Android 13+) and,
    // on Android 14+, full-screen notifications (22-23 Oct 2026: a fresh
    // install never asked, so nothing rang). Asked once, before the site opens.
    private static final String KEY_ASKED = "asked_notifications";
    private boolean asking = false;

    private boolean needsNotificationPermission() {
        return Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !getSharedPreferences(Calls.PREFS, MODE_PRIVATE).getBoolean(KEY_ASKED, false);
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return !asking;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        asking = false;
        launchTwa();
        askFullScreen();
    }

    // A call must reach a locked phone (23 Oct 2026: a Samsung in its
    // battery saver got nothing while locked). Android's own dialog, once.
    private void askBattery() {
        if (Build.VERSION.SDK_INT < 23) return;
        android.os.PowerManager pm = getSystemService(android.os.PowerManager.class);
        if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
        if (getSharedPreferences(Calls.PREFS, MODE_PRIVATE).getBoolean("asked_battery", false)) return;
        getSharedPreferences(Calls.PREFS, MODE_PRIVATE).edit().putBoolean("asked_battery", true).apply();
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
            // No such dialog on this phone.
        }
    }

    private void askFullScreen() {
        askBattery();
        if (Build.VERSION.SDK_INT < 34) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.canUseFullScreenIntent()) return;
        // Asked again each day while it is off (23 Oct 2026: once was easy
        // to pass by, and without it a locked phone only vibrates).
        long day = System.currentTimeMillis() / 86_400_000L;
        if (getSharedPreferences(Calls.PREFS, MODE_PRIVATE).getLong("asked_full_screen_day", -1) == day) return;
        getSharedPreferences(Calls.PREFS, MODE_PRIVATE).edit().putLong("asked_full_screen_day", day).apply();
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
            // No such screen on this phone: the call shows as a heads-up instead.
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        asking = needsNotificationPermission();
        super.onCreate(savedInstanceState);
        if (asking) {
            getSharedPreferences(Calls.PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ASKED, true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        } else {
            askFullScreen();
        }
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
        // On an install's first launch the token is not ready yet: when it
        // arrives, the app opens 1namo.com once more with it, so the site
        // registers it without waiting for the next launch.
        final boolean hadToken = getSharedPreferences(Calls.PREFS, MODE_PRIVATE).getString(Calls.KEY_TOKEN, null) != null;
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> {
                getSharedPreferences(Calls.PREFS, MODE_PRIVATE).edit().putString(Calls.KEY_TOKEN, t).apply();
                if (!hadToken && t != null && !asking) {  // while asking, the delayed launch carries it
                    try {
                        startActivity(Calls.openApp(getApplicationContext(), "/?fcm=" + Uri.encode(t)));
                    } catch (Exception ignored) {
                        // The next launch brings it.
                    }
                }
            });
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
