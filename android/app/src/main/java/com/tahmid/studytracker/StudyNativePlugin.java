package com.tahmid.studytracker;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Bridge between the web app and Android: notifications, alarms and the home-screen widget. */
@CapacitorPlugin(
    name = "StudyNative",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class StudyNativePlugin extends Plugin {

    @PluginMethod
    public void notifPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", NativeStore.canNotify(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void requestNotifPermission(PluginCall call) {
        if (NativeStore.canNotify(getContext())) {
            notifPermission(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "notifPermissionResult");
    }

    @PermissionCallback
    private void notifPermissionResult(PluginCall call) {
        notifPermission(call);
    }

    /** Saves the last days of study totals so the widget can show them without opening the app. */
    @PluginMethod
    public void syncData(PluginCall call) {
        JSObject days = call.getObject("days");
        int target = call.getData().optInt("target", 240);
        SharedPreferences.Editor e = NativeStore.prefs(getContext()).edit();
        if (days != null) e.putString("days", days.toString());
        e.putInt("target", target);
        e.apply();
        StudyWidgetProvider.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void timerNotify(PluginCall call) {
        JSObject d = call.getData();
        boolean running = d.optBoolean("running", false);
        long startedAt = d.optLong("startedAt", System.currentTimeMillis());
        long elapsed = d.optLong("elapsedMs", 0);
        String subject = d.optString("subject", "Study");
        NativeStore.showTimer(getContext(), running, startedAt, elapsed, subject);
        call.resolve();
    }

    @PluginMethod
    public void timerClear(PluginCall call) {
        NativeStore.cancelNotification(getContext(), NativeStore.ID_TIMER);
        call.resolve();
    }

    @PluginMethod
    public void timerAlerts(PluginCall call) {
        JSObject d = call.getData();
        long limitAt = d.optLong("limitAt", 0);
        long targetAt = d.optLong("targetAt", 0);
        int limitMin = d.optInt("limitMin", 0);
        String subject = d.optString("subject", "your subject");
        Context c = getContext();
        NativeStore.setAlert(c, NativeStore.RC_LIMIT, "limit", limitAt,
            "Session limit reached",
            "You have studied " + limitMin + " minutes of " + subject + ". Take a break or keep going.");
        NativeStore.setAlert(c, NativeStore.RC_TARGET, "target", targetAt,
            "Daily target reached",
            "You have reached today's study target. Great work.");
        call.resolve();
    }

    @PluginMethod
    public void reminders(PluginCall call) {
        JSObject d = call.getData();
        boolean enabled = d.optBoolean("enabled", false);
        JSArray times = call.getArray("times");
        StringBuilder sb = new StringBuilder();
        if (times != null) {
            for (int i = 0; i < times.length() && i < NativeStore.MAX_REMINDERS; i++) {
                String t = times.optString(i, "");
                if (t.length() == 0) continue;
                if (sb.length() > 0) sb.append(',');
                sb.append(t);
            }
        }
        NativeStore.prefs(getContext()).edit()
            .putBoolean("remindersOn", enabled)
            .putString("reminderTimes", sb.toString())
            .apply();
        NativeStore.scheduleReminders(getContext());
        call.resolve();
    }

    @PluginMethod
    public void requestWidget(PluginCall call) {
        boolean requested = false;
        Context c = getContext();
        if (Build.VERSION.SDK_INT >= 26) {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            if (m != null && m.isRequestPinAppWidgetSupported()) {
                requested = m.requestPinAppWidget(new ComponentName(c, StudyWidgetProvider.class), null, null);
            }
        }
        JSObject r = new JSObject();
        r.put("requested", requested);
        call.resolve(r);
    }
}
