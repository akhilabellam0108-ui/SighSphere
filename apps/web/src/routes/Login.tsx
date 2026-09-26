import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ACCOUNT_TYPES, validators, type AccountType } from '../lib/accountTypes.js';
import { friendlyError } from '../lib/backend.js';
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
    if (!device) {
      const emailProblem = validators.email(email);
      if (emailProblem) return setError(emailProblem);
      if (mode !== 'reset' && password.length < 8) return setError('Use a password of at least 8 characters.');
      if (mode === 'signup' && password !== confirm) return setError('The two passwords do not match.');
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        await backend.resetPassword(email.trim());
        setInfo('If that email has a login, a reset link is on its way.');
        setMode('signin');
      } else if (mode === 'signup') {
        const needsConfirmation = await backend.signUp(email.trim(), password);
        if (needsConfirmation) {
          setInfo('Check your email and open the confirmation link, then sign in here.');
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
        <Link className="brand" to="/welcome">
          <img src={asset('icon.svg')} alt="" width={30} height={30} />
          SignSphere
        </Link>

        {!type ? (
          <section aria-labelledby="as-heading">
            <h1 id="as-heading">Sign in as</h1>
            <p className="lede">Choose who is using SignSphere. You can add more accounts later.</p>
            <div className="type-cards">
              {ACCOUNT_TYPES.map((option) => (
                <button key={option.type} type="button" className="type-card" onClick={() => setType(option.type)}>
                  <span className="type-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="type-label">{option.label}</span>
                  <span className="type-desc">{option.description}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="card stack" aria-labelledby="login-heading">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1 id="login-heading" style={{ margin: 0 }}>
                {mode === 'signup' ? 'Create your login' : mode === 'reset' ? 'Reset password' : 'Sign in'}
              </h1>
              <button type="button" className="small" onClick={() => setType(null)}>
                {ACCOUNT_TYPES.find((t) => t.type === type)?.icon} {ACCOUNT_TYPES.find((t) => t.type === type)?.label} · change
              </button>
            </div>

            {device ? (
              <p className="notice warn">
                <strong>This-device mode</strong>
                The server is not connected yet, so there is no password: your accounts and history
                stay in this browser only. Anyone using this device can open them.
              </p>
            ) : (
              mode !== 'reset' && (
                <div className="segmented" role="group" aria-label="Sign in or create a login">
                  <button type="button" aria-pressed={mode === 'signin'} className={mode === 'signin' ? 'primary' : ''} onClick={() => setMode('signin')}>
                    Sign in
                  </button>
                  <button type="button" aria-pressed={mode === 'signup'} className={mode === 'signup' ? 'primary' : ''} onClick={() => setMode('signup')}>
                    Create login
                  </button>
                </div>
              )
            )}

            <form onSubmit={(event) => void submit(event)} noValidate className="stack">
              {!device && (
                <div className="field">
                  <label htmlFor="login-email">Email</label>
                  <input id="login-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              )}
              {!device && mode !== 'reset' && (
                <div className="field">
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  {mode === 'signup' && <p className="hint">At least 8 characters.</p>}
                </div>
              )}
              {!device && mode === 'signup' && (
                <div className="field">
                  <label htmlFor="login-confirm">Confirm password</label>
                  <input id="login-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </div>
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
                {busy ? 'Please wait…' : device ? 'Continue on this device' : mode === 'signup' ? 'Create login' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
              </button>
            </form>

            {!device && (
              <p className="small">
                {mode === 'reset' ? (
                  <button type="button" className="linklike" onClick={() => setMode('signin')}>
                    Back to sign in
                  </button>
                ) : (
                  <button type="button" className="linklike" onClick={() => setMode('reset')}>
                    Forgot password?
                  </button>
                )}
              </p>
            )}
            <p className="hint">
              By continuing you agree to how SignSphere handles your data — see the <Link to="/privacy">privacy notice</Link>.
            </p>
          </section>
        )}

        <p className="small muted">
          <Link to="/emergency">Emergency cards</Link> work without a login.
        </p>
      </main>
    </div>
  );
}
