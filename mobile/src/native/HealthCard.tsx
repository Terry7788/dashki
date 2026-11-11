// Steps page, phone only: connect Samsung Health (Health Connect) once; after
// that a slim line shows the last sync with "Sync now" and what Health Connect
// reported per app. Dashki's own entries are written back for Samsung Health. The steps themselves
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
  const [sources, setSources] = useState<string>('');
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
    setNote(r && !r.ok ? `Sync failed: ${r.message}` : '');
    if (r?.ok) {
      const list = (r.sources || []).map((s) => `${s.app} ${s.steps.toLocaleString()}`).join(' · ');
      setSources(`Health Connect today: ${r.today.toLocaleString()}${list ? ` (${list})` : ' (no step records yet)'}`);
    }
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
                ? `Steps update by themselves · ${ago(status.lastSync)}${status.write ? '' : ' · allow "Write steps" so Dashki entries reach Samsung Health'}`
                : 'Connect once and your steps fill in by themselves.'}
            {note ? ` · ${note}` : ''}
          </div>
          {sources && <div className="phone-health-sub">{sources}</div>}
        </div>
        {status.available &&
          (status.granted && status.write ? (
            <button type="button" className="phone-health-btn" onClick={sync} disabled={busy} aria-label="Sync steps now">
              <RefreshCw size={15} className={busy ? 'animate-spin' : undefined} /> Sync now
            </button>
          ) : (
            <button type="button" className="phone-health-btn primary" onClick={async () => { await connect(); await sync(); }} disabled={busy}>
              {busy ? 'Opening…' : status.granted ? 'Allow' : 'Connect'}
            </button>
          ))}
      </div>
    </div>
  );
}
