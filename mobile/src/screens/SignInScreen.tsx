import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GlassInput, GlassButton } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import { AuthScreenShell, AuthError } from './AuthScreenShell';

export default function SignInScreen() {
  const navigate = useNavigate();
  const { signIn, continueAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleGuest() {
    setBusy(true);
    try {
      await continueAsGuest();
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell title="Sign in" subtitle="Welcome back.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <GlassInput
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <GlassInput
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
        <AuthError message={error} />
        <GlassButton type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </GlassButton>
      </form>

      <div
        style={{
          fontSize: 13,
          color: 'var(--color-muted-foreground)',
          textAlign: 'center',
          marginTop: 4,
        }}
      >
        <Link to="/forgot-password" style={{ color: 'var(--color-link)' }}>
          Forgot password?
        </Link>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: 16,
          fontSize: 13,
          color: 'var(--color-muted-foreground)',
          textAlign: 'center',
        }}
      >
        New to Dashki?{' '}
        <Link to="/sign-up" style={{ color: 'var(--color-link)', fontWeight: 600 }}>
          Create an account
        </Link>
      </div>

      <GlassButton variant="ghost" size="sm" onClick={handleGuest} disabled={busy}>
        Continue as guest (single-user mode)
      </GlassButton>
    </AuthScreenShell>
  );
}
