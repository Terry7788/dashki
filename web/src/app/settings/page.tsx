'use client';

import { useEffect, useState } from 'react';
import {
  User as UserIcon,
  Target,
  Settings as SettingsIcon,
  Database,
  Download,
  Trash2,
  Plug,
  Link as LinkIcon,
  Sun,
  Moon,
} from 'lucide-react';
import {
  GlassButton,
  CardShell,
  Pill,
} from '@/components/ui';
import {
  getGoals,
  updateGoals,
  getPreferences,
  updatePreferences,
} from '@/lib/api';
import type { HomeMetric } from '@/lib/api';
import type { Goals } from '@/lib/types';
import { useSocketEvent } from '@/lib/useSocketEvent';

const DEFAULT_GOALS: Goals = {
  id: 0,
  calories: 2000,
  protein: 150,
  carbs: null,
  fat: null,
  fiber: null,
  steps: 10000,
  weight_kg: null,
  weight_journey_start_date: null,
  tdee_calories: null,
  updated_at: '',
};

// ─── Row helpers ────────────────────────────────────────────────────────────

function Row({
  label,
  hint,
  control,
}: {
  label: string;
  hint?: string;
  control: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 16,
        alignItems: 'center',
        padding: '14px 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
        {hint && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-muted-foreground)',
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div>{control}</div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  unit,
  width = 120,
}: {
  value: number | string;
  onChange: (v: number) => void;
  unit: string;
  width?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width,
          textAlign: 'right',
          padding: '6px 10px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          color: 'var(--color-foreground)',
          fontFamily: 'inherit',
          fontSize: 14,
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
        {unit}
      </span>
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 32,
        height: 18,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: checked ? 'var(--color-primary)' : 'var(--color-soft-strong)',
          borderRadius: 9999,
          transition: 'background 120ms',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 14,
          height: 14,
          background: '#fff',
          borderRadius: 9999,
          boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
          transform: checked ? 'translateX(14px)' : 'translateX(0)',
          transition: 'transform 120ms ease-out',
        }}
      />
    </label>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [displayName, setDisplayName] = useState<string>('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [notif, setNotif] = useState(true);
  const [voice, setVoice] = useState(false);
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  // Which optional tiles render on the home dashboard. Calories is always on.
  const [homeMetrics, setHomeMetrics] = useState<HomeMetric[]>([
    'protein',
    'steps',
    'weight',
  ]);

  useEffect(() => {
    getGoals().then(setGoals).catch(() => {});
    getPreferences()
      .then((p) => {
        setDisplayName(p.display_name ?? '');
        setTheme(p.theme);
        if (p.home_metrics) setHomeMetrics(p.home_metrics);
      })
      .catch(() => {});
  }, []);

  function toggleHomeMetric(metric: HomeMetric) {
    setHomeMetrics((prev) => {
      const next = prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric];
      updatePreferences({ home_metrics: next }).catch(() => {});
      return next;
    });
  }

  useSocketEvent('goals-updated', () => {
    getGoals().then(setGoals).catch(() => {});
  });

  function saveGoal<K extends keyof Goals>(key: K, value: Goals[K]) {
    const next = { ...goals, [key]: value };
    setGoals(next);
    // updateGoals only accepts a Partial of the editable fields; cast to its
    // parameter type.
    updateGoals({ [key]: value } as Parameters<typeof updateGoals>[0]).catch(
      () => {}
    );
  }

  async function saveDisplayName() {
    setSavingDisplayName(true);
    try {
      await updatePreferences({ display_name: displayName.trim() || null });
    } finally {
      setSavingDisplayName(false);
    }
  }

  function toggleTheme() {
    const next: 'dark' | 'light' = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('dashki-theme', next);
    if (next === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    updatePreferences({ theme: next }).catch(() => {});
  }

  return (
    <main
      className="page-mount"
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '24px 16px 80px',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.4px',
            margin: 0,
            color: 'var(--color-foreground)',
          }}
        >
          Settings
        </h1>
        <div
          style={{
            color: 'var(--color-muted-foreground)',
            marginTop: 4,
            fontSize: 14,
          }}
        >
          Goals, preferences, and connected accounts.
        </div>
      </div>

      {/* Account */}
      <div style={{ marginTop: 24 }}>
        <CardShell
          title="Account"
          icon={<UserIcon style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '6px 0 14px',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 9999,
                background:
                  'linear-gradient(135deg, var(--color-primary) 0%, var(--color-teal) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              {(displayName || 'T').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    color: 'var(--color-foreground)',
                    fontFamily: 'inherit',
                    fontSize: 14,
                  }}
                />
                <GlassButton
                  variant="outline"
                  size="sm"
                  onClick={saveDisplayName}
                  disabled={savingDisplayName}
                >
                  {savingDisplayName ? 'Saving…' : 'Save'}
                </GlassButton>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-muted-foreground)',
                  marginTop: 4,
                }}
              >
                Shown in greetings across the app.
              </div>
            </div>
          </div>
        </CardShell>
      </div>

      {/* Daily goals */}
      <div style={{ marginTop: 16 }}>
        <CardShell
          title="Daily goals"
          icon={<Target style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
          hint={
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-muted-foreground)',
              }}
            >
              Used across the dashboard.
            </span>
          }
        >
          <Row
            label="Calories"
            hint="Target daily energy intake."
            control={
              <NumInput
                value={goals.calories}
                onChange={(v) => saveGoal('calories', v)}
                unit="kcal"
              />
            }
          />
          <Row
            label="Protein"
            hint="Target daily protein."
            control={
              <NumInput
                value={goals.protein}
                onChange={(v) => saveGoal('protein', v)}
                unit="g"
              />
            }
          />
          <Row
            label="Fibre"
            hint="Target daily dietary fibre."
            control={
              <NumInput
                value={goals.fiber ?? ''}
                onChange={(v) => saveGoal('fiber', v || null)}
                unit="g"
              />
            }
          />
          <Row
            label="Weight"
            hint="Long-term target."
            control={
              <NumInput
                value={goals.weight_kg ?? ''}
                onChange={(v) => saveGoal('weight_kg', v || null)}
                unit="kg"
              />
            }
          />
          <Row
            label="Steps per day"
            hint="Daily movement target."
            control={
              <NumInput
                value={goals.steps}
                onChange={(v) => saveGoal('steps', v)}
                unit="steps"
                width={140}
              />
            }
          />
        </CardShell>
      </div>

      {/* Home dashboard — toggle which optional tiles appear on the home page */}
      <div style={{ marginTop: 16 }}>
        <CardShell
          title="Home dashboard"
          icon={<Target style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
          hint={
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-muted-foreground)',
              }}
            >
              Calories is always shown. Toggle the rest.
            </span>
          }
        >
          <Row
            label="Protein bar"
            hint="Daily protein progress alongside calories."
            control={
              <Switch
                checked={homeMetrics.includes('protein')}
                onChange={() => toggleHomeMetric('protein')}
              />
            }
          />
          <Row
            label="Fibre bar"
            hint="Daily fibre intake progress."
            control={
              <Switch
                checked={homeMetrics.includes('fiber')}
                onChange={() => toggleHomeMetric('fiber')}
              />
            }
          />
          <Row
            label="Steps tile"
            hint="Today's step count + goal."
            control={
              <Switch
                checked={homeMetrics.includes('steps')}
                onChange={() => toggleHomeMetric('steps')}
              />
            }
          />
          <Row
            label="Weight tile"
            hint="Latest weight + goal direction."
            control={
              <Switch
                checked={homeMetrics.includes('weight')}
                onChange={() => toggleHomeMetric('weight')}
              />
            }
          />
        </CardShell>
      </div>

      {/* Preferences */}
      <div style={{ marginTop: 16 }}>
        <CardShell
          title="Preferences"
          icon={
            <SettingsIcon
              style={{ width: 14, height: 14, strokeWidth: 2.25 }}
            />
          }
        >
          <Row
            label="Theme"
            hint={theme === 'dark' ? 'Dark mode.' : 'Light mode.'}
            control={
              <GlassButton variant="outline" size="sm" onClick={toggleTheme}>
                {theme === 'dark' ? (
                  <>
                    <Sun style={{ width: 14, height: 14, marginRight: 6 }} />
                    Switch to light
                  </>
                ) : (
                  <>
                    <Moon style={{ width: 14, height: 14, marginRight: 6 }} />
                    Switch to dark
                  </>
                )}
              </GlassButton>
            }
          />
          <Row
            label="Notifications"
            hint="Daily reminders to log meals and weight."
            control={<Switch checked={notif} onChange={setNotif} />}
          />
          <Row
            label="Voice meal entry"
            hint="Use AI to parse voice notes into entries."
            control={<Switch checked={voice} onChange={setVoice} />}
          />
        </CardShell>
      </div>

      {/* Integrations */}
      <div style={{ marginTop: 16 }}>
        <CardShell
          title="Integrations"
          icon={<Plug style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
        >
          <IntegrationRow
            name="Discord bot"
            desc="Log meals from Discord with AI parsing."
            status="on"
          />
          <IntegrationRow
            name="Google Calendar"
            desc="Pull events for the calendar view."
            status="off"
          />
          <IntegrationRow
            name="OpenAI"
            desc="Powers AI fuzzy food matching."
            status="on"
          />
        </CardShell>
      </div>

      {/* Data */}
      <div style={{ marginTop: 16 }}>
        <CardShell
          title="Data"
          icon={<Database style={{ width: 14, height: 14, strokeWidth: 2.25 }} />}
        >
          <Row
            label="Export"
            hint="Download your journal, weights, steps as JSON."
            control={
              <GlassButton variant="outline" size="sm">
                <Download style={{ width: 13, height: 13, marginRight: 6 }} />
                Export
              </GlassButton>
            }
          />
          <Row
            label="Reset"
            hint="Clear all data. This permanently removes every entry. Cannot be undone."
            control={
              <GlassButton variant="danger" size="sm">
                <Trash2 style={{ width: 13, height: 13, marginRight: 6 }} />
                Reset
              </GlassButton>
            }
          />
        </CardShell>
      </div>

      <div
        style={{
          marginTop: 24,
          fontSize: 11,
          color: 'var(--color-muted-foreground)',
          textAlign: 'center',
        }}
      >
        Dashki · Built in Melbourne.
      </div>
    </main>
  );
}

function IntegrationRow({
  name,
  desc,
  status,
}: {
  name: string;
  desc: string;
  status: 'on' | 'off';
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'var(--color-surface-warm)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LinkIcon
          style={{
            width: 14,
            height: 14,
            strokeWidth: 2,
            color: 'var(--color-muted-foreground)',
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{name}</div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-muted-foreground)',
            marginTop: 1,
          }}
        >
          {desc}
        </div>
      </div>
      {status === 'on' ? (
        <Pill tone="success" dot>
          Connected
        </Pill>
      ) : (
        <GlassButton variant="outline" size="sm">
          Connect
        </GlassButton>
      )}
    </div>
  );
}
