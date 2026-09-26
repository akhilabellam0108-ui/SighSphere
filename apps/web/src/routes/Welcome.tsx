import { Link } from 'react-router-dom';
import { useSession } from '../state/session.js';
import { asset } from '../lib/base.js';
import { lazy, Suspense } from 'react';

const ShareApp = lazy(() => import('../components/ShareApp.js'));

/** First screen: what SignSphere is, then on to login. */
export default function Welcome() {
  const { backend, user, active } = useSession();
  return (
    <div className="entry">
      <main id="main" tabIndex={-1} className="welcome">
        <img src={asset('icon.svg')} alt="" width={96} height={96} className="welcome-logo" />
        <h1>SignSphere</h1>
        <p className="welcome-tagline">Communication without barriers, in Indian Sign Language.</p>

        <ul className="welcome-points">
          <li>
            <span aria-hidden="true">🤟</span> Sign to the camera and see it as text or speech.
          </li>
          <li>
            <span aria-hidden="true">🧑</span> Type or speak, and a 3D signer shows it in ISL.
          </li>
          <li>
            <span aria-hidden="true">🏥</span> For individuals, hospitals and organisations.
          </li>
          <li>
            <span aria-hidden="true">🔒</span> Your camera is processed on your device — video is never uploaded.
          </li>
        </ul>

        <div className="welcome-actions">
          {user && active ? (
            <Link className="btn primary" to="/">
              Continue as {active.displayName}
            </Link>
          ) : (
            <>
              <Link className="btn primary" to="/login?mode=signup">
                Get started
              </Link>
              <Link className="btn" to="/login">
                I already have a login
              </Link>
            </>
          )}
        </div>

        <p className="small muted">
          In an emergency? <Link to="/emergency">Open emergency cards</Link> — no login needed.
        </p>
        <details className="welcome-share">
          <summary>Open on another device (QR code)</summary>
          <Suspense fallback={null}>
            <ShareApp />
          </Suspense>
        </details>
        {backend.mode === 'device' && (
          <p className="notice warn small" style={{ textAlign: 'left' }}>
            <strong>Running in this-device mode</strong>
            Accounts and history are saved only in this browser until the server is connected.
          </p>
        )}
      </main>
    </div>
  );
}
