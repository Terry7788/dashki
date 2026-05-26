import { useState } from 'react';
import { Sparkles, Smartphone, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassModal,
  GlassInput,
  Pill,
  MicroLabel,
  MonoNum,
  ProgressBar,
  CalorieRing,
  MacroBar,
} from './components/ui';
import { getHealth, getBaseUrl } from './lib/api';
import type { HealthCheck } from './lib/types';

type PingState =
  | { status: 'idle' }
  | { status: 'pinging' }
  | { status: 'ok'; result: HealthCheck }
  | { status: 'error'; message: string };

/**
 * Hello-Dashki preview screen (DSHKI-46 / 47 / 48 / 49).
 *
 * Exercises the Glass UI primitives + Atoms inside the Capacitor WebView
 * and proves end-to-end network reach to the Dashki backend via the API
 * client in src/lib/api.ts.
 *
 * Real journal/weight/steps/etc. screens land in Phase 3.
 */
function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
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
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        paddingLeft: '1rem',
        paddingRight: '1rem',
      }}
    >
      <div className="max-w-md mx-auto flex flex-col gap-4">
        {/* Header */}
        <header className="flex items-center justify-between pt-2 pb-1">
          <div className="flex items-center gap-2">
            <Sparkles
              size={18}
              style={{ color: 'var(--color-primary)' }}
              aria-hidden
            />
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
          <Pill tone="primary" upper>
            v0.1 preview
          </Pill>
        </header>

        {/* Hero card — fake "today" tile */}
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
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--color-foreground)',
                }}
              >
                Backend connection
              </div>
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
                <PingBadge state={ping} />
              </div>
              {ping.status === 'ok' && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--color-muted-foreground)',
                    lineHeight: 1.55,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--color-success)' }}>ok</span>{' '}
                    · env={ping.result.env}
                  </div>
                  <div>uptime: {Math.round(ping.result.uptime)}s</div>
                  <div>at: {ping.result.timestamp}</div>
                </div>
              )}
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

        {/* Status card */}
        <GlassCard muted>
          <div className="flex items-start gap-3">
            <Smartphone
              size={20}
              style={{ color: 'var(--color-muted-foreground)', marginTop: 2 }}
              aria-hidden
            />
            <div className="flex-1">
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--color-foreground)',
                }}
              >
                Mobile shell wired up
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-muted-foreground)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Capacitor + Vite + React + Tailwind running. Glass UI rendering.
                API client wired. Real screens coming next — see DSHKI-45 epic.
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Pill tone="success" dot>
                  Phase 0 complete
                </Pill>
                <Pill tone="neutral">46 / 47 / 48 / 49</Pill>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Pipeline progress */}
        <GlassCard>
          <MicroLabel>Build progress</MicroLabel>
          <div className="mt-3 flex flex-col gap-3">
            <PhaseRow label="Phase 0 · Scaffold + shell" pct={100} />
            <PhaseRow label="Phase 1 · Backend auth" pct={0} />
            <PhaseRow label="Phase 2 · Auth UI" pct={0} />
            <PhaseRow label="Phase 2.5 · Onboarding wizard" pct={0} />
            <PhaseRow label="Phase 3 · Port web pages" pct={0} />
          </div>
        </GlassCard>

        {/* Modal demo trigger */}
        <div className="flex justify-center pt-1">
          <GlassButton variant="ghost" size="sm" onClick={() => setModalOpen(true)}>
            Open Glass modal demo
          </GlassButton>
        </div>

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

      {/* Demo modal exercises GlassModal + GlassInput + GlassButton */}
      <GlassModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="It works on your phone"
        subtitle="Demo modal · DSHKI-48"
        size="md"
        footer={
          <>
            <GlassButton variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={() => {
                setModalOpen(false);
                setName('');
              }}
            >
              Looks good
            </GlassButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p
            style={{
              fontSize: 14,
              color: 'var(--color-muted-foreground)',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            If you can see this modal with the dark Notion-warm panel, the
            border, and the multi-layer shadow — the Glass primitives are wired
            up correctly. The Escape key and backdrop click should both close.
          </p>
          <GlassInput
            label="What should we call you?"
            placeholder="Terry"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <MicroLabel>You typed:</MicroLabel>
            <MonoNum size={14}>{name || '—'}</MonoNum>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}

function PingBadge({ state }: { state: PingState }) {
  if (state.status === 'idle')
    return <Pill tone="neutral">Not pinged yet</Pill>;
  if (state.status === 'pinging') return <Pill tone="primary">Sending…</Pill>;
  if (state.status === 'ok')
    return (
      <Pill tone="success">
        <CheckCircle2 size={11} style={{ marginRight: 2 }} />
        {Math.round(state.result.uptime)}s uptime
      </Pill>
    );
  return (
    <Pill tone="critical">
      <AlertCircle size={11} style={{ marginRight: 2 }} />
      Failed
    </Pill>
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
        <span style={{ fontSize: 13, color: 'var(--color-foreground)' }}>
          {label}
        </span>
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

export default App;
