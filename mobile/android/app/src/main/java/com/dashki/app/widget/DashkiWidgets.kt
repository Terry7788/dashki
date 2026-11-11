package com.dashki.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.os.Build
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.dashki.app.MainActivity
import com.dashki.app.R
import com.dashki.app.health.HealthSteps
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.time.LocalDate
import java.time.LocalTime
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Dashki's home-screen widgets: Today (resizes from a calorie ring up to recent
 * foods and log buttons), Steps and Weight. They read the same API as the app.
 * Refreshed every 15 minutes (DashkiWidgetWorker),
 * after every tap, when a steps sync finishes and when the app comes to the front.
 */
object DashkiApi {
    private const val DEFAULT_BASE = "https://dashki.tail4abd3b.ts.net"

    fun call(ctx: Context, method: String, path: String, body: JSONObject? = null): String {
        val base = HealthSteps.prefs(ctx).getString("baseUrl", null) ?: DEFAULT_BASE
        val c = URL(base + path).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 8000; c.readTimeout = 12000
        c.setRequestProperty("Accept", "application/json")
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        try {
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code >= 400) throw RuntimeException("Dashki answered $code")
            return text
        } finally { c.disconnect() }
    }
}

object DashkiWidgets {
    private const val PREFS = "dashki.widgets"
    private const val CACHE = "cache"
    private const val BANNER_MS = 30_000L
    const val ACTION_LOG = "com.dashki.app.widget.LOG"
    const val ACTION_UNDO = "com.dashki.app.widget.UNDO"
    const val ACTION_REFRESH = "com.dashki.app.widget.REFRESH"
    internal val fmt: NumberFormat = NumberFormat.getIntegerInstance()

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Same rule as defaultMealForNow() in the app (src/lib/nutrition.ts). */
    fun mealForNow(now: LocalTime = LocalTime.now()): String = when {
        now.hour < 11 -> "breakfast"
        now.hour < 15 -> "lunch"
        now.hour < 17 -> "snack"
        else -> "dinner"
    }

    /** Fetch everything once; the last good copy is kept so a dropped connection doesn't blank the widgets. */
    internal fun load(ctx: Context): JSONObject? {
        val today = LocalDate.now().toString()
        return try {
            val goals = JSONObject(DashkiApi.call(ctx, "GET", "/api/goals"))
            val summary = JSONObject(DashkiApi.call(ctx, "GET", "/api/journal/today-summary?date=$today"))
            val stepLogs = JSONArray(DashkiApi.call(ctx, "GET", "/api/steps/logs?date=$today"))
            var steps = 0L
            for (i in 0 until stepLogs.length()) steps += stepLogs.getJSONObject(i).optLong("steps")
            val weights = JSONArray(DashkiApi.call(ctx, "GET", "/api/weight?limit=20"))
            val start = LocalDate.now().minusDays(21).toString()
            val journal = JSONArray(DashkiApi.call(ctx, "GET", "/api/journal?startDate=$start&endDate=$today"))
            // Calories per meal today, and steps per day since Monday (both for the 4×2 widgets).
            val meals = JSONObject()
            summary.optJSONArray("entries")?.let { es ->
                for (i in 0 until es.length()) {
                    val e = es.getJSONObject(i)
                    val m = e.optString("meal_type").lowercase().let { if (it.startsWith("snack")) "snack" else it }
                    meals.put(m, meals.optDouble(m, 0.0) + e.optDouble("calories_snapshot", 0.0))
                }
            }
            val monday = LocalDate.now().with(java.time.DayOfWeek.MONDAY)
            val week = JSONObject()
            val days = JSONArray(DashkiApi.call(ctx, "GET", "/api/steps?startDate=$monday&endDate=$today"))
            for (i in 0 until days.length()) days.getJSONObject(i).let { week.put(it.optString("date"), it.optLong("steps")) }
            week.put(today, steps)
            val out = JSONObject()
                .put("date", today).put("goals", goals).put("calories", summary.optDouble("calories", 0.0))
                .put("protein", summary.optDouble("protein", 0.0)).put("steps", steps)
                .put("weights", weights).put("recent", recentFoods(journal))
                .put("meals", meals).put("week", week)
            prefs(ctx).edit().putString(CACHE, out.toString()).apply()
            out
        } catch (_: Exception) {
            prefs(ctx).getString(CACHE, null)?.let { JSONObject(it) }
        }
    }

    /** The last 3 different foods logged, newest first, with what's needed to log them again. */
    private fun recentFoods(journal: JSONArray): JSONArray {
        val entries = (0 until journal.length()).map { journal.getJSONObject(it) }.sortedByDescending { it.optString("logged_at") }
        val seen = HashSet<String>()
        val out = JSONArray()
        for (e in entries) {
            val name = e.optString("food_name_snapshot")
            if (name.isEmpty() || !seen.add(name.lowercase())) continue
            out.put(e)
            if (out.length() == 3) break
        }
        return out
    }

    fun refreshAll(ctx: Context) {
        val m = AppWidgetManager.getInstance(ctx)
        val today = m.getAppWidgetIds(ComponentName(ctx, TodayWidget::class.java))
        val steps = m.getAppWidgetIds(ComponentName(ctx, StepsWidget::class.java))
        val weight = m.getAppWidgetIds(ComponentName(ctx, WeightWidget::class.java))
        val sky = SkyWidgets.ids(ctx, m)
        if (today.isEmpty() && steps.isEmpty() && weight.isEmpty() && sky.isEmpty()) return
        val d = load(ctx)
        SkyWidgets.update(ctx, m, sky, d)
        if (today.isNotEmpty()) m.updateAppWidget(today, todayViews(ctx, d))
        if (steps.isNotEmpty()) m.updateAppWidget(steps, stepsViews(ctx, d))
        if (weight.isNotEmpty()) m.updateAppWidget(weight, weightViews(ctx, d))
    }

    /** Keep the data on screen for a moment and refresh in the background. */
    fun refreshAsync(ctx: Context) {
        ctx.sendBroadcast(Intent(ctx, WidgetActions::class.java).setAction(ACTION_REFRESH))
    }

    // ── Opening things ──────────────────────────────────────────────────────
    internal fun open(ctx: Context, route: String): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).putExtra("route", route).setAction("route:$route")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(ctx, route.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    private fun quick(ctx: Context, kind: String): PendingIntent {
        val i = Intent(ctx, QuickLogActivity::class.java).putExtra("kind", kind).setAction("quick:$kind")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(ctx, kind.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    private fun act(ctx: Context, action: String, req: Int, extras: Intent.() -> Unit = {}): PendingIntent {
        val i = Intent(ctx, WidgetActions::class.java).setAction(action).apply(extras)
        return PendingIntent.getBroadcast(ctx, req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    // ── Today ───────────────────────────────────────────────────────────────
    private fun fillToday(ctx: Context, v: RemoteViews, d: JSONObject?, withStats: Boolean) {
        v.setOnClickPendingIntent(R.id.root, open(ctx, "/"))
        if (d == null) {
            v.setTextViewText(R.id.left, "—")
            if (withStats) v.setTextViewText(R.id.title, "Can't reach Dashki")
            return
        }
        val g = d.getJSONObject("goals")
        val goal = g.optDouble("calories", 2000.0).coerceAtLeast(1.0)
        val cal = d.optDouble("calories", 0.0)
        val left = (goal - cal).toLong()
        v.setTextViewText(R.id.left, fmt.format(kotlin.math.abs(left)))
        v.setProgressBar(R.id.ring, 100, (cal / goal * 100).toInt().coerceIn(0, 100), false)
        if (!withStats) return
        v.setTextViewText(R.id.title, if (left < 0) "Today · ${fmt.format(-left)} over" else "Today")
        val pGoal = g.optDouble("protein", 0.0)
        val pro = d.optDouble("protein", 0.0)
        v.setTextViewText(R.id.protein, if (pGoal > 0) "${pro.toInt()} / ${pGoal.toInt()} g" else "${pro.toInt()} g")
        v.setProgressBar(R.id.proteinBar, 100, if (pGoal > 0) (pro / pGoal * 100).toInt().coerceIn(0, 100) else 0, false)
        val sGoal = g.optDouble("steps", 10000.0).coerceAtLeast(1.0)
        val steps = d.optLong("steps")
        v.setTextViewText(R.id.steps, fmt.format(steps))
        v.setProgressBar(R.id.stepsBar, 100, (steps / sGoal * 100).toInt().coerceIn(0, 100), false)
        val w = d.getJSONArray("weights")
        v.setTextViewText(R.id.weight, if (w.length() > 0) "%.1f kg".format(w.getJSONObject(0).optDouble("weight_kg")) else "—")
    }

    private fun todayLarge(ctx: Context, d: JSONObject?): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.w_d_today_l)
        fillToday(ctx, v, d, true)
        v.setOnClickPendingIntent(R.id.addFood, open(ctx, "/journal?addFood=1"))
        v.setOnClickPendingIntent(R.id.addWeight, quick(ctx, "weight"))
        v.setOnClickPendingIntent(R.id.addSteps, quick(ctx, "steps"))
        val p = prefs(ctx)
        val showBanner = System.currentTimeMillis() - p.getLong("lastAt", 0) < BANNER_MS
        v.setViewVisibility(R.id.banner, if (showBanner) View.VISIBLE else View.GONE)
        if (showBanner) {
            v.setTextViewText(R.id.bannerText, "✓ ${p.getString("lastName", "")} · ${p.getString("lastMeal", "")}")
            v.setOnClickPendingIntent(R.id.undo, act(ctx, ACTION_UNDO, 900) { putExtra("id", p.getInt("lastId", 0)) })
        }
        val rows = listOf(Triple(R.id.r0, R.id.rn0, R.id.rc0) to R.id.rp0, Triple(R.id.r1, R.id.rn1, R.id.rc1) to R.id.rp1, Triple(R.id.r2, R.id.rn2, R.id.rc2) to R.id.rp2)
        val recent = d?.optJSONArray("recent") ?: JSONArray()
        // While the Undo row shows, one food row gives way so nothing is pushed off the widget.
        val slots = if (showBanner) 2 else 3
        v.setViewVisibility(R.id.recentLabel, if (recent.length() > 0) View.VISIBLE else View.GONE)
        for ((i, r) in rows.withIndex()) {
            val (row, name, cal) = r.first
            if (i >= recent.length() || i >= slots) { v.setViewVisibility(row, View.GONE); continue }
            val e = recent.getJSONObject(i)
            v.setViewVisibility(row, View.VISIBLE)
            v.setTextViewText(name, e.optString("food_name_snapshot"))
            v.setTextViewText(cal, "${e.optDouble("calories_snapshot").toInt()}")
            v.setOnClickPendingIntent(r.second, act(ctx, ACTION_LOG, 800 + i) { putExtra("entry", e.toString()) })
        }
        return v
    }

    private fun todayViews(ctx: Context, d: JSONObject?): RemoteViews {
        val small = RemoteViews(ctx.packageName, R.layout.w_d_today_s).also { fillToday(ctx, it, d, false) }
        val medium = RemoteViews(ctx.packageName, R.layout.w_d_today_m).also { fillToday(ctx, it, d, true) }
        val large = todayLarge(ctx, d)
        if (Build.VERSION.SDK_INT < 31) return medium
        return RemoteViews(mapOf(SizeF(100f, 100f) to small, SizeF(230f, 120f) to medium, SizeF(230f, 330f) to large))
    }

    // ── Steps ───────────────────────────────────────────────────────────────
    private fun stepsViews(ctx: Context, d: JSONObject?): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.w_d_steps)
        v.setOnClickPendingIntent(R.id.root, open(ctx, "/steps"))
        if (d == null) { v.setTextViewText(R.id.goal, "Can't reach Dashki"); return v }
        val goal = d.getJSONObject("goals").optDouble("steps", 10000.0).coerceAtLeast(1.0)
        val steps = d.optLong("steps")
        val pct = (steps / goal * 100).toInt()
        v.setTextViewText(R.id.steps, fmt.format(steps))
        v.setTextViewText(R.id.pct, "$pct%")
        v.setTextViewText(R.id.goal, "of ${fmt.format(goal.toLong())}")
        v.setProgressBar(R.id.stepsBar, 100, pct.coerceIn(0, 100), false)
        return v
    }

    // ── Weight ──────────────────────────────────────────────────────────────
    private fun spark(values: List<Double>): Bitmap {
        val w = 300; val h = 110
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        if (values.size < 2) return bmp
        val lo = values.min(); val hi = values.max()
        val range = (hi - lo).takeIf { it > 0 } ?: 1.0
        val path = Path()
        values.forEachIndexed { i, x ->
            val px = i * (w - 8f) / (values.size - 1) + 4f
            val py = (h - 8f) - ((x - lo) / range).toFloat() * (h - 16f)
            if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF4D9BFF.toInt(); style = Paint.Style.STROKE; strokeWidth = 5f
            strokeJoin = Paint.Join.ROUND; strokeCap = Paint.Cap.ROUND
        }
        Canvas(bmp).drawPath(path, paint)
        return bmp
    }

    private fun weightViews(ctx: Context, d: JSONObject?): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.w_d_weight)
        v.setOnClickPendingIntent(R.id.root, open(ctx, "/weight"))
        if (d == null) { v.setTextViewText(R.id.togo, "Can't reach Dashki"); return v }
        val w = d.getJSONArray("weights")
        if (w.length() == 0) { v.setTextViewText(R.id.togo, "Nothing logged yet"); return v }
        val latest = w.getJSONObject(0).optDouble("weight_kg")
        v.setTextViewText(R.id.weight, "%.1f kg".format(latest))
        val goal = d.getJSONObject("goals").optDouble("weight_kg", 0.0)
        v.setTextViewText(R.id.togo, if (goal > 0) "%.1f kg to %.0f kg".format(latest - goal, goal) else "")
        v.setImageViewBitmap(R.id.spark, spark((0 until w.length()).map { w.getJSONObject(it).optDouble("weight_kg") }.reversed()))
        return v
    }

    // ── Background refresh ─────────────────────────────────────────────────
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<DashkiWidgetWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("dashki-widgets", ExistingPeriodicWorkPolicy.KEEP, req)
    }
    fun refreshAfter(ctx: Context, delayMs: Long) {
        val req = OneTimeWorkRequestBuilder<DashkiWidgetOnce>().setInitialDelay(delayMs, TimeUnit.MILLISECONDS).build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("dashki-widgets-once", ExistingWorkPolicy.REPLACE, req)
    }

    fun remember(ctx: Context, id: Int, name: String, meal: String) {
        prefs(ctx).edit().putInt("lastId", id).putString("lastName", name).putString("lastMeal", meal)
            .putLong("lastAt", System.currentTimeMillis()).apply()
    }
    fun forget(ctx: Context) { prefs(ctx).edit().remove("lastAt").remove("lastId").apply() }
    const val BANNER = BANNER_MS
}

/** Every 15 minutes: steps from Samsung Health if allowed, then the widgets. */
class DashkiWidgetWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        try { HealthSteps.sync(applicationContext) } catch (_: Exception) { }
        try { DashkiWidgets.refreshAll(applicationContext) } catch (_: Exception) { }
        return Result.success()
    }
}

class DashkiWidgetOnce(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        try { DashkiWidgets.refreshAll(applicationContext) } catch (_: Exception) { }
        return Result.success()
    }
}

private fun BroadcastReceiver.work(block: () -> Unit) {
    val pending = goAsync()
    thread { try { block() } catch (_: Exception) { } finally { pending.finish() } }
}

abstract class DashkiProvider : AppWidgetProvider() {
    override fun onEnabled(ctx: Context) { DashkiWidgets.schedule(ctx) }
    override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
        DashkiWidgets.schedule(ctx)
        work { DashkiWidgets.refreshAll(ctx) }
    }
}
class TodayWidget : DashkiProvider()
class StepsWidget : DashkiProvider()
class WeightWidget : DashkiProvider()

class WidgetActions : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) = work {
        when (intent.action) {
            DashkiWidgets.ACTION_REFRESH -> DashkiWidgets.refreshAll(ctx)
            DashkiWidgets.ACTION_LOG -> {
                val e = JSONObject(intent.getStringExtra("entry") ?: return@work)
                val meal = DashkiWidgets.mealForNow()
                val body = JSONObject()
                    .put("date", LocalDate.now().toString()).put("meal_type", meal)
                    .put("food_name_snapshot", e.optString("food_name_snapshot"))
                    .put("quantity", e.optDouble("quantity", 1.0)).put("unit", e.optString("unit", "serving"))
                    .put("calories_snapshot", e.optDouble("calories_snapshot", 0.0))
                    .put("protein_snapshot", e.optDouble("protein_snapshot", 0.0))
                if (!e.isNull("food_id")) body.put("food_id", e.optInt("food_id"))
                val saved = JSONObject(DashkiApi.call(ctx, "POST", "/api/journal", body))
                DashkiWidgets.remember(ctx, saved.optInt("id"), e.optString("food_name_snapshot"), meal)
                DashkiWidgets.refreshAll(ctx)
                DashkiWidgets.refreshAfter(ctx, DashkiWidgets.BANNER + 1000)   // takes the Undo row away again
            }
            DashkiWidgets.ACTION_UNDO -> {
                val id = intent.getIntExtra("id", 0)
                if (id > 0) DashkiApi.call(ctx, "DELETE", "/api/journal/$id")
                DashkiWidgets.forget(ctx)
                DashkiWidgets.refreshAll(ctx)
            }
        }
    }
}
