/** Verification status of a hospital / organisation, with "Request verification". */
import { useState } from 'react';
import { friendlyError, type Account } from '../lib/backend.js';
import { useSession } from '../state/session.js';
import { useT, type MessageKey } from '../lib/i18n.js';

const LABEL: Record<Account['verification'], MessageKey> = {
  unverified: 'ver.unverified',
  pending: 'ver.pending',
  verified: 'ver.verified',
};

export default function Verification({ account }: { account: Account }) {
  const { backend, reloadAccounts } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useT();
  if (account.type === 'individual') return null;

  async function request() {
    setBusy(true);
    setError(null);
    try {
      await backend.requestVerification(account.id);
      await reloadAccounts();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="verification stack">
      <p className={`small verification-status ${account.verification}`} style={{ margin: 0 }}>
        <span aria-hidden="true">{account.verification === 'verified' ? '✔ ' : account.verification === 'pending' ? '⏳ ' : '○ '}</span>
        {t(LABEL[account.verification])}
      </p>
      {account.verificationNote && (
        <p className="small muted" style={{ margin: 0 }}>
          {t('ver.note', { note: account.verificationNote })}
        </p>
      )}
      {account.verification === 'unverified' && backend.mode === 'cloud' && (
        <div>
          <button type="button" className="small" disabled={busy} onClick={() => void request()}>
            {busy ? t('ver.sending') : t('ver.request')}
          </button>
        </div>
      )}
      {error && (
        <p className="notice error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
