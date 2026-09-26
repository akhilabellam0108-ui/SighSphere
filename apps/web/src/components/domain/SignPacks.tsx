import { useCallback, useEffect, useState } from 'react';
import {
  PACKS,
  checkPack,
  installPack,
  loadInstalledPacks,
  removePack,
  type InstalledPack,
  type PackAvailability,
  type PackInfo,
} from '../../lib/datasets.js';
import { useToast } from '../../state/toast.js';
import { Badge, Button, Card, Icon, Notice, ProgressBar } from '../ui/index.js';

function PackCard({
  info,
  availability,
  installed,
  onChanged,
}: {
  info: PackInfo;
  availability: PackAvailability | null;
  installed: InstalledPack | undefined;
  onChanged(): void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function install() {
    setBusy(true);
    setError(null);
    try {
      const result = await installPack(info, (done, total) => setProgress({ done, total }));
      toast(`Installed ${result.signs.length} ISL signs. Recognition works for them now.`);
      onChanged();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not install this pack.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const removed = await removePack(info.id);
      toast(`Removed ${removed} built-in examples. Your own recordings were not touched.`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="stack-sm">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h3 className="small" style={{ margin: 0 }}>
          {info.name}
        </h3>
        {installed ? (
          <Badge tone="success" icon="check">
            Installed
          </Badge>
        ) : availability === 'available' ? (
          <Badge tone="accent">{info.sizeHint}</Badge>
        ) : availability === 'not-built' ? (
          <Badge tone="warning">Not built yet</Badge>
        ) : availability === 'offline' ? (
          <Badge tone="warning" icon="wifi-off">
            Needs internet
          </Badge>
        ) : null}
      </div>
      <p className="small muted mb-0">{info.description}</p>

      {installed && (
        <p className="small mb-0">
          <strong>{installed.signs.length} signs:</strong> {installed.signs.join(', ')}
        </p>
      )}

      {progress && <ProgressBar value={progress.done} max={progress.total} label="Installing examples" />}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}

      {!installed && availability === 'not-built' && (
        <p className="small muted mb-0">
          This pack has not been generated for this deployment yet. It is built from the INCLUDE
          videos with <code>services/ml/build_isl_pack.py</code> (instructions in{' '}
          <code>services/ml/README.md</code>).
        </p>
      )}

      <div className="btn-group">
        {installed ? (
          <>
            {availability === 'available' && (
              <Button icon="download" onClick={() => void install()} loading={busy}>
                Reinstall
              </Button>
            )}
            <Button variant="ghost" icon="trash" onClick={() => void remove()} disabled={busy}>
              Remove
            </Button>
          </>
        ) : (
          <Button variant="primary" icon="download" onClick={() => void install()} loading={busy} disabled={availability !== 'available'}>
            Install
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Built-in ISL sign packs: install / remove, with the dataset's required attribution. */
export function SignPacks({ onChange }: { onChange?(): void }) {
  const [availability, setAvailability] = useState<Record<string, PackAvailability>>({});
  const [installed, setInstalled] = useState<InstalledPack[]>(() => loadInstalledPacks());

  useEffect(() => {
    let cancelled = false;
    void Promise.all(PACKS.map(async (pack) => [pack.id, await checkPack(pack)] as const)).then((entries) => {
      if (!cancelled) setAvailability(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const changed = useCallback(() => {
    setInstalled(loadInstalledPacks());
    onChange?.();
  }, [onChange]);

  return (
    <div className="stack">
      <div className="grid-cards">
        {PACKS.map((pack) => (
          <PackCard
            key={pack.id}
            info={pack}
            availability={availability[pack.id] ?? null}
            installed={installed.find((item) => item.id === pack.id)}
            onChanged={changed}
          />
        ))}
      </div>
      <Notice tone="info" title="Where these signs come from">
        <span>
          Examples are derived from the <b>INCLUDE</b> dataset of Indian Sign Language by
          AI4Bharat (Sridhar, Ganesan, Kumar P. and Khapra, ACM Multimedia 2020), licensed{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
            CC BY 4.0
          </a>
          . Only hand and body positions are included — no video. INCLUDE was filmed with a few
          signers, so recognition for you may be weaker than for signs you record yourself; adding
          a few of your own recordings of the same sign helps a lot.
        </span>
      </Notice>
      <p className="hint mb-0">
        <Icon name="info" /> Built-in examples stay on this device, work offline once installed,
        and are never included in your training export.
      </p>
    </div>
  );
}
