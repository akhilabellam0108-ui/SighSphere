import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { friendlyError, type Feedback as FeedbackItem, type FeedbackKind } from '../lib/backend.js';
import { useSession } from '../state/session.js';

export const FEEDBACK_KINDS: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: 'wrong-sign', label: 'A sign looks wrong' },
  { kind: 'missing-sign', label: 'Please add a sign' },
  { kind: 'recognition', label: 'My signing was not recognised' },
  { kind: 'bug', label: 'Something is broken' },
  { kind: 'idea', label: 'Idea or suggestion' },
  { kind: 'other', label: 'Something else' },
];

const kindLabel = (kind: FeedbackKind) => FEEDBACK_KINDS.find((k) => k.kind === kind)?.label ?? kind;

/** Report a problem or suggest something. Reviewed by the SignSphere team (admin panel). */
export default function Feedback() {
  const { backend, active } = useSession();
  const [params] = useSearchParams();
  const initialKind = (FEEDBACK_KINDS.find((k) => k.kind === params.get('kind'))?.kind ?? 'wrong-sign') as FeedbackKind;
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [gloss, setGloss] = useState(params.get('gloss') ?? '');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<FeedbackItem[]>([]);

  const load = () => void backend.listMyFeedback().then(setMine).catch(() => setMine([]));
  useEffect(load, [backend]);

  const needsSign = kind === 'wrong-sign' || kind === 'missing-sign' || kind === 'recognition';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (message.trim().length < 3) {
      setStatus({ ok: false, text: 'Please describe the problem in a few words.' });
      return;
    }
    if (needsSign && !gloss.trim()) {
      setStatus({ ok: false, text: 'Which sign or word is it about?' });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await backend.sendFeedback({
        accountId: active?.id ?? null,
        kind,
        gloss: needsSign ? gloss.trim().toUpperCase().slice(0, 64) : null,
        message: message.trim().slice(0, 2000),
        page: params.get('from')?.slice(0, 200) ?? null,
      });
      setMessage('');
      setStatus({
        ok: true,
        text: backend.mode === 'cloud' ? 'Thank you — sent to the SignSphere team.' : 'Saved on this device. It will reach the team once the server is connected.',
      });
      load();
    } catch (e) {
      setStatus({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Report a problem</h1>
      <p className="lede">
        Seen a sign that looks wrong, or need a sign that is missing? Tell us. Fluent ISL signers on the SignSphere team
        review every report.
      </p>

      <form className="card stack" onSubmit={(e) => void submit(e)} noValidate>
        <label className="field">
          <span>What is it about?</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
            {FEEDBACK_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        {needsSign && (
          <label className="field">
            <span>Sign or word</span>
            <input type="text" value={gloss} onChange={(e) => setGloss(e.target.value)} maxLength={64} placeholder="e.g. HOSPITAL" required />
          </label>
        )}
        <label className="field">
          <span>Details</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} required placeholder="What did you expect, and what happened?" />
        </label>
        {status && (
          <p className={`notice ${status.ok ? '' : 'error'}`} role={status.ok ? 'status' : 'alert'}>
            {status.text}
          </p>
        )}
        <div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </form>

      {mine.length > 0 && (
        <section className="stack" style={{ marginTop: '1.5rem' }} aria-labelledby="mine-heading">
          <h2 id="mine-heading">Your reports</h2>
          <ul className="feedback-list">
            {mine.map((item) => (
              <li key={item.id} className="card">
                <p style={{ margin: 0 }}>
                  <span className={`status-pill ${item.status}`}>{item.status === 'resolved' ? 'Resolved' : 'Open'}</span>{' '}
                  <strong>{kindLabel(item.kind)}</strong>
                  {item.gloss && ` · ${item.gloss}`}
                  <span className="small muted"> · {new Date(item.createdAt).toLocaleDateString()}</span>
                </p>
                <p className="small" style={{ margin: '0.4rem 0 0' }}>
                  {item.message}
                </p>
                {item.adminNote && (
                  <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
                    Reply from SignSphere: {item.adminNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
