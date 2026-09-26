/** "Open on another device": a QR code and link for this app's public address. */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { appUrl } from '../lib/base.js';

/** The hosted app. On localhost the page's own address would be useless to a phone. */
const PUBLIC_URL: string = import.meta.env['VITE_PUBLIC_URL'] || 'https://akhilabellam0108-ui.github.io/SighSphere/';

function shareUrl(): string {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) || window.location.hostname.endsWith('.local');
  return local ? PUBLIC_URL : appUrl('');
}

export default function ShareApp() {
  const url = shareUrl();
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1d2b29', light: '#ffffff' } }).then((out) => {
      if (live) setSvg(out);
    });
    return () => {
      live = false;
    };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is visible to copy by hand */
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'SignSphere', text: 'Indian Sign Language, on any device', url });
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="share-app">
      <div className="share-qr" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="stack">
        <p className="small" style={{ margin: 0 }}>
          Scan with a phone or tablet camera to open SignSphere there. It installs like an app (“Add to Home screen”) and
          works offline after the first visit.
        </p>
        <p style={{ margin: 0, wordBreak: 'break-all' }}>
          <a href={url}>{url}</a>
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {typeof navigator.share === 'function' && (
            <button type="button" className="btn" onClick={() => void share()}>
              Share…
            </button>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Each device keeps its own sign data. Accounts and history follow your login once the cloud server is connected.
        </p>
      </div>
    </div>
  );
}
