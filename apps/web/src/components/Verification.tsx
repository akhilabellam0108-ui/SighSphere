/** Verification status of a hospital / organisation, with "Request verification". */
import { useState } from 'react';
import { friendlyError, type Account } from '../lib/backend.js';
import { useSession } from '../state/session.js';

const LABEL: Record<Account['verification'], string> = {
  unverified: 'Not verified',
  pending: 'Verification requested — the SignSphere team is checking',
  verified: 'Verified by SignSphere',
};

export default function Verification({ account }: { account: Account }) {
  const { backend, reloadAccounts } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        {LABEL[account.verification]}
      </p>
      {account.verificationNote && (
        <p className="small muted" style={{ margin: 0 }}>
          Note from SignSphere: {account.verificationNote}
        </p>
      )}
      {account.verification === 'unverified' && backend.mode === 'cloud' && (
        <div>
          <button type="button" className="small" disabled={busy} onClick={() => void request()}>
            {busy ? 'Sending…' : 'Request verification'}
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
