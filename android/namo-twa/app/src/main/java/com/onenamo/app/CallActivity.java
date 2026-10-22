package com.onenamo.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The call screen (22 Oct 2026): over the lock screen, the phone's ringtone
 * and a long vibration until Answer, Decline or 45 seconds. Saffron and teal
 * on cotton beige, like the rest of NAMO. Built in code: one screen, no
 * layout file to keep in step.
 */
public class CallActivity extends Activity {
    private Ringtone tone;
    private Vibrator buzz;
    private final Handler clock = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = getSystemService(KeyguardManager.class);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final String type = getIntent().getStringExtra("type");
        final String session = getIntent().getStringExtra("session_id");
        final String open = getIntent().getStringExtra("open");
        String title = getIntent().getStringExtra("title");
        String body = getIntent().getStringExtra("body");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(Color.parseColor("#F6EEDF"));
        int pad = dp(28);
        root.setPadding(pad, dp(120), pad, dp(72));

        TextView mark = text("NAMO", 16, "#0F766E", true);
        mark.setLetterSpacing(0.3f);
        root.addView(mark);

        TextView who = text(title == null ? "NAMO" : title, 28, "#C2410C", true);
        who.setPadding(0, dp(48), 0, dp(10));
        root.addView(who);
        root.addView(text(body == null ? "" : body, 17, "#3A2412", false));

        LinearLayout spacer = new LinearLayout(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        String decline = Calls.declinePath(type, open);
        row.addView(button("Decline", "#B91C1C", v -> {
            stopRinging();
            Calls.cancel(this, session);
            if (decline != null) startActivity(Calls.openApp(this, decline));
            finish();
        }));
        row.addView(new TextView(this), new LinearLayout.LayoutParams(dp(36), 1));
        row.addView(button("Answer", "#3F8F3A", v -> {
            stopRinging();
            Calls.cancel(this, session);
            startActivity(Calls.openApp(this, Calls.answerPath(type, open)));
            finish();
        }));
        root.addView(row);
        setContentView(root);

        startRinging();
        clock.postDelayed(() -> {
            stopRinging();
            finish();
        }, Calls.RING_MS);
    }

    private void startRinging() {
        try {
            tone = RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));
            if (tone != null) {
                if (Build.VERSION.SDK_INT >= 28) tone.setLooping(true);
                tone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
                tone.play();
            }
        } catch (Exception ignored) {
            // No ringtone: the vibration still rings.
        }
        buzz = getSystemService(Vibrator.class);
        if (buzz != null) {
            long[] pattern = {0, 900, 400};
            if (Build.VERSION.SDK_INT >= 26) buzz.vibrate(VibrationEffect.createWaveform(pattern, 0));
            else buzz.vibrate(pattern, 0);
        }
    }

    private void stopRinging() {
        clock.removeCallbacksAndMessages(null);
        if (tone != null && tone.isPlaying()) tone.stop();
        if (buzz != null) buzz.cancel();
    }

    @Override
    protected void onDestroy() {
        stopRinging();
        super.onDestroy();
    }

    private TextView text(String s, int sp, String color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(Color.parseColor(color));
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private Button button(String label, String color, android.view.View.OnClickListener tap) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(18);
        b.setTextColor(Color.WHITE);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(color));
        bg.setCornerRadius(dp(40));
        b.setBackground(bg);
        b.setOnClickListener(tap);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(130), dp(64)));
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
