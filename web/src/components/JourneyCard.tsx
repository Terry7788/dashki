// web/src/components/JourneyCard.tsx
'use client';

import { GlassCard } from './ui';
import type { WeightJourney, OnTrackStatus } from '@/lib/types';
import { TrendingUp, Calendar, Target, AlertCircle } from 'lucide-react';

function formatDateLong(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_LABEL: Record<OnTrackStatus, string> = {
  on_track: 'On track',
  ahead: 'Ahead of schedule',
  behind: 'Slightly behind',
  off_track: 'Off track',
};

const STATUS_CLASSES: Record<OnTrackStatus, string> = {
  on_track: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
  ahead: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300',
  behind: 'bg-amber-500/10 border-amber-400/30 text-amber-300',
  off_track: 'bg-red-500/10 border-red-400/30 text-red-300',
};

function StatusChip({ status }: { status: OnTrackStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      <TrendingUp className="w-3 h-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function CTA({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-white/50 bg-white/[0.03] border border-white/10 rounded-2xl px-3 py-2.5">
      <AlertCircle className="w-4 h-4 text-white/40" />
      {children}
    </div>
  );
}

export function JourneyCard({ journey }: { journey: WeightJourney | null }) {
  if (!journey) return null;

  // No start date set — single CTA, hide everything else.
  if (journey.start_date === null) {
    return (
      <GlassCard>
        <div className="flex items-center gap-3 mb-1">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h2 className="text-white font-semibold">Your Journey</h2>
        </div>
        <p className="text-white/50 text-sm">
          Set a start date in Settings to track your weight loss journey.
        </p>
      </GlassCard>
    );
  }

  // Goal weight is the anchor for everything below — without it, we can't
  // show "lost X% to goal" or project an ETA. Match the chart's behaviour
  // of hiding when the goal is missing.
  if (journey.goal_weight_kg === null) return null;

  // Start date is in the future.
  if ((journey.days_since_start ?? 0) < 0) {
    const daysAway = Math.abs(journey.days_since_start ?? 0);
    return (
      <GlassCard>
        <div className="flex items-center gap-3 mb-1">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h2 className="text-white font-semibold">Your Journey</h2>
        </div>
        <p className="text-white/50 text-sm">
          Journey starts in {daysAway} day{daysAway === 1 ? '' : 's'}
          {' '}({formatDateLong(journey.start_date)}).
        </p>
      </GlassCard>
    );
  }

  const goalReached =
    journey.goal_weight_kg !== null &&
    journey.current_weight_kg !== null &&
    journey.current_weight_kg <= journey.goal_weight_kg;

  return (
    <GlassCard>
      {/* Header: days + on-track chip */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h2 className="text-white font-semibold">Your Journey</h2>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-white text-3xl font-bold">
              Day {journey.days_since_start}
            </span>
            <span className="text-white/40 text-xs">
              since {formatDateLong(journey.start_date)}
            </span>
          </div>
        </div>
        {goalReached ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-medium">
            <Target className="w-3 h-3" /> Goal reached
          </span>
        ) : journey.on_track ? (
          <StatusChip status={journey.on_track} />
        ) : null}
      </div>

      {/* Starting weight: either render the weights row or a CTA */}
      {journey.starting_weight_kg === null ? (
        <CTA>
          Log a weight on {formatDateLong(journey.start_date)} (±3 days) to see
          your progress.
        </CTA>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-white/50 text-xs">Started</p>
              <p className="text-white text-lg font-semibold mt-0.5">
                {journey.starting_weight_kg.toFixed(1)} kg
              </p>
            </div>
            <div>
              <p className="text-white/50 text-xs">Now</p>
              <p className="text-white text-lg font-semibold mt-0.5">
                {journey.current_weight_kg !== null
                  ? `${journey.current_weight_kg.toFixed(1)} kg`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-white/50 text-xs">Goal</p>
              <p className="text-white text-lg font-semibold mt-0.5">
                {journey.goal_weight_kg !== null
                  ? `${journey.goal_weight_kg.toFixed(1)} kg`
                  : '—'}
              </p>
            </div>
          </div>

          {journey.lost_kg !== null && journey.starting_weight_kg > 0 && (
            <p className="text-white/60 text-sm mb-4">
              {journey.lost_kg >= 0 ? 'Lost' : 'Gained'}:{' '}
              <span className="text-white font-semibold">
                {Math.abs(journey.lost_kg).toFixed(1)} kg
              </span>{' '}
              <span className="text-white/40">
                ({((Math.abs(journey.lost_kg) / journey.starting_weight_kg) * 100).toFixed(1)}%)
              </span>
            </p>
          )}

          {/* Projection rows or TDEE CTA */}
          {journey.tdee_calories === null ? (
            <CTA>Set maintenance calories (TDEE) in Settings to see your projection.</CTA>
          ) : journey.avg_actual_calories === null ? (
            <CTA>Log some meals since your start date to see your projection.</CTA>
          ) : (
            <div className="space-y-2 text-sm border-t border-white/10 pt-4">
              <div className="flex justify-between text-white/60">
                <span>Avg intake</span>
                <span className="text-white">
                  {journey.avg_actual_calories!.toLocaleString()} kcal/day
                </span>
              </div>
              <div className="flex justify-between text-white/60">
                <span>Avg deficit</span>
                <span
                  className={
                    (journey.avg_deficit_per_day ?? 0) > 0
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }
                >
                  {(journey.avg_deficit_per_day ?? 0) > 0 ? '−' : '+'}
                  {Math.abs(journey.avg_deficit_per_day ?? 0).toLocaleString()} kcal/day
                </span>
              </div>
              {journey.predicted_weight_today_kg !== null && (
                <div className="flex justify-between text-white/60">
                  <span>Predicted today</span>
                  <span className="text-white">
                    {journey.predicted_weight_today_kg.toFixed(1)} kg{' '}
                    <span className="text-white/40">
                      (Δ {(journey.actual_vs_predicted_kg ?? 0) >= 0 ? '+' : ''}
                      {(journey.actual_vs_predicted_kg ?? 0).toFixed(1)} kg)
                    </span>
                  </span>
                </div>
              )}
              {!goalReached && (
                <>
                  <div className="flex justify-between pt-2 border-t border-white/10 text-white/60">
                    <span>Projected goal date</span>
                    <span className="text-white">
                      {journey.projected_goal_date !== null && journey.days_to_goal !== null
                        ? `~${formatDateLong(journey.projected_goal_date)} (${journey.days_to_goal} days)`
                        : '—'}
                    </span>
                  </div>
                  {(journey.avg_deficit_per_day ?? 0) <= 0 && (
                    <p className="text-xs text-amber-300/80 italic">
                      You&rsquo;re not in a deficit yet — eat below maintenance to start losing weight.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
