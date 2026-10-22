import { useCallback, useEffect, useState } from 'react';
import { FIELDS, typeLabel } from '../lib/accountTypes.js';
import { friendlyError, type Account, type AdminOverview, type Feedback } from '../lib/backend.js';
import { Analytics, AnnouncementsAdmin, EmailAlerts, Errors, PackPublisher, Team, Users, VocabularyAdmin } from './AdminTools.js';
import { useSession } from '../state/session.js';
import { FEEDBACK_KINDS } from './Feedback.js';

type Tab = 'reviews' | 'reports' | 'errors' | 'users' | 'team' | 'news' | 'words' | 'stats' | 'pack' | 'alerts';

/** SignSphere team only: verify hospitals and organisations, answer reports, publish the sign pack. */
export default function Admin() {
  const { backend, isAdmin, refreshAlerts } = useSession();
  const [tab, setTab] = useState<Tab>('reviews');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [openErrors, setOpenErrors] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(() => {
    backend.adminOverview().then(setOverview, (e: unknown) => setError(friendlyError(e)));
    backend.adminOpenErrors().then(setOpenErrors, () => setOpenErrors(0));
    refreshAlerts();
  }, [backend, refreshAlerts]);
  useEffect(() => {
    if (isAdmin) loadOverview();
  }, [isAdmin, loadOverview]);

  if (!isAdmin) {
    return (
      <>
        <h1>Admin</h1>
        <p className="notice">
          This area is for the SignSphere team.{' '}
          {backend.mode === 'cloud' ? 'Your login is not an admin.' : 'It needs the SignSphere server, which is not connected on this copy of the app.'}
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Admin</h1>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {overview && (
        <div className="admin-stats" role="list" aria-label="Overview">
          <Stat label="Logins" value={overview.logins} />
          <Stat label="Hospitals" value={overview.accounts['hospital'] ?? 0} />
          <Stat label="Organisations" value={overview.accounts['organisation'] ?? 0} />
          <Stat label="Individuals" value={overview.accounts['individual'] ?? 0} />
          <Stat label="Waiting for review" value={overview.pendingReviews} />
          <Stat label="Open reports" value={overview.openFeedback} />
          <Stat label="Translations (7 days)" value={overview.historyLast7Days} />
          <Stat label="Signs recorded" value={overview.signsRecorded} />
        </div>
      )}

      <div className="segmented wrap" role="group" aria-label="Section" style={{ margin: '1.25rem 0' }}>
        {(
          [
            ['reviews', `Verification${overview?.pendingReviews ? ` (${overview.pendingReviews})` : ''}`],
            ['reports', `Reports${overview?.openFeedback ? ` (${overview.openFeedback})` : ''}`],
            ['errors', `Errors${openErrors ? ` (${openErrors})` : ''}`],
            ['users', 'Users'],
            ['team', 'Team'],
            ['news', 'Announcements'],
            ['words', 'Vocabulary'],
            ['stats', 'Analytics'],
            ['pack', 'Sign pack'],
            ['alerts', 'Email alerts'],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'reviews' && <Reviews onChange={loadOverview} />}
      {tab === 'reports' && <Reports onChange={loadOverview} />}
      {tab === 'errors' && <Errors onChange={loadOverview} />}
      {tab === 'users' && <Users />}
      {tab === 'team' && <Team />}
      {tab === 'news' && <AnnouncementsAdmin />}
      {tab === 'words' && <VocabularyAdmin />}
      {tab === 'stats' && <Analytics />}
      {tab === 'pack' && <PackPublisher />}
      {tab === 'alerts' && <EmailAlerts />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card admin-stat" role="listitem">
      <strong>{value.toLocaleString()}</strong>
      <span className="small muted">{label}</span>
    </div>
  );
}

function Reviews({ onChange }: { onChange(): void }) {
  const { backend } = useSession();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [filter, setFilter] = useState<Account['verification'] | 'all'>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    backend.adminListOrganisations().then(setAccounts, (e: unknown) => setError(friendlyError(e)));
  }, [backend]);
  useEffect(load, [load]);

  async function review(account: Account, verification: Account['verification']) {
    setError(null);
    try {
      await backend.adminReview(account.id, verification, notes[account.id] ?? '');
      load();
      onChange();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  const shown = (accounts ?? []).filter((a) => filter === 'all' || a.verification === filter);

  return (
    <section className="stack" aria-label="Verification">
      <label className="field" style={{ maxWidth: 260 }}>
        <span>Show</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="pending">Waiting for review</option>
          <option value="unverified">Not verified</option>
          <option value="verified">Verified</option>
          <option value="all">All</option>
        </select>
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {accounts === null ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="muted">Nothing here.</p>
      ) : (
        <ul className="admin-list">
          {shown.map((account) => (
            <li key={account.id} className="card stack">
              <p style={{ margin: 0 }}>
                <strong>{account.displayName}</strong> <span className="small muted">· {typeLabel(account.type)} · joined {new Date(account.createdAt).toLocaleDateString()}</span>{' '}
                <span className={`status-pill ${account.verification === 'verified' ? '' : 'open'}`}>{account.verification}</span>
              </p>
              <dl className="admin-details">
                {FIELDS[account.type]
                  .filter((f) => account.details[f.key])
                  .map((f) => (
                    <FieldRow key={f.key} label={f.label} value={account.details[f.key] ?? ''} />
                  ))}
              </dl>
              <label className="field">
                <span>Note to the account (optional)</span>
                <input type="text"
                  value={notes[account.id] ?? account.verificationNote ?? ''}
                  maxLength={500}
                  onChange={(e) => setNotes({ ...notes, [account.id]: e.target.value })}
                  placeholder="e.g. Registration number checked with the state register"
                />
              </label>
              <div className="row">
                <button type="button" className="primary small" disabled={account.verification === 'verified'} onClick={() => void review(account, 'verified')}>
                  ✔ Verify
                </button>
                <button type="button" className="small" disabled={account.verification === 'unverified'} onClick={() => void review(account, 'unverified')}>
                  {account.verification === 'verified' ? 'Remove verification' : 'Decline'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Reports({ onChange }: { onChange(): void }) {
  const { backend } = useSession();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    backend.adminListFeedback(status).then(setItems, (e: unknown) => setError(friendlyError(e)));
  }, [backend, status]);
  useEffect(load, [load]);

  async function resolve(item: Feedback, next: 'open' | 'resolved') {
    try {
      await backend.adminResolveFeedback(item.id, next, notes[item.id] ?? item.adminNote ?? '');
      load();
      onChange();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <section className="stack" aria-label="Reports">
      <div className="segmented" role="group" aria-label="Status">
        <button type="button" aria-pressed={status === 'open'} onClick={() => setStatus('open')}>
          Open
        </button>
        <button type="button" aria-pressed={status === 'resolved'} onClick={() => setStatus('resolved')}>
          Resolved
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No {status} reports.</p>
      ) : (
        <ul className="admin-list">
          {items.map((item) => (
            <li key={item.id} className="card stack">
              <p style={{ margin: 0 }}>
                <strong>{FEEDBACK_KINDS.find((k) => k.kind === item.kind)?.label ?? item.kind}</strong>
                {item.gloss && ` · ${item.gloss}`}
                <span className="small muted"> · {new Date(item.createdAt).toLocaleString()}</span>
              </p>
              <p style={{ margin: 0 }}>{item.message}</p>
              <label className="field">
                <span>Reply (the user sees this)</span>
                <input type="text" value={notes[item.id] ?? item.adminNote ?? ''} maxLength={1000} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} />
              </label>
              <div>
                {item.status === 'open' ? (
                  <button type="button" className="primary small" onClick={() => void resolve(item, 'resolved')}>
                    Mark resolved
                  </button>
                ) : (
                  <button type="button" className="small" onClick={() => void resolve(item, 'open')}>
                    Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
