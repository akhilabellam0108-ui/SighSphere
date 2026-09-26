import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { SessionProvider } from './state/session.js';
import { SettingsProvider } from './state/settings.js';
import './styles.css';
import { BASE, asset } from './lib/base.js';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found in index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename={BASE.replace(/\/$/, '') || '/'}>
      <SettingsProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Offline support (production only — the dev server serves unbundled modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(asset('sw.js'), { scope: BASE }).catch(() => {
      /* offline support is a bonus; the app works without it */
    });
  });
}
