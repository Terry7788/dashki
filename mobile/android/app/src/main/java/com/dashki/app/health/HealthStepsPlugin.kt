package com.dashki.app.health

import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.PermissionController
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** JS bridge: `HealthSteps.status() / requestPermission() / configure() / syncNow()` (src/lib/health.ts). */
@CapacitorPlugin(name = "HealthSteps")
class HealthStepsPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()

    /** One sync at a time; tells the page ("synced") so open screens reload. */
    private suspend fun runSync(): JSObject = lock.withLock {
        val r = HealthSteps.sync(context)
        val o = JSObject()
        o.put("ok", r.ok); o.put("message", r.message); o.put("today", r.today); o.put("days", r.days)
        if (r.ok) notifyListeners("synced", o)
        o
    }

    /** Every time Dashki comes back to the front (and on start), pull the latest steps. */
    override fun handleOnResume() {
        super.handleOnResume()
        if (!HealthSteps.prefs(context).contains("baseUrl")) return
        scope.launch { try { runSync() } catch (_: Exception) { } }
    }

    private suspend fun statusObj(): JSObject {
        val o = JSObject()
        val available = HealthSteps.available(context)
        o.put("available", available)
        if (available) {
            val g = HealthSteps.granted(context)
            o.put("granted", g.containsAll(HealthSteps.READ))
            o.put("background", g.containsAll(HealthSteps.BACKGROUND))
        } else {
            o.put("granted", false); o.put("background", false)
        }
        val p = HealthSteps.prefs(context)
        if (p.contains("lastSync")) {
            o.put("lastSync", p.getLong("lastSync", 0))
            o.put("today", p.getLong("lastToday", 0))
        }
        return o
    }

    @PluginMethod
    fun status(call: PluginCall) {
        scope.launch { try { call.resolve(statusObj()) } catch (e: Exception) { call.reject(e.message) } }
    }

    /** Remember the Dashki API address (the background job needs it) and switch the hourly job on/off. */
    @PluginMethod
    fun configure(call: PluginCall) {
        val base = call.getString("baseUrl")?.trimEnd('/')
        if (base != null) HealthSteps.prefs(context).edit().putString("baseUrl", base).apply()
        StepSyncWorker.schedule(context, call.getBoolean("background", true) == true)
        call.resolve()
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (!HealthSteps.available(context)) { call.reject("Health Connect isn't available on this phone"); return }
        val intent: Intent = PermissionController.createRequestPermissionResultContract()
            .createIntent(context, HealthSteps.READ + HealthSteps.BACKGROUND)
        startActivityForResult(call, intent, "permissionResult")
    }

    @ActivityCallback
    private fun permissionResult(call: PluginCall, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        scope.launch { try { call.resolve(statusObj()) } catch (e: Exception) { call.reject(e.message) } }
    }

    @PluginMethod
    fun syncNow(call: PluginCall) {
        scope.launch {
            try { call.resolve(runSync()) } catch (e: Exception) { call.reject(e.message ?: "Sync failed") }
        }
    }
}
