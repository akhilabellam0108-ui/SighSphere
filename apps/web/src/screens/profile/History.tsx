import { useMemo, useState } from 'react';
import { HistoryList } from '../../components/domain/index.js';
import { Button, Card, EmptyState, Icon, Modal, PageHeader, SwitchField } from '../../components/ui/index.js';
import { useHistory } from '../../hooks/useHistory.js';
import { KIND_LABEL, filterHistory, type HistoryEntry, type HistoryKind } from '../../lib/history.js';
import { useToast } from '../../state/toast.js';

const KINDS: HistoryKind[] = ['text-to-sign', 'voice-to-sign', 'sign-to-text', 'sign-to-voice', 'conversation'];

function timeLabel(at: number) {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function History() {
  const { entries, toggleSaved, remove, clearRecent, clearAll } = useHistory();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<HistoryKind[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [open, setOpen] = useState<HistoryEntry | null>(null);
  const [confirm, setConfirm] = useState<'recent' | 'all' | null>(null);

  const results = useMemo(() => filterHistory(entries, { query, kinds, savedOnly }), [entries, query, kinds, savedOnly]);
  const filtered = query.trim() !== '' || kinds.length > 0 || savedOnly;

  function toggleKind(kind: HistoryKind) {
    setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
  }

  return (
    <>
      <PageHeader
        back={{ to: '/profile', label: 'Back to profile' }}
        title="Saved & history"
        subtitle="Everything you translated or saved, stored only on this device."
      />

      {entries.length === 0 ? (
        <EmptyState
          icon="history"
          title="Nothing here yet"
          actions={
            <>
              <Button variant="primary" to="/translate/text-to-sign" icon="keyboard">
                Translate something
              </Button>
              <Button to="/translate/conversation" icon="conversation">
                Start a conversation
              </Button>
            </>
          }
        >
          Translations appear here automatically. Tap the bookmark on any of them to keep it — saved
          items are never cleared automatically.
        </EmptyState>
      ) : (
        <>
          <Card className="stack history-filters">
            <div className="search">
              <label htmlFor="history-search" className="sr-only">
                Search history
              </label>
              <Icon name="search" />
              <input
                id="history-search"
                type="search"
                placeholder="Search your history…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="row" role="group" aria-label="Filter by type">
              {KINDS.map((kind) => (
                <button key={kind} type="button" className="chip chip-filter" aria-pressed={kinds.includes(kind)} onClick={() => toggleKind(kind)}>
                  {KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            <SwitchField label="Saved only" checked={savedOnly} onChange={setSavedOnly} />
          </Card>

          <p className="small muted section" role="status" style={{ marginTop: '1.25rem' }}>
            {results.length} of {entries.length} item{entries.length === 1 ? '' : 's'}
          </p>

          {results.length === 0 ? (
            <EmptyState
              icon="filter"
              title="No matches"
              compact
              actions={
                filtered && (
                  <Button
                    onClick={() => {
                      setQuery('');
                      setKinds([]);
                      setSavedOnly(false);
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            >
              Nothing matches these filters.
            </EmptyState>
          ) : (
            <HistoryList
              entries={results}
              onOpen={setOpen}
              onToggleSaved={toggleSaved}
              onDelete={(id) => {
                remove(id);
                toast('Deleted.');
              }}
            />
          )}

          <div className="btn-group section">
            <Button variant="secondary" icon="trash" onClick={() => setConfirm('recent')} disabled={!entries.some((e) => !e.saved)}>
              Clear unsaved
            </Button>
            <Button variant="danger" icon="trash" onClick={() => setConfirm('all')}>
              Delete everything
            </Button>
          </div>
        </>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? (open.kind === 'conversation' ? 'Conversation' : KIND_LABEL[open.kind]) : ''}
        footer={
          open && (
            <>
              <Button
                variant="ghost"
                icon="trash"
                onClick={() => {
                  remove(open.id);
                  setOpen(null);
                  toast('Deleted.');
                }}
              >
                Delete
              </Button>
              <Button
                variant="primary"
                icon={open.saved ? 'bookmark-check' : 'bookmark'}
                onClick={() => {
                  toggleSaved(open.id);
                  setOpen({ ...open, saved: !open.saved });
                }}
              >
                {open.saved ? 'Saved' : 'Save'}
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="stack">
            <p className="small muted mb-0">{new Date(open.createdAt).toLocaleString()}</p>
            {open.kind === 'conversation' ? (
              open.turns && open.turns.length > 0 ? (
                <ol className="transcript-list">
                  {open.turns.map((turn, i) => (
                    <li key={`${turn.at}-${i}`} className={`bubble ${turn.speaker}`}>
                      <span className="bubble-meta">
                        {turn.speaker === 'hearing' ? 'Hearing person' : 'Deaf person (signed)'} · {timeLabel(turn.at)}
                      </span>
                      <span className="bubble-text">{turn.text}</span>
                      {turn.gloss && <span className="bubble-gloss">ISL: {turn.gloss}</span>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mb-0">No turns recorded.</p>
              )
            ) : (
              <>
                <div>
                  <h3 className="small">Input</h3>
                  <p className="mb-0">{open.input || '—'}</p>
                </div>
                {open.output && open.output !== open.input && (
                  <div>
                    <h3 className="small">ISL gloss</h3>
                    <p className="mb-0" style={{ fontWeight: 600, letterSpacing: '0.02em' }}>
                      {open.output}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'all' ? 'Delete all history?' : 'Clear unsaved items?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                if (confirm === 'all') clearAll();
                else clearRecent();
                setConfirm(null);
                toast(confirm === 'all' ? 'History deleted.' : 'Unsaved items cleared.');
              }}
            >
              {confirm === 'all' ? 'Delete everything' : 'Clear unsaved'}
            </Button>
          </>
        }
      >
        <p className="mb-0">
          {confirm === 'all'
            ? 'This deletes every translation and conversation, including saved ones. It cannot be undone.'
            : 'Saved items stay. Everything else in your history is removed.'}
        </p>
      </Modal>
    </>
  );
}
