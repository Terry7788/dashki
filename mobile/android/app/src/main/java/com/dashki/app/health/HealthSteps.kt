package com.dashki.app.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
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
 * The other way (Terry, 2026-11-11): steps logged in Dashki itself (walking calculator, typed in)
 * are written to Health Connect as manual entries, one record per log entry (clientRecordId
 * "dashki-log-<id>", kept in step and deleted with it), so Samsung Health can count them too.
 * Dashki's own records are left out when reading, so nothing comes back as "Samsung Health".
 *
 * Used both from the app (HealthStepsPlugin.syncNow) and by the hourly
 * background job (StepSyncWorker), so there's a single implementation.
 */
object HealthSteps {
    const val NOTE = "Samsung Health"
    private const val PREFS = "dashki.health"

    val READ = setOf(HealthPermission.getReadPermission(StepsRecord::class))
    val WRITE = setOf(HealthPermission.getWritePermission(StepsRecord::class))
    val BACKGROUND = setOf(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND)
    private const val OWN_ID = "dashki-log-"

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
        // Every app that wrote steps in this window except Dashki itself.
        val others = HashSet<String>()
        var t: String? = null
        do {
            val page = client.readRecords(ReadRecordsRequest(StepsRecord::class, range, pageToken = t))
            page.records.forEach { others.add(it.metadata.dataOrigin.packageName) }
            t = page.pageToken
        } while (t != null)
        others.remove(ctx.packageName)
        if (others.isEmpty()) return (0 until days).map { start.plusDays(it.toLong()) to 0L }
        val res = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = range,
                timeRangeSlicer = Period.ofDays(1),
                dataOriginFilter = others.map { DataOrigin(it) }.toSet(),
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
                    if (r.metadata.dataOrigin.packageName == ctx.packageName) continue
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

    /**
     * Dashki's own step entries → Health Connect, one manual record each over the time of the walk
     * ("Calculator: 69min …" → the 69 minutes before it was logged; otherwise one minute). Records of
     * entries deleted in Dashki are removed. Returns how many are in Health Connect now.
     */
    suspend fun writeDashkiSteps(ctx: Context, from: LocalDate, logs: List<JSONObject>): Int {
        val client = HealthConnectClient.getOrCreate(ctx)
        val zone = ZoneId.systemDefault()
        val wanted = HashMap<String, StepsRecord>()
        for (l in logs) {
            val steps = l.optLong("steps")
            if (steps <= 0) continue
            val id = OWN_ID + l.getInt("id")
            // created_at is always UTC ("2026-11-11 01:28:08"); logged_at is Melbourne time since 2026-11-11 (server TZ).
            val end = try { LocalDateTime.parse(l.getString("created_at").take(19).replace(' ', 'T')).toInstant(ZoneOffset.UTC) }
                catch (_: Exception) { try { LocalDateTime.parse(l.getString("logged_at").take(19)).atZone(zone).toInstant() }
                catch (_: Exception) { LocalDate.parse(l.getString("date")).atTime(12, 0).atZone(zone).toInstant() } }
            val mins = Regex("(\\d+)\\s*min").find(l.optString("note"))?.groupValues?.get(1)?.toLongOrNull()?.coerceIn(1, 600) ?: 1L
            val start = end.minusSeconds(mins * 60)
            wanted[id] = StepsRecord(
                startTime = start, startZoneOffset = zone.rules.getOffset(start),
                endTime = end, endZoneOffset = zone.rules.getOffset(end),
                count = steps,
                metadata = Metadata.manualEntry(clientRecordId = id, clientRecordVersion = System.currentTimeMillis()),  // only inserted when changed, so a newer version replaces the old
            )
        }
        // What Dashki already wrote for these days.
        val range = TimeRangeFilter.between(from.atStartOfDay(), LocalDate.now().plusDays(1).atStartOfDay())
        val mine = ArrayList<StepsRecord>()
        var t: String? = null
        do {
            val page = client.readRecords(ReadRecordsRequest(StepsRecord::class, range, dataOriginFilter = setOf(DataOrigin(ctx.packageName)), pageToken = t))
            mine.addAll(page.records)
            t = page.pageToken
        } while (t != null)
        val stale = mine.filter { it.metadata.clientRecordId !in wanted.keys }.map { it.metadata.id }
        if (stale.isNotEmpty()) client.deleteRecords(StepsRecord::class, stale, emptyList())
        val changed = wanted.values.filter { w -> mine.none { it.metadata.clientRecordId == w.metadata.clientRecordId && it.count == w.count && it.startTime == w.startTime && it.endTime == w.endTime } }
        if (changed.isNotEmpty()) client.insertRecords(changed)
        return wanted.size
    }

    class Result(val ok: Boolean, val message: String, val today: Long = 0, val days: JSONArray = JSONArray(), val sources: JSONArray = JSONArray())

    /** Today's steps in Health Connect per app (raw records, before Health Connect removes overlaps), for the Steps card. */
    suspend fun todayByApp(ctx: Context): JSONArray {
        val client = HealthConnectClient.getOrCreate(ctx)
        val today = LocalDate.now()
        val range = TimeRangeFilter.between(today.atStartOfDay(), today.plusDays(1).atStartOfDay())
        val perApp = HashMap<String, Long>()
        var token: String? = null
        do {
            val page = client.readRecords(ReadRecordsRequest(StepsRecord::class, range, pageToken = token))
            for (r in page.records) perApp[r.metadata.dataOrigin.packageName] = (perApp[r.metadata.dataOrigin.packageName] ?: 0L) + r.count
            token = page.pageToken
        } while (token != null)
        val out = JSONArray()
        perApp.entries.sortedByDescending { it.value }.forEach { (pkg, n) ->
            val label = try { ctx.packageManager.getApplicationLabel(ctx.packageManager.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }
            out.put(JSONObject().put("app", label).put("steps", n))
        }
        return out
    }

    /** Read today + yesterday from Health Connect and write them to Dashki. */
    suspend fun sync(ctx: Context): Result {
        if (!available(ctx)) return Result(false, "Health Connect isn't available")
        if (!granted(ctx).containsAll(READ)) return Result(false, "Steps permission not given")
        val base = prefs(ctx).getString("baseUrl", null) ?: return Result(false, "Not configured")

        val days = readDays(ctx, 2)
        val out = JSONArray()
        val canWrite = granted(ctx).containsAll(WRITE)
        val dashkiLogs = ArrayList<JSONObject>()
        for ((date, steps) in days) {
            val d = date.toString()
            val logs = JSONArray(http("GET", "$base/api/steps/logs?date=${URLEncoder.encode(d, "UTF-8")}", null))
            for (i in 0 until logs.length()) logs.getJSONObject(i).let { if (it.optString("note") != NOTE) dashkiLogs.add(it) }
            var mine: JSONObject? = null
            for (i in 0 until logs.length()) {
                val l = logs.getJSONObject(i)
                if (l.optString("note") == NOTE) { mine = l; break }
            }
            when {
                // Health Connect can come back with 0 (not shared yet); the server refuses 0, so keep the last number.
                mine != null && steps > 0 && mine.optLong("steps") != steps ->
                    http("PUT", "$base/api/steps/logs/${mine.getInt("id")}", JSONObject().put("steps", steps))
                mine == null && steps > 0 ->
                    http("POST", "$base/api/steps/logs", JSONObject().put("date", d).put("steps", steps).put("note", NOTE))
            }
            out.put(JSONObject().put("date", d).put("steps", steps))
        }
        var written = 0
        if (canWrite) written = writeDashkiSteps(ctx, days.first().first, dashkiLogs)
        val today = days.last().second
        prefs(ctx).edit().putLong("lastSync", System.currentTimeMillis()).putLong("lastToday", today).apply()
        try { com.dashki.app.widget.DashkiWidgets.refreshAll(ctx) } catch (_: Exception) { }
        val sources = try { todayByApp(ctx) } catch (_: Exception) { JSONArray() }
        return Result(true, if (canWrite) "Synced · $written Dashki entries in Samsung Health" else "Synced", today, out, sources)
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
