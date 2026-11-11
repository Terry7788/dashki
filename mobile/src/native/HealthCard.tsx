// Steps page, phone only: connect Samsung Health (Health Connect) once; after
// that a slim line shows the last sync with "Sync now". The steps themselves
// land in the normal step log (one "Samsung Health" entry a day), so the
// website's Steps page shows them like any other entry.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  connectHealth,
  healthStatus,
  healthSupported,
  onHealthSync,
  syncHealthSteps,
  type HealthStatus,
} from './health';

function ago(ms?: number): string {
  if (!ms) return 'not synced yet';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'synced just now';
  if (m < 60) return `synced ${m} min ago`;
  const h = Math.round(m / 60);
  return `synced ${h} h ago`;
}

export default function HealthCard() {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const refresh = useCallback(async () => setStatus(await healthStatus()), []);

  useEffect(() => {
    void refresh();
    return onHealthSync(() => void refresh());
  }, [refresh]);

  if (!healthSupported() || !status) return null;

  async function connect() {
    setBusy(true);
    setNote('');
    try {
      setStatus(await connectHealth());
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open Health Connect');
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    const r = await syncHealthSteps();
    setNote(r && !r.ok ? r.message : '');
    await refresh();
    setBusy(false);
  }

  return (
    <div className="phone-health">
      <div className="phone-health-card">
        <div style={{ minWidth: 0 }}>
          <div className="phone-health-title">Samsung Health</div>
          <div className="phone-health-sub">
            {!status.available
              ? "Health Connect isn't available on this phone."
              : status.granted
                ? `Steps update by themselves · ${ago(status.lastSync)}`
                : 'Connect once and your steps fill in by themselves.'}
            {note ? ` · ${note}` : ''}
          </div>
        </div>
        {status.available &&
          (status.granted ? (
            <button type="button" className="phone-health-btn" onClick={sync} disabled={busy} aria-label="Sync steps now">
              <RefreshCw size={15} className={busy ? 'animate-spin' : undefined} /> Sync now
            </button>
          ) : (
            <button type="button" className="phone-health-btn primary" onClick={connect} disabled={busy}>
              {busy ? 'Opening…' : 'Connect'}
            </button>
          ))}
      </div>
    </div>
  );
}
