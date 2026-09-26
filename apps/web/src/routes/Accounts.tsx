import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPES, typeLabel } from '../lib/accountTypes.js';
import { friendlyError } from '../lib/backend.js';
import { useSession } from '../state/session.js';

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
                  {account.type !== 'individual' && ` · ${account.verification === 'verified' ? 'Verified' : 'Not yet verified'}`}
                  {isActive && ' · In use'}
                </p>
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
