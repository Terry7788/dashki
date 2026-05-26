// Full 6-step onboarding wizard (DSHKI-56).
// Replaces the Phase 2 stub.
//
// Steps:
//   0. Welcome
//   1. Primary goal (5 visual options)
//   2. About you (sex, age, height, weight, activity level)
//   3. Target (target weight + pace — skipped for maintain / general_health)
//   4. Recommended targets (Mifflin-St Jeor; user can override each number)
//   5. Home dashboard tiles
//
// All steps are individually skippable — sensible defaults kick in.
// State persists via PATCH /api/user/goals after each step so users can
// resume mid-wizard. Final step calls POST /api/user/onboarding-complete.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Dumbbell,
  Activity,
  Heart,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassInput,
  MicroLabel,
  MonoNum,
  Pill,
  SegmentedControl,
} from '../components/ui';
import {
  recommendTargets,
  type PrimaryGoal,
  type Sex,
  type ActivityLevel,
  type Pace,
} from '../lib/targets';
import {
  getUserGoals,
  updateUserGoals,
  markOnboardingComplete,
} from '../lib/api';
import { useAuth } from '../lib/auth-context';

// ─── Step data shape ─────────────────────────────────────────────────────

interface WizardState {
  primary_goal: PrimaryGoal | null;
  sex: Sex | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  target_weight_kg: number | null;
  activity_level: ActivityLevel | null;
  pace: Pace;
  kcal_target: number;
  protein_target_g: number;
  fibre_target_g: number;
  steps_target: number;
  enabled_tiles: string[];
}

const DEFAULT_STATE: WizardState = {
  primary_goal: null,
  sex: null,
  age: null,
  height_cm: null,
  weight_kg: null,
  target_weight_kg: null,
  activity_level: null,
  pace: 'moderate',
  kcal_target: 2000,
  protein_target_g: 100,
  fibre_target_g: 30,
  steps_target: 8000,
  enabled_tiles: ['protein', 'fiber', 'steps', 'weight'],
};

// ─── Outer wizard frame ──────────────────────────────────────────────────

export default function OnboardingScreen() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load any prior wizard state (resume mid-flow).
  useEffect(() => {
    (async () => {
      try {
        const existing = await getUserGoals();
        setState((prev) => ({
          ...prev,
          primary_goal: (existing.primary_goal as PrimaryGoal | null) ?? prev.primary_goal,
          sex: (existing.sex as Sex | null) ?? prev.sex,
          age: existing.age ?? prev.age,
          height_cm: existing.height_cm ?? prev.height_cm,
          weight_kg: existing.weight_kg ?? prev.weight_kg,
          target_weight_kg: existing.target_weight_kg ?? prev.target_weight_kg,
          activity_level:
            (existing.activity_level as ActivityLevel | null) ?? prev.activity_level,
          pace: (existing.pace as Pace | null) ?? prev.pace,
          kcal_target: existing.kcal_target ?? prev.kcal_target,
          protein_target_g: existing.protein_target_g ?? prev.protein_target_g,
          fibre_target_g: existing.fibre_target_g ?? prev.fibre_target_g,
          steps_target: existing.steps_target ?? prev.steps_target,
          enabled_tiles:
            existing.enabled_tiles?.length
              ? existing.enabled_tiles
              : prev.enabled_tiles,
        }));
      } catch {
        // No existing goals row — first-time onboarding. Stay with defaults.
      }
    })();
  }, []);

  // Auto-recommend targets when we land on step 4 with enough info filled in.
  useEffect(() => {
    if (step !== 4) return;
    if (
      state.primary_goal &&
      state.sex &&
      state.age != null &&
      state.height_cm != null &&
      state.weight_kg != null &&
      state.activity_level
    ) {
      const rec = recommendTargets({
        primary_goal: state.primary_goal,
        sex: state.sex,
        age: state.age,
        height_cm: state.height_cm,
        weight_kg: state.weight_kg,
        activity_level: state.activity_level,
        pace: state.pace,
      });
      setState((prev) => ({
        ...prev,
        kcal_target: rec.kcal_target,
        protein_target_g: rec.protein_target_g,
        fibre_target_g: rec.fibre_target_g,
        steps_target: rec.steps_target,
      }));
    }
  }, [step, state.primary_goal, state.sex, state.age, state.height_cm, state.weight_kg, state.activity_level, state.pace]);

  // Step 3 is skipped for goals without a numeric target.
  const showsTargetStep =
    state.primary_goal === 'lose_weight' ||
    state.primary_goal === 'gain_weight' ||
    state.primary_goal === 'build_muscle';
  const TOTAL_STEPS = showsTargetStep ? 6 : 5;

  function next() {
    setError(null);
    if (step === 2 && !showsTargetStep) {
      setStep(4); // skip target step
    } else {
      setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
    }
  }

  function prev() {
    setError(null);
    if (step === 4 && !showsTargetStep) {
      setStep(2); // jump back over skipped target step
    } else {
      setStep((s) => Math.max(0, s - 1));
    }
  }

  async function persist(patch: Partial<WizardState>) {
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== null && v !== undefined) payload[k] = v;
      }
      if (Object.keys(payload).length > 0) {
        await updateUserGoals(payload);
      }
    } catch (err) {
      // Non-fatal — log and let user keep going. Final POST will retry.
      console.warn('[onboarding] persist failed:', err);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await updateUserGoals({
        primary_goal: state.primary_goal ?? undefined,
        sex: state.sex ?? undefined,
        age: state.age ?? undefined,
        height_cm: state.height_cm ?? undefined,
        weight_kg: state.weight_kg ?? undefined,
        target_weight_kg: state.target_weight_kg ?? undefined,
        activity_level: state.activity_level ?? undefined,
        pace: state.pace,
        kcal_target: state.kcal_target,
        protein_target_g: state.protein_target_g,
        fibre_target_g: state.fibre_target_g,
        steps_target: state.steps_target,
        enabled_tiles: state.enabled_tiles,
      });
      await markOnboardingComplete();
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'var(--color-background)',
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        paddingLeft: '1rem',
        paddingRight: '1rem',
      }}
    >
      <div className="max-w-md w-full mx-auto flex flex-col gap-4">
        <StepIndicator current={visibleStepNumber(step, showsTargetStep)} total={TOTAL_STEPS} />

        {step === 0 && <StepWelcome onNext={next} />}
        {step === 1 && (
          <StepGoal
            value={state.primary_goal}
            onChange={(v) => {
              setState((p) => ({ ...p, primary_goal: v }));
              void persist({ primary_goal: v });
            }}
            onNext={next}
            onBack={prev}
          />
        )}
        {step === 2 && (
          <StepAboutYou
            state={state}
            setState={setState}
            persist={persist}
            onNext={next}
            onBack={prev}
          />
        )}
        {step === 3 && showsTargetStep && (
          <StepTarget
            state={state}
            setState={setState}
            persist={persist}
            onNext={next}
            onBack={prev}
          />
        )}
        {step === 4 && (
          <StepTargets
            state={state}
            setState={setState}
            persist={persist}
            onNext={next}
            onBack={prev}
          />
        )}
        {step === 5 && (
          <StepHomeTiles
            state={state}
            setState={setState}
            persist={persist}
            onFinish={finish}
            onBack={prev}
            busy={busy}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function visibleStepNumber(step: number, showsTargetStep: boolean) {
  if (!showsTargetStep && step >= 4) return step; // 4 becomes index 3 visually
  return step + 1;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background:
              i < current
                ? 'var(--color-primary)'
                : 'var(--color-surface-warm)',
            transition: 'background 200ms ease-out',
          }}
        />
      ))}
    </div>
  );
}

// ─── Step 0 — Welcome ────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4 justify-center flex-1 mt-4">
      <div className="text-center">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(0,117,222,0.12)',
            color: 'var(--color-primary)',
            marginBottom: 18,
          }}
        >
          <Sparkles size={32} />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.5px',
          }}
        >
          Welcome to Dashki
        </h1>
        <p
          style={{
            margin: '12px 0 0 0',
            fontSize: 15,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.55,
            padding: '0 6px',
          }}
        >
          Let's spend 60 seconds personalising your dashboard.
          You can skip anything and tune it later.
        </p>
      </div>
      <GlassButton variant="primary" size="lg" onClick={onNext}>
        Let's go <ChevronRight size={16} style={{ marginLeft: 4 }} />
      </GlassButton>
    </div>
  );
}

// ─── Step 1 — Primary goal ───────────────────────────────────────────────

const GOAL_OPTIONS: Array<{
  value: PrimaryGoal;
  label: string;
  desc: string;
  icon: typeof Target;
}> = [
  { value: 'lose_weight', label: 'Lose weight', desc: 'Calorie deficit + protein', icon: TrendingDown },
  { value: 'gain_weight', label: 'Gain weight', desc: 'Calorie surplus', icon: TrendingUp },
  { value: 'build_muscle', label: 'Build muscle', desc: 'High protein, small surplus', icon: Dumbbell },
  { value: 'maintain', label: 'Maintain', desc: 'Stay at current weight', icon: Activity },
  { value: 'general_health', label: 'General health', desc: 'Just tracking & awareness', icon: Heart },
];

function StepGoal({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: PrimaryGoal | null;
  onChange: (v: PrimaryGoal) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <StepHeader title="What's your main goal?" subtitle="We'll tune your targets around this." />
      <div className="flex flex-col gap-2">
        {GOAL_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="cursor-pointer text-left"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                background: selected ? 'rgba(0,117,222,0.08)' : 'var(--color-surface)',
                border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-lg)',
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
                transition: 'background 120ms ease-out, border 120ms ease-out',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: selected ? 'rgba(0,117,222,0.18)' : 'var(--color-surface-warm)',
                  color: selected ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
              <div className="flex-1">
                <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-muted-foreground)',
                    marginTop: 1,
                  }}
                >
                  {opt.desc}
                </div>
              </div>
              {selected && <Check size={18} style={{ color: 'var(--color-primary)' }} />}
            </button>
          );
        })}
      </div>
      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!value} />
    </>
  );
}

// ─── Step 2 — About you ──────────────────────────────────────────────────

function StepAboutYou({
  state,
  setState,
  persist,
  onNext,
  onBack,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  persist: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  function patch<K extends keyof WizardState>(k: K, v: WizardState[K]) {
    setState((p) => ({ ...p, [k]: v }));
  }

  return (
    <>
      <StepHeader title="A bit about you" subtitle="Used only to calculate your daily targets." />
      <div className="flex flex-col gap-4">
        <div>
          <MicroLabel>Sex</MicroLabel>
          <div className="mt-2">
            <SegmentedControl<Sex>
              value={state.sex ?? 'male'}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ]}
              onChange={(v) => patch('sex', v)}
            />
          </div>
        </div>

        <GlassInput
          label="Age"
          type="number"
          inputMode="numeric"
          value={state.age ?? ''}
          onChange={(e) => patch('age', e.target.value ? Number(e.target.value) : null)}
          placeholder="30"
        />

        <GlassInput
          label="Height (cm)"
          type="number"
          inputMode="numeric"
          value={state.height_cm ?? ''}
          onChange={(e) =>
            patch('height_cm', e.target.value ? Number(e.target.value) : null)
          }
          placeholder="175"
        />

        <GlassInput
          label="Current weight (kg)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={state.weight_kg ?? ''}
          onChange={(e) =>
            patch('weight_kg', e.target.value ? Number(e.target.value) : null)
          }
          placeholder="75"
        />

        <div>
          <MicroLabel>Activity level</MicroLabel>
          <div className="mt-2 flex flex-col gap-2">
            {ACTIVITY_OPTIONS.map((opt) => {
              const selected = state.activity_level === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => patch('activity_level', opt.value)}
                  className="cursor-pointer text-left"
                  style={{
                    padding: '10px 14px',
                    background: selected ? 'rgba(0,117,222,0.08)' : 'var(--color-surface)',
                    border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 8,
                    color: 'var(--color-foreground)',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-muted-foreground)',
                      marginTop: 2,
                    }}
                  >
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <StepNav
        onBack={onBack}
        onNext={() => {
          void persist({
            sex: state.sex,
            age: state.age,
            height_cm: state.height_cm,
            weight_kg: state.weight_kg,
            activity_level: state.activity_level,
          });
          onNext();
        }}
        nextDisabled={
          !state.sex ||
          !state.age ||
          !state.height_cm ||
          !state.weight_kg ||
          !state.activity_level
        }
      />
    </>
  );
}

const ACTIVITY_OPTIONS: Array<{
  value: ActivityLevel;
  label: string;
  desc: string;
}> = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Desk job, little/no exercise' },
  { value: 'light', label: 'Lightly active', desc: 'Light exercise 1-3 days/week' },
  { value: 'moderate', label: 'Moderately active', desc: 'Moderate exercise 3-5 days/week' },
  { value: 'active', label: 'Active', desc: 'Hard exercise 6-7 days/week' },
  { value: 'very_active', label: 'Very active', desc: 'Hard daily, physical job' },
];

// ─── Step 3 — Target ─────────────────────────────────────────────────────

function StepTarget({
  state,
  setState,
  persist,
  onNext,
  onBack,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  persist: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <StepHeader
        title="What's your target?"
        subtitle="A rough goal helps us tune your calorie target. You can change it any time."
      />
      <div className="flex flex-col gap-4">
        <GlassInput
          label="Target weight (kg)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={state.target_weight_kg ?? ''}
          onChange={(e) =>
            setState((p) => ({
              ...p,
              target_weight_kg: e.target.value ? Number(e.target.value) : null,
            }))
          }
          placeholder="Leave blank to skip"
        />
        <div>
          <MicroLabel>Pace</MicroLabel>
          <div className="mt-2">
            <SegmentedControl<Pace>
              value={state.pace}
              options={[
                { value: 'slow', label: 'Slow' },
                { value: 'moderate', label: 'Moderate' },
                { value: 'aggressive', label: 'Aggressive' },
              ]}
              onChange={(v) => setState((p) => ({ ...p, pace: v }))}
            />
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Affects the calorie delta from maintenance:
            ±250 / ±500 / ±750 kcal per day.
          </div>
        </div>
      </div>
      <StepNav
        onBack={onBack}
        onNext={() => {
          void persist({
            target_weight_kg: state.target_weight_kg,
            pace: state.pace,
          });
          onNext();
        }}
      />
    </>
  );
}

// ─── Step 4 — Recommended targets ────────────────────────────────────────

function StepTargets({
  state,
  setState,
  persist,
  onNext,
  onBack,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  persist: (patch: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  function patch<K extends keyof WizardState>(k: K, v: WizardState[K]) {
    setState((p) => ({ ...p, [k]: v }));
  }

  return (
    <>
      <StepHeader
        title="Your daily targets"
        subtitle="We've calculated these from what you told us. Tap any number to change it."
      />
      <GlassCard>
        <div className="flex flex-col gap-3">
          <TargetRow
            label="Calories"
            unit="kcal"
            value={state.kcal_target}
            onChange={(v) => patch('kcal_target', v)}
            tone="primary"
          />
          <TargetRow
            label="Protein"
            unit="g"
            value={state.protein_target_g}
            onChange={(v) => patch('protein_target_g', v)}
            tone="success"
          />
          <TargetRow
            label="Fibre"
            unit="g"
            value={state.fibre_target_g}
            onChange={(v) => patch('fibre_target_g', v)}
            tone="teal"
          />
          <TargetRow
            label="Steps"
            unit=""
            value={state.steps_target}
            onChange={(v) => patch('steps_target', v)}
            tone="medium"
          />
        </div>
      </GlassCard>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-muted-foreground)',
          textAlign: 'center',
          lineHeight: 1.5,
          padding: '0 8px',
        }}
      >
        Targets are estimates — adjust them as you learn what works for your body.
      </div>
      <StepNav
        onBack={onBack}
        onNext={() => {
          void persist({
            kcal_target: state.kcal_target,
            protein_target_g: state.protein_target_g,
            fibre_target_g: state.fibre_target_g,
            steps_target: state.steps_target,
          });
          onNext();
        }}
      />
    </>
  );
}

function TargetRow({
  label,
  unit,
  value,
  onChange,
  tone,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  tone: 'primary' | 'success' | 'teal' | 'medium';
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Pill tone={tone}>{label}</Pill>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= 0) onChange(v);
          }}
          style={{
            width: 90,
            padding: '6px 8px',
            textAlign: 'right',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            color: 'var(--color-foreground)',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 700,
          }}
        />
        {unit && (
          <MonoNum size={12} color="var(--color-muted-foreground)">
            {unit}
          </MonoNum>
        )}
      </div>
    </div>
  );
}

// ─── Step 5 — Home tiles ─────────────────────────────────────────────────

const TILE_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: 'protein', label: 'Protein', desc: 'Daily protein progress' },
  { value: 'fiber', label: 'Fibre', desc: 'Daily fibre progress' },
  { value: 'steps', label: 'Steps', desc: 'Daily step count' },
  { value: 'weight', label: 'Weight', desc: 'Latest weight + trend' },
];

function StepHomeTiles({
  state,
  setState,
  persist,
  onFinish,
  onBack,
  busy,
  error,
}: {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  persist: (patch: Partial<WizardState>) => void;
  onFinish: () => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}) {
  function toggle(tile: string) {
    setState((p) => {
      const next = p.enabled_tiles.includes(tile)
        ? p.enabled_tiles.filter((t) => t !== tile)
        : [...p.enabled_tiles, tile];
      return { ...p, enabled_tiles: next };
    });
  }

  return (
    <>
      <StepHeader
        title="Customise your home"
        subtitle="Calories are always shown. Pick which extra tiles appear on the dashboard."
      />
      <div className="flex flex-col gap-2">
        {TILE_OPTIONS.map((opt) => {
          const enabled = state.enabled_tiles.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="cursor-pointer text-left"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                background: enabled ? 'rgba(0,117,222,0.08)' : 'var(--color-surface)',
                border: `1px solid ${enabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 8,
                color: 'var(--color-foreground)',
                fontFamily: 'inherit',
              }}
            >
              <div className="flex-1">
                <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-muted-foreground)',
                    marginTop: 2,
                  }}
                >
                  {opt.desc}
                </div>
              </div>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: enabled ? 'var(--color-primary)' : 'var(--color-surface)',
                  border: `1px solid ${enabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-primary-foreground)',
                }}
              >
                {enabled && <Check size={14} />}
              </div>
            </button>
          );
        })}
      </div>
      {error && (
        <div
          style={{
            padding: '10px 12px',
            background: 'rgba(201,28,43,0.08)',
            border: '1px solid rgba(201,28,43,0.3)',
            borderRadius: 6,
            fontSize: 13,
            color: 'var(--color-critical)',
          }}
        >
          {error}
        </div>
      )}
      <StepNav
        onBack={onBack}
        onNextLabel={busy ? 'Saving…' : 'Finish setup'}
        onNext={async () => {
          await persist({ enabled_tiles: state.enabled_tiles });
          onFinish();
        }}
        nextDisabled={busy}
      />
    </>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mt-2">
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'rgba(0,117,222,0.12)',
          color: 'var(--color-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Target size={18} />
      </div>
      <div className="flex-1">
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.3px',
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-muted-foreground)',
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  onNextLabel = 'Continue',
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  onNextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <GlassButton variant="ghost" size="lg" onClick={onBack}>
        <ChevronLeft size={16} style={{ marginRight: 2 }} />
        Back
      </GlassButton>
      <div style={{ flex: 1 }} />
      <GlassButton
        variant="primary"
        size="lg"
        onClick={onNext}
        disabled={nextDisabled}
      >
        {onNextLabel}
        <ChevronRight size={16} style={{ marginLeft: 4 }} />
      </GlassButton>
    </div>
  );
}

