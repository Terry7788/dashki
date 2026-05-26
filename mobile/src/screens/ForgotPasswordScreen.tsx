import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { GlassInput, GlassButton } from '../components/ui';
import { requestPasswordReset } from '../lib/api';
import { AuthScreenShell, AuthError } from './AuthScreenShell';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <AuthScreenShell
        title="Check your email"
        subtitle="If an account exists for that email, we've sent password reset instructions."
      >
        <Link to="/sign-in" style={{ color: 'var(--color-link)', fontWeight: 600 }}>
          Back to sign in
        </Link>
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell
      title="Reset password"
      subtitle="Enter the email on your account and we'll send you a reset link."
    >
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
        <AuthError message={error} />
        <GlassButton type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset email'}
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
        <Link to="/sign-in" style={{ color: 'var(--color-link)', fontWeight: 600 }}>
          Back to sign in
        </Link>
      </div>
    </AuthScreenShell>
  );
}
