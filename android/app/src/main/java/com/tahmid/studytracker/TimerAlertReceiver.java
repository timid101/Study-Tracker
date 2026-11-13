package com.tahmid.studytracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class TimerAlertReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String type = intent.getStringExtra("type");
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        if (type == null || title == null || body == null) return;
        NativeStore.notifyAlert(context, type, title, body);
    }
}
