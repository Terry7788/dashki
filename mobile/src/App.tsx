import { useState } from 'react';
import { Sparkles, Smartphone } from 'lucide-react';
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

/**
 * Hello-Dashki preview screen (DSHKI-48).
 *
 * Demonstrates the Glass UI primitives + Atoms rendering correctly inside the
 * Capacitor WebView and in browser. Real journal/weight/steps screens land in
 * Phase 3 (DSHKI-52 onwards). This page exists so DSHKI-51 (TestFlight + Play
 * Internal) has something tangible to demo on a real device.
 */
function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');

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
                Capacitor + Vite + React + Tailwind running. Glass UI primitives
                rendering. Real screens coming next — see DSHKI-45 epic.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Pill tone="success" dot>
                  Phase 0
                </Pill>
                <Pill tone="neutral">DSHKI-46/47/48</Pill>
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
          <GlassButton
            variant="primary"
            size="lg"
            onClick={() => setModalOpen(true)}
          >
            Open demo modal
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
