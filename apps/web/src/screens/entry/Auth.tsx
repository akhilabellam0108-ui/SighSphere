import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Brand } from '../../components/domain/index.js';
import { Button, Icon, Notice, Tabs, TabPanel, TextField } from '../../components/ui/index.js';
import { useReturnTo } from '../../app/guards.js';
import { validateDemoProfile, type DemoProfileErrors } from '../../lib/auth.js';
import { useAuth } from '../../state/auth.js';

type Mode = 'signin' | 'signup';

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * Login / Signup. Placeholder auth (lib/auth.ts): no server, no passwords. The screen says
 * so up front, and the Google button explains it is not connected instead of pretending.
 */
export default function Auth() {
  const navigate = useNavigate();
  const returnTo = useReturnTo('/home');
  const { continueAsGuest, signInDemo } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() => (params.get('mode') === 'signup' ? 'signup' : 'signin'));
  const [showEmail, setShowEmail] = useState(false);
  const [googleNote, setGoogleNote] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<DemoProfileErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = validateDemoProfile({ name, email }, mode === 'signup');
    setErrors(next);
    if (next.name || next.email) {
      // Move focus to the first invalid field so the error is announced.
      window.setTimeout(() => {
        document.getElementById(next.name ? 'auth-name' : 'auth-email')?.focus();
      }, 0);
      return;
    }
    setSubmitting(true);
    signInDemo({ name, email });
    navigate(returnTo, { replace: true });
  }

  return (
    <div className="entry">
      <main id="main" tabIndex={-1} className="auth">
        <div className="onboarding-top">
          <Brand to="/welcome" />
          <Button variant="ghost" size="sm" to="/emergency" icon="sos">
            Emergency
          </Button>
        </div>

        <div className="card auth-card">
          <h1 tabIndex={-1}>{mode === 'signin' ? 'Welcome back' : 'Create your profile'}</h1>
          <p className="muted">
            {mode === 'signin'
              ? 'Sign in to keep your progress, saved translations and settings together.'
              : 'Set up a profile for your learning progress and saved conversations.'}
          </p>

          <Notice tone="warn" title="Accounts are not connected yet">
            This is a preview of sign-in. There is no server: a profile is just a name and email
            saved on this device, and no password is ever asked for. Real accounts come later.
          </Notice>

          <Tabs<Mode>
            label="Sign in or sign up"
            idPrefix="auth"
            value={mode}
            onChange={(next) => {
              setMode(next);
              setErrors({});
            }}
            items={[
              { id: 'signin', label: 'Sign in' },
              { id: 'signup', label: 'Sign up' },
            ]}
          />

          <TabPanel idPrefix="auth" activeId={mode}>
            <div className="stack">
              <Button
                variant="secondary"
                size="lg"
                block
                aria-describedby={googleNote ? 'google-note' : undefined}
                onClick={() => setGoogleNote(true)}
              >
                <GoogleMark />
                Continue with Google
              </Button>
              {googleNote && (
                <p id="google-note" className="notice" role="status">
                  Google sign-in is not connected yet. Use email or continue as a guest for now.
                </p>
              )}

              {!showEmail ? (
                <Button variant="secondary" size="lg" block icon="mail" onClick={() => setShowEmail(true)}>
                  Continue with Email
                </Button>
              ) : (
                <form onSubmit={submit} noValidate className="stack-sm" aria-label="Email profile">
                  {mode === 'signup' && (
                    <TextField
                      id="auth-name"
                      label="Your name"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      error={errors.name}
                      required
                    />
                  )}
                  <TextField
                    id="auth-email"
                    type="email"
                    label="Email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    error={errors.email}
                    hint="Only shown on your profile. Never verified, never sent anywhere."
                    required
                  />
                  <Button type="submit" variant="gradient" size="lg" block loading={submitting} iconRight="arrow-right">
                    {mode === 'signin' ? 'Sign in (demo)' : 'Create demo profile'}
                  </Button>
                </form>
              )}

              <p className="divider-text">or</p>

              <Button
                variant="ghost"
                size="lg"
                block
                icon="profile"
                onClick={() => {
                  continueAsGuest();
                  navigate(returnTo, { replace: true });
                }}
              >
                Continue as Guest
              </Button>
            </div>
          </TabPanel>
        </div>

        <p className="small muted center" style={{ marginTop: '1rem' }}>
          <Icon name="lock" /> Your camera is processed on this device. Nothing is uploaded.{' '}
          <Link to="/welcome">Back</Link>
        </p>
      </main>
    </div>
  );
}
