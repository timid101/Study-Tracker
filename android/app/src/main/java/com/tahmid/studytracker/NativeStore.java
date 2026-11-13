package com.tahmid.studytracker;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/** Shared helpers: stored data, notifications and alarms. Everything stays on the phone. */
final class NativeStore {
    static final String PREFS = "study_native";
    static final String CH_TIMER = "timer";
    static final String CH_ALERT = "alerts";
    static final String CH_REMIND = "reminders";
    static final int ID_TIMER = 1001;
    static final int ID_LIMIT = 1002;
    static final int ID_TARGET = 1003;
    static final int ID_REMIND = 1004;
    static final int RC_LIMIT = 2001;
    static final int RC_TARGET = 2002;
    static final int RC_REMIND_BASE = 3000;
    static final int MAX_REMINDERS = 8;

    private NativeStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel timer = new NotificationChannel(CH_TIMER, "Study timer", NotificationManager.IMPORTANCE_LOW);
        timer.setDescription("Shows your running study timer");
        timer.setShowBadge(false);
        nm.createNotificationChannel(timer);

        NotificationChannel alerts = new NotificationChannel(CH_ALERT, "Timer alerts", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Session limit and daily target alerts");
        nm.createNotificationChannel(alerts);

        NotificationChannel remind = new NotificationChannel(CH_REMIND, "Study reminders", NotificationManager.IMPORTANCE_DEFAULT);
        remind.setDescription("Daily reminders to study");
        nm.createNotificationChannel(remind);
    }

    static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void post(Context c, int id, android.app.Notification n) {
        if (!canNotify(c)) return;
        try {
            NotificationManagerCompat.from(c).notify(id, n);
        } catch (SecurityException ignored) {
            // Notifications are blocked; nothing to do.
        }
    }

    static void cancelNotification(Context c, int id) {
        try {
            NotificationManagerCompat.from(c).cancel(id);
        } catch (Exception ignored) {
        }
    }

    /* ---------- formatting and stored data ---------- */

    static String fmt(int min) {
        if (min < 0) min = 0;
        int h = min / 60;
        int m = min % 60;
        if (h > 0 && m > 0) return h + "h " + m + "m";
        if (h > 0) return h + "h";
        return m + "m";
    }

    static String clock(long ms) {
        long s = Math.max(0, ms) / 1000;
        return String.format(Locale.US, "%02d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60);
    }

    static String dayKey(int daysAgo) {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, -daysAgo);
        return String.format(Locale.US, "%04d-%02d-%02d",
            cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    /** Returns {minutesStudied, targetMinutes} for a day key such as 2026-11-13. */
    static int[] dayData(Context c, String key) {
        SharedPreferences p = prefs(c);
        int target = p.getInt("target", 240);
        int minutes = 0;
        try {
            JSONObject days = new JSONObject(p.getString("days", "{}"));
            JSONObject d = days.optJSONObject(key);
            if (d != null) {
                minutes = d.optInt("m", 0);
                target = d.optInt("t", target);
            }
        } catch (Exception ignored) {
        }
        return new int[] { minutes, target };
    }

    /* ---------- timer notification ---------- */

    static void showTimer(Context c, boolean running, long startedAt, long elapsedMs, String subject) {
        ensureChannels(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_TIMER)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentIntent(openApp(c))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setColor(0xFF006B5F)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (running) {
            b.setContentTitle("Studying: " + subject)
                .setContentText("Timer running. Tap to open Study Tracker.")
                .setUsesChronometer(true)
                .setShowWhen(true)
                .setWhen(startedAt);
        } else {
            b.setContentTitle("Paused: " + subject)
                .setContentText(clock(elapsedMs) + " studied. Tap to resume.")
                .setUsesChronometer(false)
                .setShowWhen(false);
        }
        post(c, ID_TIMER, b.build());
    }

    /* ---------- timer alerts (session limit, daily target) ---------- */

    private static PendingIntent alertIntent(Context c, int requestCode, String type, String title, String body) {
        Intent i = new Intent(c, TimerAlertReceiver.class);
        i.setAction("com.tahmid.studytracker.ALERT_" + type);
        i.putExtra("type", type);
        i.putExtra("title", title);
        i.putExtra("body", body);
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Schedules (or cancels when atMillis is 0) an alert at an exact time. */
    static void setAlert(Context c, int requestCode, String type, long atMillis, String title, String body) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alertIntent(c, requestCode, type, title, body);
        am.cancel(pi);
        if (atMillis > System.currentTimeMillis()) {
            // setAlarmClock fires on time even in battery saver and needs no special permission.
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(atMillis, openApp(c)), pi);
        }
    }

    static void notifyAlert(Context c, String type, String title, String body) {
        ensureChannels(c);
        int id = "limit".equals(type) ? ID_LIMIT : ID_TARGET;
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_ALERT)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openApp(c))
            .setAutoCancel(true)
            .setColor(0xFF006B5F)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        post(c, id, b.build());
    }

    /* ---------- daily reminders ---------- */

    private static PendingIntent reminderIntent(Context c, int index) {
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setAction("com.tahmid.studytracker.REMIND");
        i.putExtra("index", index);
        return PendingIntent.getBroadcast(c, RC_REMIND_BASE + index, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int[] parseTime(String s) {
        try {
            String[] p = s.trim().split(":");
            int h = Integer.parseInt(p[0]);
            int m = Integer.parseInt(p[1]);
            if (h < 0 || h > 23 || m < 0 || m > 59) return null;
            return new int[] { h, m };
        } catch (Exception e) {
            return null;
        }
    }

    private static long nextTrigger(int hour, int minute) {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 1000) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        return cal.getTimeInMillis();
    }

    private static String[] reminderTimes(Context c) {
        String raw = prefs(c).getString("reminderTimes", "");
        if (raw == null || raw.length() == 0) return new String[0];
        return raw.split(",");
    }

    static void scheduleReminders(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int i = 0; i < MAX_REMINDERS; i++) {
            am.cancel(reminderIntent(c, i));
        }
        if (!prefs(c).getBoolean("remindersOn", false)) return;
        String[] times = reminderTimes(c);
        for (int i = 0; i < times.length && i < MAX_REMINDERS; i++) {
            scheduleOneReminder(c, am, i, times[i]);
        }
    }

    static void scheduleOneReminder(Context c, AlarmManager am, int index, String time) {
        int[] hm = parseTime(time);
        if (hm == null) return;
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger(hm[0], hm[1]), reminderIntent(c, index));
    }

    /** Called when a reminder alarm fires: re-arms it for tomorrow and notifies if the target is not met. */
    static void onReminderFired(Context c, int index) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (!prefs(c).getBoolean("remindersOn", false)) return;
        String[] times = reminderTimes(c);
        if (index < 0 || index >= times.length) return;
        if (am != null) scheduleOneReminder(c, am, index, times[index]);

        int[] d = dayData(c, dayKey(0));
        int done = d[0];
        int target = d[1];
        if (done > 0 && done >= target) return; // Target already met today: stay quiet.

        String text = done == 0
            ? "Today's target is " + fmt(target) + ". Ready to start a session?"
            : fmt(target - done) + " left to reach today's target (" + fmt(done) + " done).";
        ensureChannels(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_REMIND)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentTitle("Time to study")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(openApp(c))
            .setAutoCancel(true)
            .setColor(0xFF006B5F)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        post(c, ID_REMIND, b.build());
    }
}
