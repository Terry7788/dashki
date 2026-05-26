// Placeholder screens for tabs whose real ports come in subsequent
// sessions. Each links back to the relevant web URL so the user knows
// to use web for full functionality until the mobile version ships.
//
// Tickets to follow:
//   - DSHKI-58 Journal page port  ✅ DONE (JournalScreen.tsx)
//   - DSHKI-59 Weight page port   ✅ DONE (WeightScreen.tsx)
//   - DSHKI-60 Steps page port    ✅ DONE (StepsScreen.tsx)
//   - DSHKI-61 Meals + Foods + Calendar ports — what remains here

import type { ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { GlassCard, GlassButton, MicroLabel, Pill } from '../components/ui';
import PageHeader from '../components/PageHeader';

function ComingSoonScreen({
  title,
  description,
  ticket,
}: {
  title: string;
  description: ReactNode;
  ticket: string;
}) {
  return (
    <div style={{ background: 'var(--color-background)', minHeight: '100vh' }}>
      <PageHeader title={title} />
      <div
        style={{
          padding: '0 1rem 1rem 1rem',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        <GlassCard>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              padding: '20px 8px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: 'var(--color-surface-warm)',
                color: 'var(--color-muted-foreground)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Construction size={22} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: '-0.3px',
                }}
              >
                Coming soon
              </h2>
              <p
                style={{
                  margin: '8px 0 0 0',
                  fontSize: 13,
                  color: 'var(--color-muted-foreground)',
                  lineHeight: 1.5,
                  maxWidth: 280,
                }}
              >
                {description}
              </p>
            </div>
            <Pill tone="primary">{ticket}</Pill>
            <GlassButton
              variant="outline"
              size="sm"
              onClick={() => (window.location.href = 'https://dashki.app')}
            >
              Open on web instead
            </GlassButton>
          </div>
        </GlassCard>

        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: 'var(--color-surface-warm)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
          }}
        >
          <MicroLabel>What's wired up already</MicroLabel>
          <ul
            style={{
              margin: '8px 0 0 18px',
              padding: 0,
              fontSize: 13,
              color: 'var(--color-muted-foreground)',
              lineHeight: 1.6,
            }}
          >
            <li>Backend endpoints exist and respond to the mobile API client</li>
            <li>Types in mobile/src/lib/types.ts match server data shapes</li>
            <li>Glass UI primitives ready to render the real page</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function MealsScreen() {
  return (
    <ComingSoonScreen
      title="Saved meals"
      description={
        <>
          Build and reuse meal templates — recipe-style combinations of foods
          you eat regularly.
        </>
      }
      ticket="DSHKI-61"
    />
  );
}

export function FoodsScreen() {
  return (
    <ComingSoonScreen
      title="Foods"
      description={
        <>
          Your food database — view, edit, and delete custom foods. Camera-based
          nutrition label scanning included.
        </>
      }
      ticket="DSHKI-62"
    />
  );
}

export function CalendarScreen() {
  return (
    <ComingSoonScreen
      title="Calendar"
      description={
        <>
          Day-by-day overview of food, weight, and steps. Google Calendar
          integration for context.
        </>
      }
      ticket="DSHKI-63"
    />
  );
}
