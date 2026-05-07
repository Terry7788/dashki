'use client';

import { useEffect, useState, useCallback } from 'react';
import { GlassCard, GlassButton, GlassInput } from '@/components/ui';
import {
  getPreferences,
  updatePreferences,
  getGoals,
  updateGoals,
} from '@/lib/api';
import { useSocketEvent } from '@/lib/useSocketEvent';
import { Check, User, Target } from 'lucide-react';
import type { Goals } from '@/lib/types';

// ─── Profile section (display name) ──────────────────────────────────────────

function ProfileSection() {
  const [loading, setLoading] = useState(true);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const prefs = await getPreferences();
      setSavedName(prefs.display_name);
      setDraft(prefs.display_name ?? '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);
  useSocketEvent('preferences-updated', fetchPrefs);

  const isDirty = (draft.trim() === '' ? null : draft.trim()) !== savedName;

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const next = draft.trim() === '' ? null : draft.trim();
      const result = await updatePreferences({ display_name: next });
      setSavedName(result.display_name);
      setDraft(result.display_name ?? '');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && isDirty && !saving) handleSave();
  }

  return (
    <div>
      <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
        <User className="w-3.5 h-3.5" />
        Profile
      </h2>
      <GlassCard>
        <div className="space-y-4">
          <div>
            <GlassInput
              label="Display name"
              placeholder="e.g. Terry"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={50}
              disabled={loading || saving}
            />
            <p className="text-xs text-white/40 mt-2">
              Shown in your dashboard greeting. Leave blank for a generic greeting.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">
              {savedFlash ? (
                <span className="text-emerald-400 inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              ) : isDirty ? (
                <span className="text-amber-400">Unsaved changes</span>
              ) : (
                <span>Up to date</span>
              )}
            </span>
            <GlassButton
              variant="primary"
              onClick={handleSave}
              disabled={!isDirty || saving || loading}
            >
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

// ─── Daily Goals section ─────────────────────────────────────────────────────

function GoalsSection() {
  const [loading, setLoading] = useState(true);
  const [savedGoals, setSavedGoals] = useState<Goals | null>(null);
  const [calorieDraft, setCalorieDraft] = useState('');
  const [proteinDraft, setProteinDraft] = useState('');
  const [stepDraft, setStepDraft] = useState('');
  const [weightDraft, setWeightDraft] = useState('');
  const [startDateDraft, setStartDateDraft] = useState('');
  const [tdeeDraft, setTdeeDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const g = await getGoals();
      setSavedGoals(g);
      setCalorieDraft(String(g.calories ?? ''));
      setProteinDraft(String(g.protein ?? ''));
      setStepDraft(String(g.steps ?? ''));
      setWeightDraft(g.weight_kg !== null ? String(g.weight_kg) : '');
      setStartDateDraft(g.weight_journey_start_date ?? '');
      setTdeeDraft(g.tdee_calories !== null ? String(g.tdee_calories) : '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);
  useSocketEvent('goals-updated', fetchGoals);

  // What "is dirty" — compare drafts to saved
  function parseField(v: string): number | null {
    const n = Number(v.trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  const draftCalories = parseField(calorieDraft);
  const draftProtein = parseField(proteinDraft);
  const draftSteps = parseField(stepDraft);
  // Weight is optional — empty string means "no goal set" (null), otherwise
  // it must parse to a positive number.
  const draftWeight = weightDraft.trim() === ''
    ? null
    : parseField(weightDraft);
  const draftWeightValid = weightDraft.trim() === '' || draftWeight !== null;

  // Start date is optional — empty means "no journey", otherwise must look like ISO YYYY-MM-DD.
  const draftStartDate = startDateDraft.trim() === '' ? null : startDateDraft.trim();
  const startDateValid =
    draftStartDate === null || /^\d{4}-\d{2}-\d{2}$/.test(draftStartDate);

  // TDEE is optional — empty means "not set", otherwise must be a positive number.
  const draftTdee = tdeeDraft.trim() === '' ? null : parseField(tdeeDraft);
  const tdeeValid = tdeeDraft.trim() === '' || draftTdee !== null;

  const savedCalories = savedGoals?.calories ?? null;
  const savedProtein = savedGoals?.protein ?? null;
  const savedSteps = savedGoals?.steps ?? null;
  const savedWeight = savedGoals?.weight_kg ?? null;
  const savedStartDate = savedGoals?.weight_journey_start_date ?? null;
  const savedTdee = savedGoals?.tdee_calories ?? null;

  const isDirty =
    draftCalories !== savedCalories ||
    draftProtein !== savedProtein ||
    draftSteps !== savedSteps ||
    draftWeight !== savedWeight ||
    draftStartDate !== savedStartDate ||
    draftTdee !== savedTdee;

  // For the steps goal, must be a positive integer (matches backend validation).
  const stepsValid = draftSteps === null || Number.isInteger(draftSteps);

  const allValid =
    draftCalories !== null &&
    draftProtein !== null &&
    draftSteps !== null &&
    stepsValid &&
    draftWeightValid &&
    startDateValid &&
    tdeeValid;

  async function handleSave() {
    setError(null);
    if (!allValid) {
      setError('Calories/protein/steps must be positive numbers (steps whole). Weight is optional.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateGoals({
        calories: draftCalories,
        protein: draftProtein,
        steps: draftSteps,
        weight_kg: draftWeight,
        weight_journey_start_date: draftStartDate,
        tdee_calories: draftTdee,
      });
      setSavedGoals(updated);
      setCalorieDraft(String(updated.calories ?? ''));
      setProteinDraft(String(updated.protein ?? ''));
      setStepDraft(String(updated.steps ?? ''));
      setWeightDraft(updated.weight_kg !== null ? String(updated.weight_kg) : '');
      setStartDateDraft(updated.weight_journey_start_date ?? '');
      setTdeeDraft(updated.tdee_calories !== null ? String(updated.tdee_calories) : '');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e: any) {
      setError(e?.message || 'Failed to save — please try again');
      // Reset drafts to last known saved values so user knows it didn't stick
      if (savedGoals) {
        setCalorieDraft(String(savedGoals.calories ?? ''));
        setProteinDraft(String(savedGoals.protein ?? ''));
        setStepDraft(String(savedGoals.steps ?? ''));
        setWeightDraft(savedGoals.weight_kg !== null ? String(savedGoals.weight_kg) : '');
        setStartDateDraft(savedGoals.weight_journey_start_date ?? '');
        setTdeeDraft(savedGoals.tdee_calories !== null ? String(savedGoals.tdee_calories) : '');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3 flex items-center gap-2">
        <Target className="w-3.5 h-3.5" />
        Daily Goals
      </h2>
      <GlassCard>
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <GlassInput
              label="Calories (kcal)"
              type="number"
              inputMode="decimal"
              value={calorieDraft}
              onChange={(e) => setCalorieDraft(e.target.value)}
              min={1}
              step={50}
              disabled={loading || saving}
            />
            <GlassInput
              label="Protein (g)"
              type="number"
              inputMode="decimal"
              value={proteinDraft}
              onChange={(e) => setProteinDraft(e.target.value)}
              min={1}
              step={5}
              disabled={loading || saving}
            />
            <GlassInput
              label="Steps"
              type="number"
              inputMode="numeric"
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              min={1}
              step={500}
              disabled={loading || saving}
            />
            <GlassInput
              label="Weight (kg)"
              type="number"
              inputMode="decimal"
              value={weightDraft}
              onChange={(e) => setWeightDraft(e.target.value)}
              min={0}
              step={0.1}
              placeholder="optional"
              disabled={loading || saving}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GlassInput
              label="Journey start date"
              type="date"
              value={startDateDraft}
              onChange={(e) => setStartDateDraft(e.target.value)}
              placeholder="optional"
              disabled={loading || saving}
            />
            <GlassInput
              label="Maintenance calories (TDEE)"
              type="number"
              inputMode="decimal"
              value={tdeeDraft}
              onChange={(e) => setTdeeDraft(e.target.value)}
              min={0}
              step={50}
              placeholder="optional"
              disabled={loading || saving}
            />
          </div>
          <p className="text-xs text-white/40">
            Goals are saved to your Dashki database — they persist across all your
            devices. Weight and journey fields are optional; setting a start date
            + TDEE unlocks the journey card on the Weight page with a projected
            goal date.
          </p>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-white/40">
              {savedFlash ? (
                <span className="text-emerald-400 inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Saved
                </span>
              ) : isDirty ? (
                <span className="text-amber-400">Unsaved changes</span>
              ) : (
                <span>Up to date</span>
              )}
            </span>
            <GlassButton
              variant="primary"
              onClick={handleSave}
              disabled={!isDirty || saving || loading || !allValid}
            >
              {saving ? 'Saving…' : 'Save'}
            </GlassButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="px-4 py-8 animate-fade-in">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-white/50 text-sm mt-1">
            Personalize your Dashki instance.
          </p>
        </div>

        <ProfileSection />
        <GoalsSection />
      </div>
    </div>
  );
}
