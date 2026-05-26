import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GlassInput, GlassButton } from '../components/ui';
import { resetPassword } from '../lib/api';
import { AuthScreenShell, AuthError } from './AuthScreenShell';

export default function ResetPasswordScreen() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing reset token in URL');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setBusy(true);
    try {
      await resetPassword({ token, new_password: password });
      navigate('/sign-in', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreenShell title="Set a new password">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <GlassInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
        />
        <GlassInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <AuthError message={error} />
        <GlassButton type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'Resetting…' : 'Reset password'}
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
