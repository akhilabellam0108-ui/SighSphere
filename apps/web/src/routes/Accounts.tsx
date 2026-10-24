import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPES } from '../lib/accountTypes.js';
import { friendlyError } from '../lib/backend.js';
import { useSession } from '../state/session.js';
import Verification from '../components/Verification.js';
import { useT, type MessageKey } from '../lib/i18n.js';

/** Manage every account under this login: switch, add, edit, delete; delete the login. */
export default function Accounts() {
  const navigate = useNavigate();
  const { user, accounts, active, switchAccount, backend, signOut, deleteLogin } = useSession();
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();

  return (
    <>
      <h1>{t('accts.title')}</h1>
      <p className="lede">
        {backend.mode === 'cloud' ? t('accts.signedIn', { email: user?.email ?? '' }) : t('accts.deviceMode')} {t('accts.limit')}
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
                  {t(`acct.${account.type}` as MessageKey)}
                  {isActive && ` · ${t('accts.inUse')}`}
                </p>
                <Verification account={account} />
              </div>
              <div className="row">
                {!isActive && (
                  <button type="button" className="primary small" onClick={() => switchAccount(account.id)}>
                    {t('accts.use')}
                  </button>
                )}
                <Link className="btn small" to={`/accounts/${account.id}`} aria-label={t('accts.editLabel', { name: account.displayName })}>
                  {t('accts.edit')}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="row" style={{ marginTop: '1rem' }}>
        <Link className="btn primary" to="/accounts/new">
          {t('accts.add')}
        </Link>
        <button type="button" onClick={() => void signOut().then(() => navigate('/welcome', { replace: true }))}>
          {t('accts.signOut')}
        </button>
      </div>

      {backend.mode === 'cloud' && <ChangePassword />}

      <section className="card stack" style={{ marginTop: '2rem' }} aria-labelledby="danger-heading">
        <h2 id="danger-heading">{t('accts.deleteTitle')}</h2>
        <p className="small" style={{ margin: 0 }}>
          {t(backend.mode === 'cloud' ? 'accts.deleteBodyCloud' : 'accts.deleteBodyDevice')}
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
              if (!confirm(t('accts.deleteConfirm'))) return;
              deleteLogin()
                .then(() => navigate('/welcome', { replace: true }))
                .catch((cause: unknown) => setError(friendlyError(cause)));
            }}
          >
            {t('accts.deleteBtn')}
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
  const { t } = useT();
  return (
    <form
      className="card stack"
      style={{ marginTop: '2rem' }}
      aria-labelledby="password-heading"
      onSubmit={(event) => {
        event.preventDefault();
        if (next.length < 8) {
          setStatus({ ok: false, text: t('pw.short') });
          return;
        }
        setBusy(true);
        backend
          .changePassword(current, next)
          .then(() => {
            setStatus({ ok: true, text: t('pw.done') });
            setCurrent('');
            setNext('');
          })
          .catch((e: unknown) => setStatus({ ok: false, text: friendlyError(e) }))
          .finally(() => setBusy(false));
      }}
    >
      <h2 id="password-heading">{t('pw.title')}</h2>
      <div className="form-grid">
        <label className="field">
          <span>{t('pw.current')}</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span>{t('pw.new')}</span>
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
          {busy ? t('pw.saving') : t('pw.title')}
        </button>
      </div>
    </form>
  );
}
