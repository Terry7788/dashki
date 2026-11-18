'use client';

// The phone tab bar's "More" tab: every page that has no tab of its own, and
// the theme switch that used to sit in the slide-out menu. Wide screens reach
// these pages from the sidebar, but the page works there too.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Calendar, ChevronRight, Footprints, Moon, Salad, Scale, Settings as SettingsIcon, Sun } from 'lucide-react';
import { MicroLabel } from '@/components/ui';
import { getLatestWeight, getSavedMeals, getTodaySteps } from '@/lib/api';
import { THEME_EVENT, isDarkNow, toggleTheme } from '@/lib/theme';

const CARD: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-card)',
  padding: 4,
};

function Row({
  href,
  label,
  icon: Icon,
  value,
  first,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  value?: string;
  first?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center no-underline"
      style={{
        minHeight: 52,
        padding: '0 10px 0 12px',
        gap: 12,
        color: 'var(--color-foreground)',
        borderTop: first ? undefined : '1px solid var(--color-border)',
      }}
    >
      <Icon style={{ width: 16, height: 16, flex: 'none', color: 'var(--color-muted-foreground)' }} />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{label}</span>
      {value && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted-foreground)' }}>
          {value}
        </span>
      )}
      <ChevronRight style={{ width: 14, height: 14, flex: 'none', color: 'var(--color-muted-foreground)' }} />
    </Link>
  );
}

export default function MorePage() {
  const [dark, setDark] = useState(true);
  const [meals, setMeals] = useState('');
  const [weight, setWeight] = useState('');
  const [steps, setSteps] = useState('');

  useEffect(() => {
    setDark(isDarkNow());
    const onTheme = (e: Event) => setDark(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(THEME_EVENT, onTheme);
    getSavedMeals().then((m) => setMeals(String(m.length))).catch(() => {});
    getLatestWeight().then((w) => w && setWeight(`${w.weight_kg} kg`)).catch(() => {});
    getTodaySteps().then((s) => setSteps(`${(s.steps ?? 0).toLocaleString()} today`)).catch(() => {});
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, []);

  return (
    <main className="page-mount" style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', margin: 0, color: 'var(--color-foreground)' }}>
        More
      </h1>

      <MicroLabel style={{ margin: '20px 0 6px 4px' }}>Food</MicroLabel>
      <div style={CARD}>
        <Row href="/meals" label="Saved meals" icon={Salad} value={meals} first />
      </div>

      <MicroLabel style={{ margin: '20px 0 6px 4px' }}>Track</MicroLabel>
      <div style={CARD}>
        <Row href="/weight" label="Weight" icon={Scale} value={weight} first />
        <Row href="/steps" label="Steps" icon={Footprints} value={steps} />
        <Row href="/calendar" label="Calendar" icon={Calendar} />
      </div>

      <div style={{ ...CARD, marginTop: 20 }}>
        <Row href="/settings" label="Settings" icon={SettingsIcon} first />
        <div
          className="flex items-center"
          style={{ minHeight: 52, padding: '0 6px 0 12px', gap: 12, borderTop: '1px solid var(--color-border)' }}
        >
          {dark ? (
            <Moon style={{ width: 16, height: 16, flex: 'none', color: 'var(--color-muted-foreground)' }} />
          ) : (
            <Sun style={{ width: 16, height: 16, flex: 'none', color: 'var(--color-muted-foreground)' }} />
          )}
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Theme</span>
          <button
            type="button"
            onClick={() => setDark(toggleTheme())}
            className="inline-flex items-center cursor-pointer"
            style={{
              height: 40,
              padding: '6px 12px',
              gap: 6,
              borderRadius: 4,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-foreground)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {dark ? <Sun style={{ width: 14, height: 14 }} /> : <Moon style={{ width: 14, height: 14 }} />}
            {dark ? 'Switch to light' : 'Switch to dark'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--color-muted-foreground)' }}>
        Dashki v0.1.0
      </div>
    </main>
  );
}
