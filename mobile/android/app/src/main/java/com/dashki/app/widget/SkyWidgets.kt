package com.dashki.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Build
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import com.dashki.app.R
import org.json.JSONObject
import java.time.LocalDate

/**
 * The 4×2 widgets drawn for Terry's sky wallpaper, all in the deep-blue glass look (Terry, 2026-11-12): Split (2), By meal (5), This week (7) and
 * Deep-blue glass (8). Designs: https://claude.ai/artifact/YVqkPo9Y7mKzJ4gQfUuA2J
 *
 * Smoothness: the content fades and slides in when the widget first appears (layoutAnimation in
 * the layouts), taps ripple, opening Dashki grows out of the widget (root id = android:id/background),
 * and when a number changes its bar or ring fills to the new value over ~0.4 s instead of jumping.
 */
object SkyWidgets {
    private enum class Kind(val provider: Class<*>, val layout: Int, val blue: Boolean = false, val lock: Boolean = false) {
        SPLIT(SplitWidget::class.java, R.layout.w_s_split, blue = true),
        GLASS(GlassWidget::class.java, R.layout.w_s_glass, blue = true),
        MEALS(MealsWidget::class.java, R.layout.w_s_meals, blue = true),
        WEEK(WeekWidget::class.java, R.layout.w_s_week, blue = true),
        WEEK2(WeekStepsFirstWidget::class.java, R.layout.w_s_week2, blue = true),
        LOCK_TODAY(LockTodayWidget::class.java, R.layout.w_s_lock_today, lock = true),
        LOCK_CAL(LockCaloriesWidget::class.java, R.layout.w_s_lock_cal, lock = true),
        LOCK_STEPS(LockStepsWidget::class.java, R.layout.w_s_lock_steps, lock = true),
    }
    private val PCT = setOf(R.id.calBar, R.id.stepsBar, R.id.calRing, R.id.stepsRing)

    private const val PREFS = "dashki.skywidgets"
    private val SAMSUNG = android.os.Build.MANUFACTURER.equals("samsung", ignoreCase = true)
    private const val FRAMES = 16
    private const val FRAME_MS = 33L
    private val BARS = intArrayOf(R.id.b0, R.id.b1, R.id.b2, R.id.b3, R.id.b4, R.id.b5, R.id.b6)
    private val DAYS = intArrayOf(R.id.d0, R.id.d1, R.id.d2, R.id.d3, R.id.d4, R.id.d5, R.id.d6)

    fun ids(ctx: Context, m: AppWidgetManager): Map<Int, String> {
        val out = LinkedHashMap<Int, String>()
        for (k in Kind.values()) for (id in m.getAppWidgetIds(ComponentName(ctx, k.provider))) out[id] = k.name
        return out
    }

    fun update(ctx: Context, m: AppWidgetManager, ids: Map<Int, String>, d: JSONObject?) {
        if (ids.isEmpty()) return
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        // Each widget: draw it with the bars where they were last time, then let them run to the new values.
        val runs = ArrayList<Triple<Int, Map<Int, Int>, Map<Int, Int>>>()
        val layouts = HashMap<Int, Int>()
        for ((id, name) in ids) {
            val kind = Kind.valueOf(name)
            val layout = layoutFor(m, id, kind)
            val v = RemoteViews(ctx.packageName, layout)
            val target = fill(ctx, kind, v, d)
            val from = HashMap<Int, Int>()
            for ((bar, value) in target) {
                val before = p.getInt("$id.$bar", 0)
                // Samsung's launcher animates every widget update itself; 16 quick partial updates left the
                // Dashki widgets drawn slightly rotated on Terry's Fold (2026-11-12), so there the bars jump.
                from[bar] = if (SAMSUNG) value else before
                v.setProgressBar(bar, if (bar in PCT) 100 else 1000, from[bar]!!, false)
            }
            m.updateAppWidget(id, v)
            if (target.any { (bar, value) -> from[bar] != value }) runs.add(Triple(id, from, target))
            layouts[id] = layout
            p.edit().apply { for ((bar, value) in target) putInt("$id.$bar", value) }.apply()
        }
        if (runs.isEmpty()) return
        for (f in 1..FRAMES) {
            Thread.sleep(FRAME_MS)
            val t = f.toDouble() / FRAMES
            val e = 1 - Math.pow(1 - t, 3.0)              // ease out
            for ((id, from, to) in runs) {
                val v = RemoteViews(ctx.packageName, layouts[id]!!)
                for ((bar, end) in to) {
                    val start = from[bar] ?: end
                    val max = if (bar in PCT) 100 else 1000
                    v.setProgressBar(bar, max, (start + (end - start) * e).toInt(), false)
                }
                m.partiallyUpdateAppWidget(id, v)
            }
        }
    }

    /** Lock-screen widgets: rings and numbers only (no buttons; a tap unlocks into Dashki). */
    private fun fillLock(ctx: Context, v: RemoteViews, d: JSONObject?): Map<Int, Int> {
        v.setOnClickPendingIntent(R.id.calCol, DashkiWidgets.open(ctx, "/journal"))
        v.setOnClickPendingIntent(R.id.stepsCol, DashkiWidgets.open(ctx, "/steps"))
        val fmt = DashkiWidgets.fmt
        if (d == null) { v.setTextViewText(R.id.calNum, "—"); v.setTextViewText(R.id.stepsNum, "—"); return emptyMap() }
        val g = d.optJSONObject("goals") ?: JSONObject()
        val goal = g.optDouble("calories", 2000.0).coerceAtLeast(1.0)
        val eaten = d.optDouble("calories", 0.0)
        val left = Math.round(goal - eaten)
        v.setTextViewText(R.id.calNum, fmt.format(Math.abs(left)))
        v.setTextViewText(R.id.calNumUnit, if (left < 0) "kcal over" else "kcal left")
        v.setTextColor(R.id.calNum, if (left < 0) Color.parseColor("#FFB4AB") else Color.WHITE)
        val sGoal = g.optDouble("steps", 10000.0).coerceAtLeast(1.0)
        val steps = d.optLong("steps")
        v.setTextViewText(R.id.stepsNum, fmt.format(steps))
        v.setTextViewText(R.id.stepsNumUnit, if (steps >= sGoal) "steps · goal ✓" else "steps")
        return mapOf(
            R.id.calRing to (eaten / goal * 100).toInt().coerceIn(0, 100),
            R.id.stepsRing to (steps / sGoal * 100).toInt().coerceIn(0, 100))
    }

    /** By meal has a compact layout for short widgets (the roomy one doesn't fit 2 short rows). The launcher tells us the
     *  size; resizing calls onAppWidgetOptionsChanged, which redraws. */
    private fun layoutFor(m: AppWidgetManager, id: Int, kind: Kind): Int {
        if (kind != Kind.MEALS) return kind.layout
        val o = m.getAppWidgetOptions(id)
        val h = maxOf(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT))
        android.util.Log.d("SkyWidgets", "By meal $id height ${h}dp")
        return if (h in 1 until 190) R.layout.w_s_meals_compact else kind.layout
    }

    /** Fills texts, colours and taps; returns each bar's value (the caller animates them). */
    private fun fill(ctx: Context, kind: Kind, v: RemoteViews, d: JSONObject?): Map<Int, Int> {
        v.setOnClickPendingIntent(R.id.wroot, DashkiWidgets.open(ctx, "/"))
        if (kind.lock) return fillLock(ctx, v, d)
        v.setOnClickPendingIntent(R.id.calCol, DashkiWidgets.open(ctx, "/journal"))
        v.setOnClickPendingIntent(R.id.stepsCol, DashkiWidgets.open(ctx, "/steps"))
        v.setOnClickPendingIntent(R.id.logFood, DashkiWidgets.open(ctx, "/journal?addFood=1"))
        val meal = DashkiWidgets.mealForNow()
        val mealName = meal.replaceFirstChar { it.uppercase() }
        v.setTextViewText(R.id.logFoodText, when (kind) {
            Kind.SPLIT, Kind.GLASS -> "Log ${meal}"
            Kind.MEALS -> mealName
            else -> "Food"
        })
        val fmt = DashkiWidgets.fmt
        val bars = HashMap<Int, Int>()
        if (d == null) {
            v.setTextViewText(R.id.calNum, "—"); v.setTextViewText(R.id.stepsNum, "—")
            if (kind != Kind.WEEK && kind != Kind.WEEK2) v.setTextViewText(R.id.calSub, "Can't reach Dashki")
            else v.setTextViewText(R.id.stepsSub, "Can't reach Dashki")
            return bars
        }
        val g = d.optJSONObject("goals") ?: JSONObject()
        val goal = g.optDouble("calories", 2000.0).coerceAtLeast(1.0)
        val eaten = d.optDouble("calories", 0.0)
        val left = Math.round(goal - eaten)
        val over = left < 0
        val ink = if (kind.blue) Color.WHITE else Color.parseColor("#14263B")
        val red = if (kind.blue) Color.parseColor("#FF8A80") else Color.parseColor("#C8372D")
        v.setTextViewText(R.id.calNum, fmt.format(Math.abs(left)))
        v.setTextColor(R.id.calNum, if (over) red else ink)
        v.setTextViewText(R.id.calUnit, when {
            kind == Kind.MEALS || kind == Kind.WEEK || kind == Kind.WEEK2 -> if (over) "kcal over" else "kcal left"
            else -> if (over) "over" else "left"
        })
        val calPct = (eaten / goal * 100).toInt().coerceIn(0, 100)

        val sGoal = g.optDouble("steps", 10000.0).coerceAtLeast(1.0)
        val steps = d.optLong("steps")
        val stepPct = (steps / sGoal * 100).toInt().coerceIn(0, 100)
        val toGo = (sGoal - steps).toLong()
        val stepsLine = if (toGo > 0) "${fmt.format(toGo)} to go" else "Goal reached ✓"

        when (kind) {
            Kind.SPLIT, Kind.GLASS -> {
                v.setTextViewText(R.id.calSub, "${fmt.format(Math.round(eaten))} of ${fmt.format(goal.toLong())}")
                v.setTextViewText(R.id.stepsNum, fmt.format(steps))
                v.setTextViewText(R.id.stepsSub, stepsLine)
                bars[R.id.calBar] = calPct; bars[R.id.stepsBar] = stepPct
            }
            Kind.MEALS -> {
                v.setTextViewText(R.id.calSub, "${fmt.format(Math.round(eaten))} / ${fmt.format(goal.toLong())}")
                val ms = d.optJSONObject("meals") ?: JSONObject()
                val b = ms.optDouble("breakfast", 0.0); val l = ms.optDouble("lunch", 0.0)
                val s = ms.optDouble("snack", 0.0); val dn = ms.optDouble("dinner", 0.0)
                for ((id, x) in listOf(R.id.mB to b, R.id.mL to l, R.id.mS to s, R.id.mD to dn))
                    v.setTextViewText(id, if (x > 0) fmt.format(Math.round(x)) else "–")
                val scale = maxOf(goal, b + l + s + dn)
                fun seg(x: Double) = (x / scale * 1000).toInt().coerceIn(0, 1000)
                bars[R.id.segB] = seg(b); bars[R.id.segL] = seg(b + l)
                bars[R.id.segS] = seg(b + l + s); bars[R.id.segD] = seg(b + l + s + dn)
                v.setTextViewText(R.id.stepsNum, "${fmt.format(steps)} steps")
                bars[R.id.stepsBar] = stepPct
            }
            Kind.WEEK, Kind.WEEK2 -> {
                bars[R.id.calRing] = calPct
                v.setTextViewText(R.id.stepsNum, fmt.format(steps))
                val week = d.optJSONObject("week") ?: JSONObject()
                val today = LocalDate.now()
                val monday = today.with(java.time.DayOfWeek.MONDAY)
                val values = (0 until 7).map { week.optLong(monday.plusDays(it.toLong()).toString(), 0) }
                val upTo = (today.toEpochDay() - monday.toEpochDay()).toInt()
                val avg = values.take(upTo + 1).average().toLong()
                v.setTextViewText(R.id.stepsSub, "Avg ${fmt.format(avg)} this week")
                val scale = maxOf(sGoal * 1.15, values.maxOrNull()?.toDouble() ?: 0.0)
                for (i in 0 until 7) {
                    val future = i > upTo
                    bars[BARS[i]] = if (future) 40 else (values[i] / scale * 1000).toInt().coerceIn(if (values[i] > 0) 30 else 0, 1000)
                    if (Build.VERSION.SDK_INT >= 31) {
                        val c = when {
                            future -> "#33FFFFFF"
                            i == upTo -> "#7BE3A0"
                            values[i] >= sGoal -> "#5CD68A"
                            else -> "#4F9A72"
                        }
                        v.setColorStateList(BARS[i], "setProgressTintList", ColorStateList.valueOf(Color.parseColor(c)))
                    }
                    v.setTextColor(DAYS[i], Color.parseColor(if (i == upTo) "#FFFFFF" else "#D5E3F2"))
                }
                bars[R.id.goalLine] = (sGoal / scale * 1000).toInt().coerceIn(0, 1000)   // the chart stretches, so the line is a fraction too
            }
            else -> {}
        }
        return bars
    }
}

class SplitWidget : DashkiProvider()
class GlassWidget : DashkiProvider()
class MealsWidget : DashkiProvider()
class WeekWidget : DashkiProvider()
class LockTodayWidget : DashkiProvider()
class LockCaloriesWidget : DashkiProvider()
class LockStepsWidget : DashkiProvider()
class WeekStepsFirstWidget : DashkiProvider()
