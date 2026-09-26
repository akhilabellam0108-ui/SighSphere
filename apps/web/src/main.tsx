import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { ServiceWorkerNotices } from './components/domain/ServiceWorkerNotices.js';
import { registerServiceWorker } from './lib/sw-register.js';
import { AuthProvider } from './state/auth.js';
import { SettingsProvider } from './state/settings.js';
import { ToastProvider } from './state/toast.js';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found in index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
            <ServiceWorkerNotices />
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorker();
