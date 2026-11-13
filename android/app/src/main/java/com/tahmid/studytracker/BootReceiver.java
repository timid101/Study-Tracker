package com.tahmid.studytracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arms daily reminders after a restart or an app update. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        NativeStore.scheduleReminders(context);
        StudyWidgetProvider.updateAll(context);
    }
}
