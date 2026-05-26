// Onboarding screen — Phase 2 ships a minimal "tap to continue" stub.
// The full 6-step wizard (welcome → goal → about you → target → recommended
// targets → home tiles) is filled in by Phase 2.5 (DSHKI-56).

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { GlassCard, GlassButton } from '../components/ui';
import { markOnboardingComplete } from '../lib/api';
import { useAuth } from '../lib/auth-context';

export default function OnboardingScreen() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleContinue() {
    setBusy(true);
    try {
      await markOnboardingComplete();
      await refresh();
      navigate('/', { replace: true });
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
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="text-center mb-6">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'rgba(0,117,222,0.12)',
              color: 'var(--color-primary)',
              marginBottom: 16,
            }}
          >
            <Sparkles size={26} />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.5px',
            }}
          >
            Welcome to Dashki
          </h1>
          <p
            style={{
              margin: '10px 0 0 0',
              fontSize: 14,
              color: 'var(--color-muted-foreground)',
              lineHeight: 1.5,
            }}
          >
            Track food, weight, steps, and meals in a clean dashboard.
          </p>
        </div>

        <GlassCard>
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '-0.25px',
            }}
          >
            Quick setup
          </h2>
          <p
            style={{
              margin: '8px 0 16px 0',
              fontSize: 13,
              color: 'var(--color-muted-foreground)',
              lineHeight: 1.5,
            }}
          >
            We'll personalize your dashboard based on your goal. The full
            wizard ships in the next release — for now, you'll start with
            sensible defaults (2000 kcal, 100g protein, 30g fibre, 8000 steps)
            which you can adjust any time from Settings.
          </p>
          <GlassButton
            variant="primary"
            size="lg"
            onClick={handleContinue}
            disabled={busy}
          >
            {busy ? 'Setting up…' : 'Continue to Dashki'}
          </GlassButton>
        </GlassCard>
      </div>
    </div>
  );
}
