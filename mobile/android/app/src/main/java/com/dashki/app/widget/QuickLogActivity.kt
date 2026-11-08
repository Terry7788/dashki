package com.dashki.app.widget

import android.app.Activity
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import com.dashki.app.R
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.concurrent.thread

/** The small "+ Weight" / "+ Steps" pop-up from the Today widget. Opens over the home screen. */
class QuickLogActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.w_d_quicklog)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        val weight = intent.getStringExtra("kind") == "weight"
        val value = findViewById<EditText>(R.id.value)
        val error = findViewById<TextView>(R.id.error)
        val save = findViewById<Button>(R.id.save)
        findViewById<TextView>(R.id.title).text = if (weight) "Log weight" else "Add steps"
        findViewById<TextView>(R.id.unit).text = if (weight) "kg · today" else "steps · today"
        value.inputType = if (weight) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else InputType.TYPE_CLASS_NUMBER
        value.requestFocus()
        if (weight) thread {
            try {
                val w = JSONArray(DashkiApi.call(this, "GET", "/api/weight?limit=1"))
                if (w.length() > 0) {
                    val last = "%.1f".format(w.getJSONObject(0).optDouble("weight_kg"))
                    runOnUiThread { value.hint = last }
                }
            } catch (_: Exception) { }
        }
        findViewById<Button>(R.id.cancel).setOnClickListener { finish() }
        save.setOnClickListener {
            val n = value.text.toString().trim().replace(',', '.').toDoubleOrNull()
            val ok = n != null && if (weight) n in 20.0..400.0 else n >= 1 && n <= 200000
            if (!ok) {
                error.text = if (weight) "Enter your weight in kg" else "Enter a number of steps"
                error.visibility = View.VISIBLE
                return@setOnClickListener
            }
            save.isEnabled = false
            error.visibility = View.GONE
            val today = LocalDate.now().toString()
            thread {
                try {
                    if (weight) DashkiApi.call(this, "POST", "/api/weight", JSONObject().put("date", today).put("weight_kg", n))
                    else DashkiApi.call(this, "POST", "/api/steps/logs", JSONObject().put("date", today).put("steps", n!!.toLong()))
                    DashkiWidgets.refreshAll(this)
                    runOnUiThread { finish() }
                } catch (_: Exception) {
                    runOnUiThread { error.text = "Couldn't save. Check your connection."; error.visibility = View.VISIBLE; save.isEnabled = true }
                }
            }
        }
    }
}
