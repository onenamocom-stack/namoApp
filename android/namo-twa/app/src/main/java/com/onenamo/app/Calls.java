package com.onenamo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * NAMO's calls on the phone (22 Oct 2026): a ring that reaches a closed app.
 *
 * The server sends a high-priority FCM data message (apps/notifications/fcm.py):
 * type "incoming" (a seeker calls a Pro) or "connecting" (a Pro took the
 * seeker's call) rings full screen, on the lock screen too, with the phone's
 * ringtone until Answer or Decline or 45 seconds; anything else is a plain
 * notification. Answer opens the app on the message's "open" path.
 */
final class Calls {
    static final String CHANNEL_CALLS = "namo_calls_v1";
    static final String CHANNEL_NEWS = "namo_news_v1";
    static final int RING_MS = 45_000;
    static final String PREFS = "namo";
    static final String KEY_TOKEN = "fcm_token";

    private Calls() {}

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        NotificationChannel calls = new NotificationChannel(CHANNEL_CALLS, "Calls",
                NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("A seeker or a Pro calling you");
        calls.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 900, 400, 900, 400, 900});
        calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(calls);
        NotificationChannel news = new NotificationChannel(CHANNEL_NEWS, "Updates",
                NotificationManager.IMPORTANCE_HIGH);
        nm.createNotificationChannel(news);
    }

    /** The app, opened on a path of 1namo.com. */
    static Intent openApp(Context ctx, String path) {
        Intent i = new Intent(ctx, LauncherActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse("https://1namo.com" + (path == null || path.isEmpty() ? "/" : path)));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return i;
    }

    static int idFor(String sessionId) {
        return sessionId == null ? 7 : sessionId.hashCode();
    }

    static PendingIntent activity(Context ctx, int req, Intent i) {
        return PendingIntent.getActivity(ctx, req, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** "incoming" opens the Pro's ring page with what was tapped; "connecting" the call. */
    static String answerPath(String type, String open) {
        if ("incoming".equals(type)) return open + "?do=answer";
        return open;
    }

    static String declinePath(String type, String open) {
        if ("incoming".equals(type)) return open + "?do=decline";
        return null;
    }

    static void ring(Context ctx, String type, String sessionId, String title, String body, String open) {
        channels(ctx);
        int id = idFor(sessionId);
        Intent screen = new Intent(ctx, CallActivity.class)
                .putExtra("type", type).putExtra("session_id", sessionId)
                .putExtra("title", title).putExtra("body", body).putExtra("open", open)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent full = activity(ctx, id, screen);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_CALLS)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(true)
                .setTimeoutAfter(RING_MS)
                .setFullScreenIntent(full, true)
                .setContentIntent(full)
                .addAction(0, "Answer", activity(ctx, id + 1, openApp(ctx, answerPath(type, open))));
        String decline = declinePath(type, open);
        if (decline != null) {
            b.addAction(0, "Decline", activity(ctx, id + 2, openApp(ctx, decline)));
        }
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT;
        ctx.getSystemService(NotificationManager.class).notify(id, n);
    }

    static void plain(Context ctx, String sessionId, String title, String body, String open) {
        channels(ctx);
        int id = idFor(sessionId);
        Notification n = new NotificationCompat.Builder(ctx, CHANNEL_NEWS)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(activity(ctx, id, openApp(ctx, open)))
                .build();
        ctx.getSystemService(NotificationManager.class).notify(id, n);
    }

    static void cancel(Context ctx, String sessionId) {
        ctx.getSystemService(NotificationManager.class).cancel(idFor(sessionId));
    }

    /**
     * How far a ring got on this phone (23 Oct 2026: a locked Samsung showed
     * nothing, and nothing outside the phone could say why). A GET to the
     * API's health check, so the stage shows in its request log; no personal
     * data, only the session id, the stage and the phone's state. Never
     * blocks or breaks the ring.
     */
    static void report(Context ctx, String sessionId, String stage) {
        new Thread(() -> {
            try {
                android.os.PowerManager pm = ctx.getSystemService(android.os.PowerManager.class);
                android.app.KeyguardManager km = ctx.getSystemService(android.app.KeyguardManager.class);
                NotificationManager nm = ctx.getSystemService(NotificationManager.class);
                String state = "screen=" + (pm != null && pm.isInteractive() ? 1 : 0)
                        + "&locked=" + (km != null && km.isKeyguardLocked() ? 1 : 0)
                        + "&idle=" + (pm != null && Build.VERSION.SDK_INT >= 23 && pm.isDeviceIdleMode() ? 1 : 0)
                        + "&batt=" + (pm != null && Build.VERSION.SDK_INT >= 23
                                && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()) ? 1 : 0)
                        + "&notif=" + (nm != null && nm.areNotificationsEnabled() ? 1 : 0)
                        + "&sdk=" + Build.VERSION.SDK_INT + "&v=" + ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(
                        "https://namo-api-499026166575.asia-south1.run.app/v1/health/?fcm="
                                + Uri.encode(sessionId == null ? "-" : sessionId)
                                + "&s=" + Uri.encode(stage) + "&" + state).openConnection();
                c.setConnectTimeout(4000);
                c.setReadTimeout(4000);
                c.getResponseCode();
                c.disconnect();
            } catch (Exception ignored) {
                // A report that cannot go out changes nothing.
            }
        }).start();
    }
}
