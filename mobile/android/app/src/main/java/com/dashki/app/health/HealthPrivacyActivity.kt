package com.dashki.app.health

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/** Shown by Health Connect when you tap "Why does Dashki need this?" (Android requires one). */
class HealthPrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val t = TextView(this).apply {
            setPadding(56, 120, 56, 56)
            textSize = 17f
            text = "Dashki reads your daily step count from Health Connect (Samsung Health) " +
                "and saves it as one \"Samsung Health\" entry per day in your own Dashki, " +
                "on your home server. It reads steps only, never writes to Health Connect, " +
                "and sends nothing anywhere else."
        }
        setContentView(ScrollView(this).apply { addView(t) })
    }
}
