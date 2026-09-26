import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HistoryItem, HistoryKind } from '../lib/backend.js';
import { filterItems, pendingCount } from '../lib/historyStore.js';
import { useHistory } from '../state/history.js';
import { useSession } from '../state/session.js';

const KINDS: Array<{ kind: HistoryKind; label: string; icon: string; to: string }> = [
  { kind: 'text-to-sign', label: 'Text → Sign', icon: '⌨', to: '/text-to-sign' },
  { kind: 'voice-to-sign', label: 'Voice → Sign', icon: '🎤', to: '/voice-to-sign' },
  { kind: 'sign-to-text', label: 'Sign → Text', icon: '👁', to: '/sign-to-text' },
  { kind: 'sign-to-voice', label: 'Sign → Voice', icon: '🔊', to: '/sign-to-voice' },
];

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function groupByDay(items: HistoryItem[]): Array<[string, HistoryItem[]]> {
  const groups = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const key = dayLabel(item.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}

export default function History() {
  const { active, backend } = useSession();
  const { items, remove, clear } = useHistory();
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<HistoryKind[]>([]);
  const shown = useMemo(() => filterItems(items, query, kinds), [items, query, kinds]);
  const pending = pendingCount();

  return (
    <>
      <h1>History</h1>
      <p className="lede">
        Everything signed, typed or spoken in <strong>{active?.displayName}</strong>
        {backend.mode === 'cloud' ? ', saved to your account.' : ', saved in this browser.'}
        {pending > 0 && ` ${pending} change${pending === 1 ? '' : 's'} will sync when you are online.`}
      </p>

      {items.length === 0 ? (
        <div className="card stack">
          <p style={{ margin: 0 }}>
            <strong>Nothing here yet.</strong> Translations appear here automatically as you use SignSphere.
          </p>
          <div className="row">
            {KINDS.map((k) => (
              <Link key={k.kind} className="btn small" to={k.to}>
                {k.icon} {k.label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="card stack">
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="history-search">Search</label>
              <input id="history-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words or signs…" />
            </div>
            <div className="row" role="group" aria-label="Filter by type">
              {KINDS.map((k) => {
                const on = kinds.includes(k.kind);
                return (
                  <button
                    key={k.kind}
                    type="button"
                    className={`chip${on ? ' active' : ''}`}
                    aria-pressed={on}
                    onClick={() => setKinds(on ? kinds.filter((x) => x !== k.kind) : [...kinds, k.kind])}
                  >
                    {k.icon} {k.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="small muted" role="status">
            {shown.length} of {items.length}
          </p>

          {groupByDay(shown).map(([day, dayItems]) => (
            <section key={day} className="history-day" aria-label={day}>
              <h2 className="small">{day}</h2>
              <ul className="history-list">
                {dayItems.map((item) => {
                  const k = KINDS.find((x) => x.kind === item.kind);
                  const signed = item.kind === 'sign-to-text' || item.kind === 'sign-to-voice';
                  return (
                    <li key={item.id} className="card history-item">
                      <div className="history-meta small muted">
                        <span aria-hidden="true">{k?.icon}</span> {k?.label} ·{' '}
                        {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <p className="history-input">{item.input}</p>
                      {!signed && item.output && item.output !== item.input && <p className="history-output">ISL: {item.output}</p>}
                      <button type="button" className="small danger history-delete" onClick={() => remove([item.id])} aria-label={`Delete “${item.input}”`}>
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="row" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Delete all history for ${active?.displayName ?? 'this account'}? This cannot be undone.`)) void clear();
              }}
            >
              Delete all history
            </button>
          </div>
        </>
      )}
    </>
  );
}
