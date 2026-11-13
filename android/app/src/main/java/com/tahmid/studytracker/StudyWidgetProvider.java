package com.tahmid.studytracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.widget.RemoteViews;

import androidx.core.graphics.ColorUtils;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Small square home-screen widget. It is drawn in one subject's colour and shows the share of that subject's
 * daily goal studied so far. Tap the subject name to switch subject; tap anywhere else to open the app.
 */
public class StudyWidgetProvider extends AppWidgetProvider {
    static final String ACT_CYCLE = "com.tahmid.studytracker.WIDGET_CYCLE";
    private static final int DEFAULT_COLOR = 0xFF006B5F;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context, id));
        }
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        SharedPreferences.Editor e = NativeStore.prefs(context).edit();
        for (int id : ids) e.remove("wsub_" + id);
        e.apply();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACT_CYCLE.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                cycle(context, id);
                AppWidgetManager.getInstance(context).updateAppWidget(id, build(context, id));
            }
            return;
        }
        super.onReceive(context, intent);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StudyWidgetProvider.class));
        if (ids == null) return;
        for (int id : ids) {
            manager.updateAppWidget(id, build(context, id));
        }
    }

    /** "all" or a subject id. A new widget takes the subject chosen in the app, if any. */
    private static String selection(Context c, int id) {
        SharedPreferences p = NativeStore.prefs(c);
        String v = p.getString("wsub_" + id, null);
        if (v == null) {
            v = p.getString("wpending", "all");
            p.edit().putString("wsub_" + id, v).remove("wpending").apply();
        }
        return v;
    }

    private static void cycle(Context c, int id) {
        JSONArray subs = NativeStore.snap(c).optJSONArray("subjects");
        String cur = selection(c, id);
        String next = "all";
        if (subs != null && subs.length() > 0) {
            if ("all".equals(cur)) {
                JSONObject first = subs.optJSONObject(0);
                if (first != null) next = first.optString("id", "all");
            } else {
                for (int i = 0; i < subs.length(); i++) {
                    JSONObject s = subs.optJSONObject(i);
                    if (s != null && cur.equals(s.optString("id"))) {
                        JSONObject n = subs.optJSONObject(i + 1);
                        next = n != null ? n.optString("id", "all") : "all";
                        break;
                    }
                }
            }
        }
        NativeStore.prefs(c).edit().putString("wsub_" + id, next).apply();
    }

    private static int parseColor(String s) {
        try {
            return Color.parseColor(s);
        } catch (Exception e) {
            return DEFAULT_COLOR;
        }
    }

    /** Rounded square in the subject colour with a progress ring. */
    private static Bitmap art(int bg, int fg, float progress) {
        int size = 360;
        Bitmap b = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(bg);
        cv.drawRoundRect(new RectF(0, 0, size, size), 64, 64, p);

        float cx = size / 2f;
        float cy = size * 0.515f;
        float r = 100f;
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(22f);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(fg);
        p.setAlpha(70);
        cv.drawCircle(cx, cy, r, p);
        if (progress > 0f) {
            p.setColor(fg);
            p.setAlpha(255);
            cv.drawArc(new RectF(cx - r, cy - r, cx + r, cy + r), -90f, 360f * Math.min(1f, progress), false, p);
        }
        return b;
    }

    private static RemoteViews build(Context c, int id) {
        JSONObject snap = NativeStore.snap(c);
        boolean today = NativeStore.snapIsToday(snap);
        int target = Math.max(1, snap.optInt("target", 240));
        int done = today ? snap.optInt("total", 0) : 0;
        int goal = target;
        int bg = DEFAULT_COLOR;
        String name = "All subjects";

        String sel = selection(c, id);
        if (!"all".equals(sel)) {
            JSONArray subs = snap.optJSONArray("subjects");
            if (subs != null) {
                for (int i = 0; i < subs.length(); i++) {
                    JSONObject s = subs.optJSONObject(i);
                    if (s != null && sel.equals(s.optString("id"))) {
                        name = s.optString("name", "Subject");
                        bg = parseColor(s.optString("color", ""));
                        done = today ? s.optInt("m", 0) : 0;
                        int g = s.optInt("goal", 0);
                        goal = g > 0 ? g : target;
                        break;
                    }
                }
            }
        }

        int pct = (int) Math.round(done * 100.0 / goal);
        int fg = ColorUtils.calculateLuminance(bg) > 0.5 ? 0xFF161D1C : 0xFFFFFFFF;

        RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_square);
        rv.setImageViewBitmap(R.id.widget_art, art(bg, fg, done / (float) goal));
        rv.setTextViewText(R.id.widget_name, name);
        rv.setTextViewText(R.id.widget_percent, pct + "%");
        rv.setTextViewText(R.id.widget_sub, NativeStore.fmt(done) + " of " + NativeStore.fmt(goal));
        rv.setTextColor(R.id.widget_name, fg);
        rv.setTextColor(R.id.widget_percent, fg);
        rv.setTextColor(R.id.widget_sub, fg);

        rv.setOnClickPendingIntent(R.id.widget_root, NativeStore.openApp(c));
        Intent i = new Intent(c, StudyWidgetProvider.class);
        i.setAction(ACT_CYCLE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        PendingIntent cyc = PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        rv.setOnClickPendingIntent(R.id.widget_name, cyc);
        return rv;
    }
}
