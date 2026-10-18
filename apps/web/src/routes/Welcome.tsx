import { Link } from 'react-router-dom';
import { useSession } from '../state/session.js';
import { asset } from '../lib/base.js';
import { lazy, Suspense } from 'react';
import LanguagePicker from '../components/LanguagePicker.js';
import { useT } from '../lib/i18n.js';

const ShareApp = lazy(() => import('../components/ShareApp.js'));

/** First screen: what SignSphere is, then on to login. */
export default function Welcome() {
  const { backend, user, active } = useSession();
  const { t } = useT();
  return (
    <div className="entry">
      <main id="main" tabIndex={-1} className="welcome">
        <img src={asset('icon.svg')} alt="" width={96} height={96} className="welcome-logo" />
        <h1>SignSphere</h1>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <LanguagePicker compact />
        </div>
        <p className="welcome-tagline">{t('welcome.tagline')}</p>

        <ul className="welcome-points">
          <li>
            <span aria-hidden="true">🤟</span> {t('welcome.p1')}
          </li>
          <li>
            <span aria-hidden="true">🧑</span> {t('welcome.p2')}
          </li>
          <li>
            <span aria-hidden="true">🏥</span> {t('welcome.p3')}
          </li>
          <li>
            <span aria-hidden="true">🔒</span> {t('welcome.p4')}
          </li>
        </ul>

        <div className="welcome-actions">
          {user && active ? (
            <Link className="btn primary" to="/">
              {t('welcome.continueAs', { name: active.displayName })}
            </Link>
          ) : (
            <>
              <Link className="btn primary" to="/login?mode=signup">
                {t('welcome.start')}
              </Link>
              <Link className="btn" to="/login">
                {t('welcome.haveLogin')}
              </Link>
            </>
          )}
        </div>

        <p className="small muted">
          {t('welcome.emergency')} <Link to="/emergency">{t('welcome.emergencyLink')}</Link> {t('welcome.noLogin')}
        </p>
        <details className="welcome-share">
          <summary>{t('welcome.qr')}</summary>
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
        <p className="small muted">
          <Link to="/terms">{t('welcome.terms')}</Link> · <Link to="/privacy">{t('footer.privacy')}</Link>
        </p>
      </main>
    </div>
  );
}
