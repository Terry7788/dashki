import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GlassInput, GlassButton } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import { AuthScreenShell, AuthError } from './AuthScreenShell';

export default function SignUpScreen() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await signUp(
        email.trim().toLowerCase(),
        password,
        displayName.trim() || undefined,
      );
      // New users go straight into the onboarding wizard.
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell
      title="Create your account"
      subtitle="Track food, weight, steps, and meals — your way."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <GlassInput
          label="Display name"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Optional"
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
        />
        <AuthError message={error} />
        <GlassButton type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </GlassButton>
      </form>

      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: 16,
          fontSize: 13,
          color: 'var(--color-muted-foreground)',
          textAlign: 'center',
        }}
      >
        Already have an account?{' '}
        <Link to="/sign-in" style={{ color: 'var(--color-link)', fontWeight: 600 }}>
          Sign in
        </Link>
      </div>
    </AuthScreenShell>
  );
}
