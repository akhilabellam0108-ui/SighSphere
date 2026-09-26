import { useCallback, useEffect, useState } from 'react';
import { useOnline } from '../../hooks/useDevice.js';
import { getOfflineStatus, prepareRecognitionOffline, type OfflineStatus } from '../../lib/offline.js';
import { sampleCounts } from '../../lib/storage.js';
import { Badge, Button, Card, Icon, Notice } from '../ui/index.js';

/** Emergency signs the Emergency screen can accept (keep in sync with Emergency.tsx). */
const SOS_SIGNS = ['HELP', 'EMERGENCY', 'AMBULANCE', 'POLICE', 'FIRE', 'HOSPITAL', 'DOCTOR', 'PAIN', 'SICK', 'MEDICINE', 'DEAF'];

function Row({ ok, title, detail }: { ok: boolean | null; title: string; detail: string }) {
  return (
    <li className="list-item" style={{ alignItems: 'flex-start' }}>
      <span className={`icon-tile ${ok ? 'green' : ok === false ? 'amber' : ''}`} aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12 }}>
        <Icon name={ok ? 'check' : ok === false ? 'alert' : 'spinner'} />
      </span>
      <div className="list-item-main">
        <p className="list-item-title">
          {title} <span className="sr-only">{ok ? '(ready)' : '(not ready)'}</span>
        </p>
        <p className="small muted">{detail}</p>
      </div>
    </li>
  );
}

/**
 * "Can I rely on this with no signal?" — a checklist for offline use, with one button that
 * downloads the recognition models while a connection is available.
 */
export function OfflineReadiness({ compact }: { compact?: boolean }) {
  const online = useOnline();
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [sosKnown, setSosKnown] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getOfflineStatus().then(setStatus);
    void sampleCounts()
      .then((counts) => setSosKnown(SOS_SIGNS.filter((sign) => (counts[sign] ?? 0) > 0)))
      .catch(() => setSosKnown([]));
  }, []);
  useEffect(refresh, [refresh]);

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await prepareRecognitionOffline());
      refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare offline use.');
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(status?.appCached && status.recognitionCached && (sosKnown?.length ?? 0) > 0);

  return (
    <Card className="stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h3 className="small" style={{ margin: 0 }}>
          Offline readiness
        </h3>
        {status && (ready ? <Badge tone="success" icon="check">Ready offline</Badge> : <Badge tone="warning">Not fully ready</Badge>)}
      </div>
      {!compact && (
        <p className="small muted mb-0">
          Recognition runs entirely on this device, so it needs no signal — once the app, the
          recognition models and some signs are stored here. Do this on Wi-Fi before you travel.
        </p>
      )}
      <ul className="list">
        <Row
          ok={status ? status.appCached : null}
          title="App saved on this device"
          detail={
            status?.appCached
              ? 'Every screen opens with no connection, including Emergency.'
              : 'Happens automatically after the first visit to the installed/published app (not in development mode).'
          }
        />
        <Row
          ok={status ? status.recognitionCached : null}
          title="Sign recognition models (~15 MB)"
          detail={status?.recognitionCached ? 'Downloaded — the camera can recognise signs offline.' : 'Not downloaded yet. Use the button below while online.'}
        />
        <Row
          ok={sosKnown ? sosKnown.length > 0 : null}
          title="Emergency signs it can recognise"
          detail={
            sosKnown && sosKnown.length > 0
              ? `${sosKnown.join(', ')}. Phrase cards work for everything else.`
              : 'None yet. Install “ISL emergency signs” or record HELP, PAIN, DOCTOR… Phrase cards always work regardless.'
          }
        />
      </ul>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <div className="btn-group">
        <Button variant="primary" icon="download" onClick={() => void prepare()} loading={busy} disabled={!online || Boolean(status?.recognitionCached)}>
          {status?.recognitionCached ? 'Models downloaded' : 'Download for offline use'}
        </Button>
        {!online && <span className="small muted">Connect to the internet to download.</span>}
      </div>
    </Card>
  );
}
