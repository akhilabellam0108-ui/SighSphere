import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPES, typeLabel } from './lib/accountTypes.js';
import { ensureBundledPack } from './lib/packInstaller.js';
import { useSession } from './state/session.js';
import { asset } from './lib/base.js';
import BackButton, { useNativeBackButton } from './components/BackButton.js';

// Screens load on demand so the first screen appears quickly on slow connections.
const AccountForm = lazy(() => import('./routes/AccountForm.js'));
const Accounts = lazy(() => import('./routes/Accounts.js'));
const DatasetImport = lazy(() => import('./routes/DatasetImport.js'));
const Emergency = lazy(() => import('./routes/Emergency.js'));
const Feedback = lazy(() => import('./routes/Feedback.js'));
const Admin = lazy(() => import('./routes/Admin.js'));
const History = lazy(() => import('./routes/History.js'));
const Home = lazy(() => import('./routes/Home.js'));
const Learn = lazy(() => import('./routes/Learn.js'));
const Login = lazy(() => import('./routes/Login.js'));
const NotFound = lazy(() => import('./routes/NotFound.js'));
const Privacy = lazy(() => import('./routes/Privacy.js'));
const Recorder = lazy(() => import('./routes/Recorder.js'));
const SettingsPage = lazy(() => import('./routes/Settings.js'));
const SignToText = lazy(() => import('./routes/SignToText.js'));
const TextToSign = lazy(() => import('./routes/TextToSign.js'));
const Welcome = lazy(() => import('./routes/Welcome.js'));

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/text-to-sign', label: 'Text → Sign', icon: '⌨' },
  { to: '/voice-to-sign', label: 'Voice → Sign', icon: '🎤' },
  { to: '/sign-to-text', label: 'Sign → Text', icon: '👁' },
  { to: '/sign-to-voice', label: 'Sign → Voice', icon: '🔊' },
  { to: '/record', label: 'Record', icon: '⏺' },
  { to: '/learn', label: 'Learn', icon: '★' },
  { to: '/history', label: 'History', icon: '🕘' },
  { to: '/emergency', label: 'Emergency', icon: '✚' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const;

/** Top-bar account switcher: current account, others, add, manage, sign out. */
function AccountMenu() {
  const { user, accounts, active, switchAccount, signOut, backend } = useSession();
  const navigate = useNavigate();
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [location.pathname, active?.id]);
  if (!user) {
    return (
      <Link className="btn small" to="/login">
        Sign in
      </Link>
    );
  }
  const icon = (type: string) => ACCOUNT_TYPES.find((t) => t.type === type)?.icon ?? '';
  return (
    <details className="account-menu" ref={ref}>
      <summary aria-label={`Account: ${active?.displayName ?? 'none'}. Open account menu`}>
        <span aria-hidden="true">{active ? icon(active.type) : '👤'}</span>
        <span className="account-menu-name">{active?.displayName ?? 'Choose account'}</span>
        <span className="small muted account-menu-type">{active ? typeLabel(active.type) : ''}</span>
      </summary>
      <div className="account-menu-panel">
        <p className="small muted" style={{ margin: '0 0 0.4rem' }}>
          {backend.mode === 'cloud' ? user.email : 'This-device mode'}
        </p>
        <ul>
          {accounts.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                className={account.id === active?.id ? 'primary' : ''}
                aria-current={account.id === active?.id ? 'true' : undefined}
                onClick={() => switchAccount(account.id)}
              >
                <span aria-hidden="true">{icon(account.type)}</span> {account.displayName}
                <span className="small"> · {typeLabel(account.type)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="account-menu-actions">
          <Link className="btn small" to="/accounts/new">
            + Add account
          </Link>
          <Link className="btn small" to="/accounts">
            Manage
          </Link>
          <button type="button" className="small" onClick={() => void signOut().then(() => navigate('/welcome', { replace: true }))}>
            Sign out
          </button>
        </div>
      </div>
    </details>
  );
}

/** Screens behind a login with at least one account. */
function RequireAccount() {
  const { loading, user, accounts, active } = useSession();
  const location = useLocation();
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/welcome" replace state={{ from: location.pathname }} />;
  if (accounts.length === 0 || !active) {
    const preferred = localStorage.getItem('signsphere.login-type.v1');
    return <Navigate to={`/accounts/new${preferred ? `?type=${preferred}` : ''}`} replace />;
  }
  return <Outlet />;
}

/** Screens that need a login but not yet an account (creating the first one). */
function RequireLogin() {
  const { loading, user } = useSession();
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

/** Installs the bundled ISL sign pack in the background, once per version. */
function BundledPack() {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void ensureBundledPack((done, total) => {
      if (!cancelled && done % 25 === 0) setStatus(`Installing ISL signs… ${Math.round((done / total) * 100)}%`);
    }).then((result) => {
      if (cancelled) return;
      setStatus(result === 'installed' || result === 'updated' ? 'ISL signs installed — recognition and the avatar are ready.' : null);
      if (result === 'installed' || result === 'updated') window.setTimeout(() => !cancelled && setStatus(null), 6000);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!status) return null;
  return (
    <p className="pack-status" role="status">
      {status}
    </p>
  );
}

/** Always visible in the phone's bottom bar; everything else is under "More". */
const PRIMARY = new Set(['/', '/text-to-sign', '/sign-to-text', '/record']);

function Shell() {
  const { isAdmin } = useSession();
  const nav = isAdmin ? [...NAV, { to: '/admin', label: 'Admin', icon: '🛡' } as const] : NAV;
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMoreOpen(false), [location.pathname]);
  return (
    <div className="app">
      <header className="topbar">
        {location.pathname !== '/' && <BackButton />}
        <Link className="brand" to="/">
          <img src={asset('icon.svg')} alt="" width={30} height={30} />
          SignSphere
        </Link>
        <AccountMenu />
      </header>

      <nav className={`nav${moreOpen ? ' open' : ''}`} aria-label="Main">
        {nav.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} data-primary={PRIMARY.has(item.to) ? '' : undefined}>
            {/* aria-hidden: the icon is decorative, the label is the accessible name */}
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className="nav-more" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
          <span className="nav-icon" aria-hidden="true">
            {moreOpen ? '✕' : '☰'}
          </span>
          <span>{moreOpen ? 'Close' : 'More'}</span>
        </button>
      </nav>

      <main id="main" tabIndex={-1}>
        <BundledPack />
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>

      {/*
        Scope limits stated in the product, not just in the report. A user in a hospital
        waiting room needs to know this before they rely on it, and PLAN.md §10 commits us
        to saying it here.
      */}
      <footer className="disclaimer">
        SignSphere is a learning and communication aid, not a replacement for a qualified ISL
        interpreter. Do not rely on it for medical, legal, or emergency interpretation. Sign
        recognition covers a limited vocabulary and makes mistakes. <Link to="/privacy">Privacy</Link> ·{' '}
        <Link to="/feedback">Report a problem</Link>
      </footer>
    </div>
  );
}

/** The first screens: Android's back button leaves the app from here. */
const ROOT_PATHS = ['/', '/welcome'] as const;

export default function App() {
  const location = useLocation();
  useNativeBackButton(ROOT_PATHS, location.pathname);
  return (
    <Routes>
      <Route path="/welcome" element={<Suspense fallback={null}><Welcome /></Suspense>} />
      <Route path="/login" element={<Suspense fallback={null}><Login /></Suspense>} />

      <Route element={<Shell />}>
        {/* No login needed: nobody should have to sign in during an emergency. */}
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/privacy" element={<Privacy />} />

        <Route element={<RequireLogin />}>
          <Route path="/accounts/new" element={<AccountForm />} />
        </Route>

        <Route element={<RequireAccount />}>
          <Route path="/" element={<Home />} />
          <Route path="/text-to-sign" element={<TextToSign mode="text" />} />
          <Route path="/voice-to-sign" element={<TextToSign mode="voice" />} />
          <Route path="/sign-to-text" element={<SignToText speakOutput={false} />} />
          <Route path="/sign-to-voice" element={<SignToText speakOutput />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/history" element={<History />} />
          <Route path="/record" element={<Recorder />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/dataset" element={<DatasetImport />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/:id" element={<AccountForm />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
