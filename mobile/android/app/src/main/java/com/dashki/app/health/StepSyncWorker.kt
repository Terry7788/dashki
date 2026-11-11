package com.dashki.app.health

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** Background sync of Health Connect steps into Dashki every 15 minutes, Android's shortest (needs the background-read permission). */
class StepSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        try { HealthSteps.sync(applicationContext) } catch (_: Exception) { /* next run */ }
        return Result.success()
    }

    companion object {
        private const val NAME = "dashki-steps-15min"
        private const val OLD = "dashki-steps-hourly" // was hourly until 1.12

        fun schedule(ctx: Context, on: Boolean) {
            val wm = WorkManager.getInstance(ctx)
            wm.cancelUniqueWork(OLD)
            if (!on) { wm.cancelUniqueWork(NAME); return }
            val req = PeriodicWorkRequestBuilder<StepSyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            wm.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
