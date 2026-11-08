package com.dashki.app;

import android.os.Bundle;
import com.dashki.app.health.HealthStepsPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthStepsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
