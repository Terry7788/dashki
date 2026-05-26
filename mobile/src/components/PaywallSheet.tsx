// Paywall sheet — shown when a free user taps a premium-locked feature.
// Listing is hard-coded from PREMIUM_FEATURES; pricing is shown as a
// placeholder until RevenueCat is wired in.

import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  GlassModal,
  GlassButton,
  MicroLabel,
  Pill,
  MonoNum,
} from './ui';
import {
  PREMIUM_FEATURES,
  startPurchase,
  restorePurchases,
} from '../lib/subscription';

export default function PaywallSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubscribe() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await startPurchase();
      if (result.ok) {
        setStatus('Subscription active — thank you!');
        setTimeout(onClose, 1500);
      } else {
        setStatus(result.reason ?? 'Could not complete purchase.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await restorePurchases();
      setStatus(result.ok ? 'Restored.' : result.reason ?? 'Nothing to restore.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Dashki Premium"
      subtitle="Unlock the full kit"
      size="md"
      mobileFullscreen
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose} disabled={busy}>
            Maybe later
          </GlassButton>
          <GlassButton variant="primary" onClick={handleSubscribe} disabled={busy}>
            {busy ? 'Working…' : 'Subscribe'}
          </GlassButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Hero */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '12px 8px 4px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'rgba(0,117,222,0.12)',
              color: 'var(--color-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={24} />
          </div>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '-0.3px',
              }}
            >
              Go further with Premium
            </h2>
            <p
              style={{
                margin: '8px 16px 0',
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                lineHeight: 1.5,
              }}
            >
              Help fund Dashki development and unlock the features built for
              power users.
            </p>
          </div>
          {/* Placeholder pricing — replace once RevenueCat offerings are live */}
          <div className="flex items-baseline gap-2 mt-2">
            <MonoNum size={28}>$4.99</MonoNum>
            <span
              style={{
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
              }}
            >
              / month
            </span>
            <Pill tone="primary" upper>
              Indicative
            </Pill>
          </div>
        </div>

        {/* Feature list */}
        <div
          style={{
            background: 'var(--color-surface-warm)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 14,
          }}
        >
          <MicroLabel>What you get</MicroLabel>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '10px 0 0 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {PREMIUM_FEATURES.map((feature) => (
              <li
                key={feature.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: 'rgba(26,174,57,0.15)',
                    color: 'var(--color-success)',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  <Check size={12} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {feature.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-muted-foreground)',
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {feature.description}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Status */}
        {status && (
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--color-surface-warm)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              fontSize: 13,
              color: 'var(--color-muted-foreground)',
              lineHeight: 1.4,
            }}
          >
            {status}
          </div>
        )}

        {/* Restore */}
        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleRestore}
            disabled={busy}
            className="cursor-pointer"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--color-link)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Restore purchases
          </button>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--color-placeholder)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Subscriptions auto-renew unless cancelled at least 24 hours before
          the end of the period. Manage and cancel in App Store / Play Store
          settings.
        </p>
      </div>
    </GlassModal>
  );
}
