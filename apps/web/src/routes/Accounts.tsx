import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPES, typeLabel } from '../lib/accountTypes.js';
import { friendlyError } from '../lib/backend.js';
import { useSession } from '../state/session.js';
import Verification from '../components/Verification.js';

/** Manage every account under this login: switch, add, edit, delete; delete the login. */
export default function Accounts() {
  const navigate = useNavigate();
  const { user, accounts, active, switchAccount, backend, signOut, deleteLogin } = useSession();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <h1>Accounts</h1>
      <p className="lede">
        {backend.mode === 'cloud' ? `Signed in as ${user?.email ?? ''}. ` : 'This-device mode. '}
        One login can hold up to 10 accounts. History is kept separately for each.
      </p>

      <ul className="account-list">
        {accounts.map((account) => {
          const icon = ACCOUNT_TYPES.find((t) => t.type === account.type)?.icon;
          const isActive = account.id === active?.id;
          return (
            <li key={account.id} className={`card account-item${isActive ? ' active' : ''}`}>
              <span className="type-icon" aria-hidden="true">
                {icon}
              </span>
              <div className="account-main">
                <p className="account-name">{account.displayName}</p>
                <p className="small muted">
                  {typeLabel(account.type)}
                  {isActive && ' · In use'}
                </p>
                <Verification account={account} />
              </div>
              <div className="row">
                {!isActive && (
                  <button type="button" className="primary small" onClick={() => switchAccount(account.id)}>
                    Use this account
                  </button>
                )}
                <Link className="btn small" to={`/accounts/${account.id}`} aria-label={`Edit ${account.displayName}`}>
                  Edit
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="row" style={{ marginTop: '1rem' }}>
        <Link className="btn primary" to="/accounts/new">
          + Add account
        </Link>
        <button type="button" onClick={() => void signOut().then(() => navigate('/welcome', { replace: true }))}>
          Sign out
        </button>
      </div>

      {backend.mode === 'cloud' && <ChangePassword />}

      <section className="card stack" style={{ marginTop: '2rem' }} aria-labelledby="danger-heading">
        <h2 id="danger-heading">Delete login</h2>
        <p className="small" style={{ margin: 0 }}>
          Permanently deletes your login, every account under it, and all their history
          {backend.mode === 'cloud' ? ' from the server' : ' from this browser'}. Sign recordings on this device are not affected — clear
          those in Settings.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (!confirm('Delete your login, all accounts and all history? This cannot be undone.')) return;
              deleteLogin()
                .then(() => navigate('/welcome', { replace: true }))
                .catch((cause: unknown) => setError(friendlyError(cause)));
            }}
          >
            Delete my login and data
          </button>
        </div>
      </section>
    </>
  );
}

function ChangePassword() {
  const { backend } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card stack"
      style={{ marginTop: '2rem' }}
      aria-labelledby="password-heading"
      onSubmit={(event) => {
        event.preventDefault();
        if (next.length < 8) {
          setStatus({ ok: false, text: 'Use a password of at least 8 characters.' });
          return;
        }
        setBusy(true);
        backend
          .changePassword(current, next)
          .then(() => {
            setStatus({ ok: true, text: 'Password changed.' });
            setCurrent('');
            setNext('');
          })
          .catch((e: unknown) => setStatus({ ok: false, text: friendlyError(e) }))
          .finally(() => setBusy(false));
      }}
    >
      <h2 id="password-heading">Change password</h2>
      <div className="form-grid">
        <label className="field">
          <span>Current password</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span>New password</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
        </label>
      </div>
      {status && (
        <p className={`notice ${status.ok ? '' : 'error'}`} role={status.ok ? 'status' : 'alert'}>
          {status.text}
        </p>
      )}
      <div>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
