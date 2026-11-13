package com.tahmid.studytracker;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StudyNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
