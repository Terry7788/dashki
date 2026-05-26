// Temporary placeholder home screen. The real port of web/src/app/page.tsx
// happens in Phase 3 (DSHKI-58). For now this exercises Glass UI primitives
// and demonstrates the auth + backend wiring is alive.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Settings as SettingsIcon, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  Pill,
  MicroLabel,
  ProgressBar,
  CalorieRing,
  MacroBar,
} from '../components/ui';
import { getHealth, getBaseUrl } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import type { HealthCheck } from '../lib/types';

type PingState =
  | { status: 'idle' }
  | { status: 'pinging' }
  | { status: 'ok'; result: HealthCheck }
  | { status: 'error'; message: string };

export default function HomeScreen() {
  const { status, user } = useAuth();
  const [ping, setPing] = useState<PingState>({ status: 'idle' });

  async function handlePing() {
    setPing({ status: 'pinging' });
    try {
      const result = await getHealth();
      setPing({ status: 'ok', result });
    } catch (err) {
      setPing({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'var(--color-background)',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(5rem, env(safe-area-inset-bottom))',
        paddingLeft: '1rem',
        paddingRight: '1rem',
      }}
    >
      <div className="max-w-md mx-auto flex flex-col gap-4">
        {/* Header */}
        <header className="flex items-center justify-between pt-2 pb-1">
          <div className="flex items-center gap-2">
            <Sparkles size={18} style={{ color: 'var(--color-primary)' }} aria-hidden />
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.5px',
                margin: 0,
              }}
            >
              Dashki
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={status === 'signed-in' ? 'success' : 'neutral'} dot>
              {status === 'signed-in'
                ? user?.display_name || user?.email || 'Signed in'
                : status === 'guest'
                  ? 'Guest'
                  : 'Loading'}
            </Pill>
            <Link
              to="/settings"
              aria-label="Settings"
              style={{
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-soft)',
                borderRadius: 4,
                color: 'var(--color-foreground)',
              }}
            >
              <SettingsIcon size={16} aria-hidden />
            </Link>
          </div>
        </header>

        {/* Hero card — fake "today" tile (real port in Phase 3) */}
        <GlassCard>
          <div className="flex flex-col items-center gap-3">
            <MicroLabel>Today · sample data</MicroLabel>
            <CalorieRing value={1420} target={2000} size={160} />
            <div className="w-full grid grid-cols-3 gap-3 mt-2">
              <MacroBar label="Protein" value={92} target={140} tone="primary" />
              <MacroBar label="Fibre" value={18} target={30} tone="success" />
              <MacroBar label="Steps" value={6400} target={8000} unit="" tone="primary" />
            </div>
          </div>
        </GlassCard>

        {/* Backend connectivity card */}
        <GlassCard muted>
          <div className="flex items-start gap-3">
            <Wifi
              size={20}
              style={{
                color:
                  ping.status === 'ok'
                    ? 'var(--color-success)'
                    : ping.status === 'error'
                      ? 'var(--color-critical)'
                      : 'var(--color-muted-foreground)',
                marginTop: 2,
              }}
              aria-hidden
            />
            <div className="flex-1">
              <div style={{ fontWeight: 600, fontSize: 14 }}>Backend</div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-muted-foreground)',
                  marginTop: 2,
                  wordBreak: 'break-all',
                }}
              >
                {getBaseUrl()}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={handlePing}
                  disabled={ping.status === 'pinging'}
                >
                  {ping.status === 'pinging' ? 'Pinging…' : 'Ping /api/health'}
                </GlassButton>
                {ping.status === 'ok' && (
                  <Pill tone="success">
                    <CheckCircle2 size={11} style={{ marginRight: 2 }} />
                    {Math.round(ping.result.uptime)}s uptime
                  </Pill>
                )}
                {ping.status === 'error' && (
                  <Pill tone="critical">
                    <AlertCircle size={11} style={{ marginRight: 2 }} />
                    Failed
                  </Pill>
                )}
              </div>
              {ping.status === 'error' && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: 'rgba(201,28,43,0.08)',
                    border: '1px solid rgba(201,28,43,0.3)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--color-critical)',
                    lineHeight: 1.4,
                  }}
                >
                  {ping.message}
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Build progress */}
        <GlassCard>
          <MicroLabel>Build progress</MicroLabel>
          <div className="mt-3 flex flex-col gap-3">
            <PhaseRow label="Phase 0 · Scaffold + shell" pct={100} />
            <PhaseRow label="Phase 1 · Backend auth" pct={100} />
            <PhaseRow label="Phase 2 · Auth UI" pct={100} />
            <PhaseRow label="Phase 2.5 · Onboarding wizard" pct={0} />
            <PhaseRow label="Phase 3 · Port web pages" pct={0} />
          </div>
        </GlassCard>

        <footer
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--color-placeholder)',
            marginTop: 8,
          }}
        >
          Dashki Mobile · scaffold build · iOS + Android via Capacitor
        </footer>
      </div>
    </div>
  );
}

function PhaseRow({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--color-foreground)' }}>{label}</span>
        <span
          style={{
            fontSize: 11,
            color: 'var(--color-muted-foreground)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {pct}%
        </span>
      </div>
      <ProgressBar
        value={pct}
        max={100}
        tone={pct === 100 ? 'success' : 'primary'}
      />
    </div>
  );
}
