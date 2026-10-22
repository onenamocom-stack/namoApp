package com.onenamo.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** FCM's door into the app (22 Oct 2026): rings a call, or shows an update. */
public class CallMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> d = message.getData();
        String type = d.get("type");
        String session = d.get("session_id");
        String title = d.containsKey("title") ? d.get("title") : "NAMO";
        String body = d.containsKey("body") ? d.get("body") : "";
        String open = d.containsKey("open") ? d.get("open") : "/";
        if ("incoming".equals(type) || "connecting".equals(type)) {
            Calls.ring(this, type, session, title, body, open);
        } else {
            Calls.plain(this, session, title, body, open);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // Kept for the next launch, which hands it to 1namo.com (LauncherActivity).
        getSharedPreferences(Calls.PREFS, MODE_PRIVATE).edit().putString(Calls.KEY_TOKEN, token).apply();
    }
}
