package com.dashki.app;

import android.os.Bundle;
import com.dashki.app.health.HealthStepsPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthStepsPlugin.class);
        super.onCreate(savedInstanceState);
        // Dark bars around the page, matching the design
        getWindow().getDecorView().setBackgroundColor(0xFF1A1918);
        getWindow().setStatusBarColor(0xFF1A1918);
        getWindow().setNavigationBarColor(0xFF1A1918);
        new androidx.core.view.WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(false);
        new androidx.core.view.WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
        if (getBridge() != null) getBridge().getWebView().setBackgroundColor(0xFF1A1918);
        android.view.View content = findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(0xFF1A1918);
        if (getBridge() != null && getBridge().getWebView().getParent() instanceof android.view.View) ((android.view.View) getBridge().getWebView().getParent()).setBackgroundColor(0xFF1A1918);
    }
}
