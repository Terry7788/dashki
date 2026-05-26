// Settings screen — minimal v1 with sign-out and account deletion.
// Real port of web/src/app/settings/page.tsx happens in Phase 3.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut, Trash2, Target } from 'lucide-react';
import {
  GlassCard,
  GlassButton,
  GlassModal,
  MicroLabel,
  Pill,
} from '../components/ui';
import { useAuth } from '../lib/auth-context';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user, status, signOut, deleteAccount } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      navigate('/sign-in', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAccount() {
    setError(null);
    setBusy(true);
    try {
      await deleteAccount();
      navigate('/sign-in', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deletion failed');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'var(--color-background)',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
        paddingLeft: '1rem',
        paddingRight: '1rem',
      }}
    >
      <div className="max-w-md mx-auto flex flex-col gap-4">
        <header className="flex items-center gap-3 pt-2 pb-1">
          <Link
            to="/"
            aria-label="Back"
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
            <ChevronLeft size={18} />
          </Link>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              margin: 0,
            }}
          >
            Settings
          </h1>
        </header>

        {/* Account card */}
        <GlassCard>
          <MicroLabel>Account</MicroLabel>
          {status === 'signed-in' && user ? (
            <div className="mt-3 flex flex-col gap-2">
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {user.display_name || user.email}
              </div>
              {user.display_name && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-muted-foreground)',
                  }}
                >
                  {user.email}
                </div>
              )}
              <div className="mt-1 flex items-center gap-2">
                <Pill tone={user.subscription_status === 'lifetime' ? 'success' : 'neutral'} upper>
                  {user.subscription_status}
                </Pill>
              </div>
            </div>
          ) : status === 'guest' ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              Running in single-user guest mode. Your data is the legacy
              Dashki instance shared with the web app.
              <div className="mt-3">
                <Link
                  to="/sign-up"
                  style={{ color: 'var(--color-link)', fontWeight: 600 }}
                >
                  Create an account
                </Link>
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-muted-foreground)',
                marginTop: 8,
              }}
            >
              Loading…
            </div>
          )}
        </GlassCard>

        {/* Goals (links to onboarding wizard to edit) */}
        {status === 'signed-in' && (
          <GlassCard onClick={() => navigate('/onboarding')}>
            <div className="flex items-center gap-3">
              <Target size={18} style={{ color: 'var(--color-primary)' }} aria-hidden />
              <div className="flex-1">
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  Goals & targets
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-muted-foreground)',
                    marginTop: 2,
                  }}
                >
                  Re-run the setup wizard
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Sign out */}
        {(status === 'signed-in' || status === 'guest') && (
          <GlassButton
            variant="default"
            size="lg"
            onClick={handleSignOut}
            disabled={busy}
          >
            <LogOut size={14} style={{ marginRight: 6 }} />
            {status === 'guest' ? 'Exit guest mode' : 'Sign out'}
          </GlassButton>
        )}

        {/* Delete account — only if signed in (not guest, not Terry) */}
        {status === 'signed-in' && user && user.id !== 1 && (
          <GlassButton
            variant="danger"
            size="lg"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            <Trash2 size={14} style={{ marginRight: 6 }} />
            Delete account
          </GlassButton>
        )}
      </div>

      <GlassModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        subtitle="This cannot be undone."
        size="sm"
        leadingFooter={
          <GlassButton
            variant="danger"
            onClick={handleDeleteAccount}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Yes, delete everything'}
          </GlassButton>
        }
        footer={
          <GlassButton
            variant="ghost"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
          >
            Cancel
          </GlassButton>
        }
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: 'var(--color-muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          Deleting your account will permanently remove your journal entries,
          weight history, step logs, saved meals, and goals from Dashki.
          You'll be signed out and won't be able to recover any data.
        </p>
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 10px',
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
      </GlassModal>
    </div>
  );
}
