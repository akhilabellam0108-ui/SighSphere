import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../../components/domain/index.js';
import { Button, Icon } from '../../components/ui/index.js';
import { useAuth } from '../../state/auth.js';

/**
 * Splash / welcome. No auto-advance timer: a screen that moves on by itself fails people
 * who read slowly or use a screen reader (WCAG 2.2.1).
 */
export default function Splash() {
  const navigate = useNavigate();
  const { session, onboarded, continueAsGuest } = useAuth();

  return (
    <div className="entry splash entry-hero">
      <main id="main" tabIndex={-1} className="splash-inner">
        <div className="splash-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <BrandMark className="splash-logo" />
        <h1>
          Sign<span className="splash-accent">Sphere</span>
        </h1>
        <p className="splash-tagline">Communication Without Barriers</p>
        <p className="splash-sub">
          Learn and communicate in Indian Sign Language — with camera recognition that runs entirely
          on your device.
        </p>

        <div className="splash-actions">
          {session ? (
            <Button variant="white" size="lg" block iconRight="arrow-right" to="/home">
              Continue as {session.kind === 'guest' ? 'guest' : session.name}
            </Button>
          ) : (
            <>
              <Button
                variant="white"
                size="lg"
                block
                iconRight="arrow-right"
                onClick={() => navigate(onboarded ? '/auth' : '/onboarding')}
              >
                Get Started
              </Button>
              <Button
                variant="on-dark"
                size="lg"
                block
                onClick={() => {
                  continueAsGuest();
                  navigate('/home');
                }}
              >
                Continue as Guest
              </Button>
            </>
          )}
        </div>

        <ul className="splash-points">
          <li>
            <Icon name="lock" /> Camera never leaves your device
          </li>
          <li>
            <Icon name="wifi-off" /> Works offline
          </li>
          <li>
            <Icon name="sos" /> Emergency help, always free
          </li>
        </ul>

        <Button variant="on-dark" size="sm" to="/emergency" icon="sos">
          Emergency help now
        </Button>
      </main>
    </div>
  );
}
