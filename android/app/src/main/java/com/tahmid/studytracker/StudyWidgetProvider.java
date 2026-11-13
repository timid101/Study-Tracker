package com.tahmid.studytracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/** Home-screen widget: study time for today, with arrows to look at earlier days. */
public class StudyWidgetProvider extends AppWidgetProvider {
    static final String ACT_PREV = "com.tahmid.studytracker.WIDGET_PREV";
    static final String ACT_NEXT = "com.tahmid.studytracker.WIDGET_NEXT";
    static final String ACT_TODAY = "com.tahmid.studytracker.WIDGET_TODAY";
    private static final int MAX_BACK = 29;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        manager.updateAppWidget(ids, build(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent.getAction();
        if (ACT_PREV.equals(a) || ACT_NEXT.equals(a) || ACT_TODAY.equals(a)) {
            SharedPreferences p = NativeStore.prefs(context);
            int off = p.getInt("widgetOffset", 0);
            if (ACT_PREV.equals(a)) off = Math.min(MAX_BACK, off + 1);
            else if (ACT_NEXT.equals(a)) off = Math.max(0, off - 1);
            else off = 0;
            p.edit().putInt("widgetOffset", off).apply();
            updateAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StudyWidgetProvider.class));
        if (ids != null && ids.length > 0) {
            manager.updateAppWidget(ids, build(context));
        }
    }

    private static PendingIntent broadcast(Context c, String action, int requestCode) {
        Intent i = new Intent(c, StudyWidgetProvider.class);
        i.setAction(action);
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static RemoteViews build(Context c) {
        int off = NativeStore.prefs(c).getInt("widgetOffset", 0);
        int[] d = NativeStore.dayData(c, NativeStore.dayKey(off));
        int done = d[0];
        int target = Math.max(1, d[1]);
        boolean met = done > 0 && done >= target;

        String label;
        if (off == 0) {
            label = "Today";
        } else if (off == 1) {
            label = "Yesterday";
        } else {
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.DAY_OF_YEAR, -off);
            label = new SimpleDateFormat("EEE d MMM", Locale.getDefault()).format(cal.getTime());
        }

        String status;
        if (met) {
            status = done > target ? "Target met, " + NativeStore.fmt(done - target) + " over" : "Target met";
        } else if (off == 0) {
            status = done == 0 ? "Not started, target " + NativeStore.fmt(target)
                : NativeStore.fmt(target - done) + " to go of " + NativeStore.fmt(target);
        } else {
            status = "Missed by " + NativeStore.fmt(target - done) + " (target " + NativeStore.fmt(target) + ")";
        }

        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_study);
        rv.setTextViewText(R.id.widget_day, label);
        rv.setTextViewText(R.id.widget_total, NativeStore.fmt(done));
        rv.setTextViewText(R.id.widget_status, status);
        rv.setTextColor(R.id.widget_status, ContextCompat.getColor(c, met ? R.color.widget_good : R.color.widget_text2));
        rv.setProgressBar(R.id.widget_progress, 100, Math.min(100, done * 100 / target), false);

        rv.setOnClickPendingIntent(R.id.widget_root, NativeStore.openApp(c));
        rv.setOnClickPendingIntent(R.id.widget_prev, broadcast(c, ACT_PREV, 11));
        rv.setOnClickPendingIntent(R.id.widget_next, broadcast(c, ACT_NEXT, 12));
        rv.setOnClickPendingIntent(R.id.widget_day, broadcast(c, ACT_TODAY, 13));
        return rv;
    }
}
