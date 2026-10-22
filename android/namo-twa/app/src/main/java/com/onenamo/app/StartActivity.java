package com.onenamo.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.google.firebase.messaging.FirebaseMessaging;

/**
 * The launcher icon's first stop (22 Oct 2026). The FCM token is made
 * asynchronously, so on an install's first launch it was not ready when the
 * app opened 1namo.com, and reached the site only on the next launch. With
 * no token kept yet this waits for it, at most 2.5 seconds, then opens the
 * app; once a token is kept it opens the app at once.
 */
public class StartActivity extends Activity {
    private boolean gone = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String kept = getSharedPreferences(Calls.PREFS, MODE_PRIVATE).getString(Calls.KEY_TOKEN, null);
        if (kept != null) {
            go();
            return;
        }
        new Handler(Looper.getMainLooper()).postDelayed(this::go, 2500);
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    getSharedPreferences(Calls.PREFS, MODE_PRIVATE).edit()
                            .putString(Calls.KEY_TOKEN, task.getResult()).apply();
                }
                go();
            });
        } catch (Exception e) {
            go();
        }
    }

    private void go() {
        if (gone) return;
        gone = true;
        Intent i = new Intent(this, LauncherActivity.class);
        if (getIntent() != null && getIntent().getData() != null) i.setData(getIntent().getData());
        startActivity(i);
        overridePendingTransition(0, 0);
        finish();
    }
}
