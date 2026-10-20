import { useState, type FormEvent } from 'react';
import BackButton from '../components/BackButton.js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ACCOUNT_TYPES, validators, type AccountType } from '../lib/accountTypes.js';
import { friendlyError } from '../lib/backend.js';
import { rememberAcceptance } from '../lib/terms.js';
import { useT, type MessageKey } from '../lib/i18n.js';
import { PREFERRED_TYPE_KEY, useSession } from '../state/session.js';
import { asset } from '../lib/base.js';

type Mode = 'signin' | 'signup' | 'reset';

/**
 * Login: first "sign in as" Individual / Hospital / Organisation, then email + password.
 * One login can hold several accounts of any type; the type chosen here decides which
 * account opens (or which one we help you create).
 */
export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { backend, reloadAccounts, switchAccount } = useSession();
  const [type, setType] = useState<AccountType | null>((params.get('type') as AccountType | null) ?? null);
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const { t } = useT();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(params.get('reset') ? 'Choose a new password from the link in your email, then sign in.' : null);
  const device = backend.mode === 'device';

  async function afterAuth(chosen: AccountType) {
    localStorage.setItem(PREFERRED_TYPE_KEY, chosen);
    const accounts = await reloadAccounts();
    const match = accounts.find((a) => a.type === chosen);
    if (match) {
      switchAccount(match.id);
      navigate('/', { replace: true });
    } else {
      navigate(`/accounts/new?type=${chosen}`, { replace: true });
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!type) return;
    setError(null);
    setInfo(null);
    const needsConsent = device || mode === 'signup';
    if (needsConsent && !agreed) return setError(t('login.err.agree'));
    if (!device) {
      const emailProblem = validators.email(email);
      if (emailProblem) return setError(emailProblem);
      if (mode !== 'reset' && password.length < 8) return setError(t('login.err.short'));
      if (mode === 'signup' && password !== confirm) return setError(t('login.err.match'));
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        await backend.resetPassword(email.trim());
        setInfo(t('login.info.reset'));
        setMode('signin');
      } else if (mode === 'signup') {
        const needsConfirmation = await backend.signUp(email.trim(), password, rememberAcceptance());
        if (needsConfirmation) {
          setInfo(t('login.info.confirm'));
          setMode('signin');
        } else {
          await afterAuth(type);
        }
      } else {
        await backend.signIn(email.trim(), password);
        await afterAuth(type);
      }
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="entry">
      <main id="main" tabIndex={-1} className="login">
        <div className="entry-bar">
          <BackButton fallback="/welcome" onBack={type ? () => setType(null) : undefined} />
          <Link className="brand" to="/welcome">
            <img src={asset('icon.svg')} alt="" width={30} height={30} />
            SignSphere
          </Link>
        </div>

        {!type ? (
          <section aria-labelledby="as-heading">
            <h1 id="as-heading">{t('login.signInAs')}</h1>
            <p className="lede">{t('login.choose')}</p>
            <div className="type-cards">
              {ACCOUNT_TYPES.map((option) => (
                <button key={option.type} type="button" className="type-card" onClick={() => setType(option.type)}>
                  <span className="type-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="type-label">{t(`acct.${option.type}` as MessageKey)}</span>
                  <span className="type-desc">{t(`acct.${option.type}.desc` as MessageKey)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="card stack" aria-labelledby="login-heading">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 id="login-heading" style={{ margin: 0 }}>
                {mode === 'signup' ? t('login.create') : mode === 'reset' ? t('login.reset') : t('login.signIn')}
              </h1>
              <button type="button" className="small" onClick={() => setType(null)}>
                {ACCOUNT_TYPES.find((a) => a.type === type)?.icon} {t(`acct.${type}` as MessageKey)} · {t('login.change')}
              </button>
            </div>

            {device ? (
              <p className="notice warn">
                <strong>{t('login.deviceTitle')}</strong>
                {t('login.deviceBody')}
              </p>
            ) : (
              mode !== 'reset' && (
                <div className="segmented" role="group" aria-label="Sign in or create a login">
                  <button type="button" aria-pressed={mode === 'signin'} className={mode === 'signin' ? 'primary' : ''} onClick={() => setMode('signin')}>
                    {t('login.signIn')}
                  </button>
                  <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'primary' : ''} onClick={() => setMode('signup')}>
                    {t('login.createLogin')}
                  </button>
                </div>
              )
            )}

            <form onSubmit={(event) => void submit(event)} noValidate className="stack">
              {!device && (
                <div className="field">
                  <label htmlFor="login-email">{t('login.email')}</label>
                  <input id="login-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              )}
              {!device && mode !== 'reset' && (
                <div className="field">
                  <label htmlFor="login-password">{t('login.password')}</label>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  {mode === 'signup' && <p className="hint">{t('login.min8')}</p>}
                </div>
              )}
              {!device && mode === 'signup' && (
                <div className="field">
                  <label htmlFor="login-confirm">{t('login.confirm')}</label>
                  <input id="login-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </div>
              )}
              {(device || mode === 'signup') && (
                <label className="check">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
                  <span>
                    {t('login.agree1')}{' '}
                    <Link to="/terms" target="_blank">
                      {t('login.terms')}
                    </Link>{' '}
                    {t('login.and')}{' '}
                    <Link to="/privacy" target="_blank">
                      {t('login.privacy')}
                    </Link>
                    .
                  </span>
                </label>
              )}
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              {info && (
                <p className="notice" role="status">
                  {info}
                </p>
              )}
              <button type="submit" className="primary" disabled={busy}>
                {busy ? t('login.wait') : device ? t('login.continueDevice') : mode === 'signup' ? t('login.createLogin') : mode === 'reset' ? t('login.sendReset') : t('login.signIn')}
              </button>
            </form>

            {!device && (
              <p className="small">
                {mode === 'reset' ? (
                  <button type="button" className="linklike" onClick={() => setMode('signin')}>
                    {t('login.backToSignIn')}
                  </button>
                ) : (
                  <button type="button" className="linklike" onClick={() => setMode('reset')}>
                    {t('login.forgot')}
                  </button>
                )}
              </p>
            )}
            {mode === 'signin' && !device && (
              <p className="hint">
                {t('login.byIn')} <Link to="/terms">{t('login.terms')}</Link> {t('login.and')} <Link to="/privacy">{t('login.privacy')}</Link>.
              </p>
            )}
          </section>
        )}

        <p className="small muted">
          <Link to="/emergency">{t('login.emergencyCards')}</Link> {t('login.noLogin')}
        </p>
      </main>
    </div>
  );
}
