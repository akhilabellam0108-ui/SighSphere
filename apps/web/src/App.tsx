import { NavLink, Route, Routes } from 'react-router-dom';
import Emergency from './routes/Emergency.js';
import Home from './routes/Home.js';
import Learn from './routes/Learn.js';
import NotFound from './routes/NotFound.js';
import Recorder from './routes/Recorder.js';
import SettingsPage from './routes/Settings.js';
import SignToText from './routes/SignToText.js';
import TextToSign from './routes/TextToSign.js';

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/text-to-sign', label: 'Text → Sign', icon: '⌨' },
  { to: '/voice-to-sign', label: 'Voice → Sign', icon: '🎤' },
  { to: '/sign-to-text', label: 'Sign → Text', icon: '👁' },
  { to: '/sign-to-voice', label: 'Sign → Voice', icon: '🔊' },
  { to: '/learn', label: 'Learn', icon: '★' },
  { to: '/emergency', label: 'Emergency', icon: '✚' },
  { to: '/record', label: 'Record', icon: '⏺' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/">
          <img src="/icon.svg" alt="" width={30} height={30} />
          SignSphere
        </a>
        <span className="small muted">Indian Sign Language</span>
      </header>

      <nav className="nav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}>
            {/* aria-hidden: the icon is decorative, the label is the accessible name */}
            <span className="nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/text-to-sign" element={<TextToSign mode="text" />} />
          <Route path="/voice-to-sign" element={<TextToSign mode="voice" />} />
          <Route path="/sign-to-text" element={<SignToText speakOutput={false} />} />
          <Route path="/sign-to-voice" element={<SignToText speakOutput />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/record" element={<Recorder />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {/*
        Scope limits stated in the product, not just in the report. A user in a hospital
        waiting room needs to know this before they rely on it, and PLAN.md §10 commits us
        to saying it here.
      */}
      <footer className="disclaimer">
        SignSphere is a learning and communication aid, not a replacement for a qualified ISL
        interpreter. Do not rely on it for medical, legal, or emergency interpretation. Sign
        recognition covers a limited vocabulary and makes mistakes.
      </footer>
    </div>
  );
}
