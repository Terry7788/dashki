package com.dashki.app.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/**
 * Steps from Samsung Health (or any app that writes to Health Connect) into Dashki.
 *
 * Health Connect gives the phone's step total per day (deduplicated across phone,
 * watch and ring). Dashki stores steps as log entries that add up per day, so the
 * phone's total lives in ONE entry per day with the note "Samsung Health", updated
 * in place on every sync — manual entries stay on top as extras.
 *
 * Used both from the app (HealthStepsPlugin.syncNow) and by the hourly
 * background job (StepSyncWorker), so there's a single implementation.
 */
object HealthSteps {
    const val NOTE = "Samsung Health"
    private const val PREFS = "dashki.health"

    val READ = setOf(HealthPermission.getReadPermission(StepsRecord::class))
    val BACKGROUND = setOf(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)

    fun available(ctx: Context): Boolean =
        HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    suspend fun granted(ctx: Context): Set<String> =
        HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions()

    /**
     * Step totals for the last [days] local days, oldest first. Health Connect's
     * own daily total (deduplicated across phone/watch/ring) is used; it only counts
     * apps on Health Connect's priority list, so for a day where that comes back 0
     * but step records exist, the biggest single app's total is used instead
     * (taking one app, never adding apps, so nothing is counted twice).
     */
    suspend fun readDays(ctx: Context, days: Int): List<Pair<LocalDate, Long>> {
        val client = HealthConnectClient.getOrCreate(ctx)
        val today = LocalDate.now()
        val start = today.minusDays((days - 1).toLong())
        val range = TimeRangeFilter.between(start.atStartOfDay(), today.plusDays(1).atStartOfDay())
        val res = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = range,
                timeRangeSlicer = Period.ofDays(1),
            )
        )
        val byDay = res.associate { it.startTime.toLocalDate() to (it.result[StepsRecord.COUNT_TOTAL] ?: 0L) }.toMutableMap()

        if ((0 until days).any { (byDay[start.plusDays(it.toLong())] ?: 0L) == 0L }) {
            val zone = ZoneId.systemDefault()
            val perAppDay = HashMap<Pair<String, LocalDate>, Long>()
            var token: String? = null
            do {
                val page = client.readRecords(ReadRecordsRequest(StepsRecord::class, range, pageToken = token))
                for (r in page.records) {
                    val key = r.metadata.dataOrigin.packageName to r.startTime.atZone(zone).toLocalDate()
                    perAppDay[key] = (perAppDay[key] ?: 0L) + r.count
                }
                token = page.pageToken
            } while (token != null)
            for ((key, total) in perAppDay) {
                val day = key.second
                if ((byDay[day] ?: 0L) == 0L || res.none { it.startTime.toLocalDate() == day && (it.result[StepsRecord.COUNT_TOTAL] ?: 0L) > 0 }) {
                    byDay[day] = maxOf(byDay[day] ?: 0L, total)
                }
            }
        }
        return (0 until days).map { start.plusDays(it.toLong()) }.map { it to (byDay[it] ?: 0L) }
    }

    class Result(val ok: Boolean, val message: String, val today: Long = 0, val days: JSONArray = JSONArray())

    /** Read today + yesterday from Health Connect and write them to Dashki. */
    suspend fun sync(ctx: Context): Result {
        if (!available(ctx)) return Result(false, "Health Connect isn't available")
        if (!granted(ctx).containsAll(READ)) return Result(false, "Steps permission not given")
        val base = prefs(ctx).getString("baseUrl", null) ?: return Result(false, "Not configured")

        val days = readDays(ctx, 2)
        val out = JSONArray()
        for ((date, steps) in days) {
            val d = date.toString()
            val logs = JSONArray(http("GET", "$base/api/steps/logs?date=${URLEncoder.encode(d, "UTF-8")}", null))
            var mine: JSONObject? = null
            for (i in 0 until logs.length()) {
                val l = logs.getJSONObject(i)
                if (l.optString("note") == NOTE) { mine = l; break }
            }
            when {
                mine != null && mine.optLong("steps") != steps ->
                    http("PUT", "$base/api/steps/logs/${mine.getInt("id")}", JSONObject().put("steps", steps))
                mine == null && steps > 0 ->
                    http("POST", "$base/api/steps/logs", JSONObject().put("date", d).put("steps", steps).put("note", NOTE))
            }
            out.put(JSONObject().put("date", d).put("steps", steps))
        }
        val today = days.last().second
        prefs(ctx).edit().putLong("lastSync", System.currentTimeMillis()).putLong("lastToday", today).apply()
        try { com.dashki.app.widget.DashkiWidgets.refreshAll(ctx) } catch (_: Exception) { }
        return Result(true, "Synced", today, out)
    }

    private fun http(method: String, url: String, body: JSONObject?): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 10000; c.readTimeout = 15000
        c.setRequestProperty("Accept", "application/json")
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        try {
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code >= 400) throw RuntimeException("Dashki answered $code on $method ${URL(url).path}")
            return text
        } finally { c.disconnect() }
    }
}
