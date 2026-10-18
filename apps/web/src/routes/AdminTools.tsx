/**
 * Admin tools beyond verification and reports: the team, users (block / unblock),
 * announcements, the vocabulary, usage statistics, and a sign-pack preview before publishing.
 * Every action is checked by the database (supabase/migrations/0003_admin_tools.sql).
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { buildIndex, type LexEntry } from '@signsphere/gloss';
import { friendlyError, type AdminStats, type Announcement, type TeamMember, type UserSummary, type VocabWord } from '../lib/backend.js';
import { validatePack, type SignPack } from '../lib/signPack.js';
import { setVocabulary, useLexicon } from '../lib/vocabulary.js';
import { useSession } from '../state/session.js';

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="notice error" role="alert">
      {error}
    </p>
  );
}

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—');

// ───────────────────────────────────────────────────────────────── users

export function Users() {
  const { backend } = useSession();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (term: string) => {
      setError(null);
      backend.adminListUsers(term).then(setUsers, (e: unknown) => setError(friendlyError(e)));
    },
    [backend],
  );
  useEffect(() => load(''), [load]);

  async function setBlocked(user: UserSummary, blocked: boolean) {
    if (blocked && !window.confirm(`Block ${user.email}? They will not be able to add or change anything until you unblock them.`)) return;
    setError(null);
    try {
      await backend.adminSetBlocked(user.userId, blocked, reasons[user.userId] ?? '');
      load(search);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <section className="stack" aria-label="Users">
      <p className="muted small" style={{ margin: 0 }}>
        Logins only: email, dates and number of accounts. Nobody on the team can see a person's history, recordings or
        personal account details.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
      >
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span>Search by email</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. gmail.com" />
        </label>
        <button type="submit" className="btn" style={{ alignSelf: 'end' }}>
          Search
        </button>
      </form>
      <ErrorNote error={error} />
      {users === null ? (
        <p className="muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="muted">No logins found.</p>
      ) : (
        <ul className="admin-list">
          {users.map((u) => (
            <li key={u.userId} className="card stack">
              <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
                <strong>{u.email}</strong>{' '}
                {u.admin && <span className="tag ok">Team</span>}
                {u.blocked && <span className="tag danger">Blocked</span>}
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                Joined {date(u.joined)} · last signed in {date(u.lastSignIn)} · {u.accounts} account{u.accounts === 1 ? '' : 's'}
                {u.blocked && u.blockedReason ? ` · reason: ${u.blockedReason}` : ''}
              </p>
              {!u.admin &&
                (u.blocked ? (
                  <div>
                    <button type="button" className="small" onClick={() => void setBlocked(u, false)}>
                      Unblock
                    </button>
                  </div>
                ) : (
                  <div className="row">
                    <input
                      type="text"
                      aria-label={`Reason for blocking ${u.email}`}
                      placeholder="Reason (they will see it)"
                      maxLength={500}
                      value={reasons[u.userId] ?? ''}
                      onChange={(e) => setReasons({ ...reasons, [u.userId]: e.target.value })}
                      style={{ flex: 1, minWidth: 180 }}
                    />
                    <button type="button" className="small danger" onClick={() => void setBlocked(u, true)}>
                      Block
                    </button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────── team

export function Team() {
  const { backend, user } = useSession();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    backend.adminListAdmins().then(setTeam, (e: unknown) => setError(friendlyError(e)));
  }, [backend]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    try {
      setTeam(await backend.adminAddAdmin(email.trim()));
      setDone(`${email.trim()} is now on the SignSphere team. They will see the Admin tab next time they open the app.`);
      setEmail('');
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function remove(member: TeamMember) {
    const self = member.userId === user?.id;
    if (!window.confirm(self ? 'Remove yourself from the team? You will lose access to Admin.' : `Remove ${member.email} from the team?`)) return;
    setError(null);
    try {
      setTeam(await backend.adminRemoveAdmin(member.userId));
      if (self) window.location.reload();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <section className="stack" aria-label="Team">
      <p className="muted small" style={{ margin: 0 }}>
        Admins can verify hospitals, answer reports, block logins, post announcements, edit the vocabulary and publish sign
        packs. Only add people you trust.
      </p>
      <form className="row" onSubmit={(e) => void add(e)}>
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          <span>Add an admin by email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="They must have signed up first" />
        </label>
        <button type="submit" className="btn primary" style={{ alignSelf: 'end' }}>
          Add to team
        </button>
      </form>
      <ErrorNote error={error} />
      {done && (
        <p className="notice" role="status">
          {done}
        </p>
      )}
      {team === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="admin-list">
          {team.map((m) => (
            <li key={m.userId} className="card row" style={{ justifyContent: 'space-between' }}>
              <span style={{ overflowWrap: 'anywhere' }}>
                <strong>{m.email}</strong> {m.userId === user?.id && <span className="tag">you</span>}
                <span className="small muted"> · admin since {date(m.since)}</span>
              </span>
              <button type="button" className="small" onClick={() => void remove(m)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────── announcements

export function AnnouncementsAdmin() {
  const { backend } = useSession();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backend.adminListAnnouncements().then(setItems, (e: unknown) => setError(friendlyError(e)));
  }, [backend]);

  const run = async (fn: () => Promise<Announcement[]>) => {
    setError(null);
    try {
      setItems(await fn());
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <section className="stack" aria-label="Announcements">
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => backend.adminPostAnnouncement(title.trim(), body.trim())).then(() => {
            setTitle('');
            setBody('');
          });
        }}
      >
        <p className="muted small" style={{ margin: 0 }}>
          Shown at the top of the app for everyone (the newest three). Each person can dismiss it.
        </p>
        <label className="field">
          <span>Title</span>
          <input type="text" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 50 new ISL signs added" />
        </label>
        <label className="field">
          <span>Message (optional)</span>
          <textarea maxLength={1000} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <button type="submit" className="btn primary" style={{ alignSelf: 'start' }}>
          Post announcement
        </button>
      </form>
      <ErrorNote error={error} />
      {items === null ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No announcements yet.</p>
      ) : (
        <ul className="admin-list">
          {items.map((a) => (
            <li key={a.id} className="card stack">
              <p style={{ margin: 0 }}>
                <strong>{a.title}</strong> <span className={`tag ${a.active ? 'ok' : ''}`}>{a.active ? 'Showing' : 'Hidden'}</span>
                <span className="small muted"> · {date(a.createdAt)}</span>
              </p>
              {a.body && <p style={{ margin: 0 }}>{a.body}</p>}
              <div className="row">
                <button type="button" className="small" onClick={() => void run(() => backend.adminSetAnnouncement(a.id, !a.active))}>
                  {a.active ? 'Hide' : 'Show again'}
                </button>
                <button
                  type="button"
                  className="small"
                  onClick={() => window.confirm('Delete this announcement?') && void run(() => backend.adminDeleteAnnouncement(a.id))}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────── vocabulary

const POS: Array<[VocabWord['pos'], string]> = [
  ['noun', 'Noun (thing, person, place)'],
  ['verb', 'Verb (action)'],
  ['adj', 'Adjective (describing)'],
  ['adv', 'Adverb'],
  ['pron', 'Pronoun (I, you…)'],
  ['num', 'Number'],
  ['wh', 'Question word'],
  ['neg', 'Negation (not, no)'],
  ['time', 'Time word'],
  ['quant', 'Quantity (many, few)'],
  ['other', 'Other'],
];

const blankWord: VocabWord = { gloss: '', english: [], pos: 'noun', category: null, notes: null, twoHanded: false, reviewed: false, reviewedBy: null, hidden: false };

export function VocabularyAdmin() {
  const { backend } = useSession();
  const lexicon = useLexicon();
  const index = useMemo(() => buildIndex(lexicon), [lexicon]);
  const [team, setTeam] = useState<VocabWord[] | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<VocabWord | null>(null);
  const [englishText, setEnglishText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    backend.vocabulary().then(setTeam, (e: unknown) => setError(friendlyError(e)));
  }, [backend]);

  const teamGlosses = new Set((team ?? []).map((w) => w.gloss));
  const term = search.trim().toLowerCase();
  const matches: LexEntry[] = term
    ? index.lexicon.entries.filter((e) => e.gloss.toLowerCase().includes(term) || e.english.some((w) => w.includes(term))).slice(0, 40)
    : [];
  const hiddenWords = (team ?? []).filter((w) => w.hidden);

  function edit(entry: LexEntry | VocabWord) {
    const fromTeam = (team ?? []).find((w) => w.gloss === entry.gloss);
    const word: VocabWord = fromTeam ?? {
      ...blankWord,
      gloss: entry.gloss,
      english: entry.english,
      pos: entry.pos,
      category: entry.category ?? null,
      notes: entry.notes ?? null,
      twoHanded: Boolean(entry.twoHanded),
      reviewed: false,
    };
    setForm(word);
    setEnglishText(word.english.join(', '));
    setSaved(null);
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    try {
      const words = await backend.adminSaveWord({
        ...form,
        gloss: form.gloss.trim().toUpperCase().replace(/\s+/g, '-'),
        english: englishText.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean),
      });
      setTeam(words);
      setVocabulary(words);
      setSaved(`Saved ${form.gloss.toUpperCase()}. Every copy of the app uses it the next time it opens.`);
      setForm(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function undo(gloss: string) {
    if (!window.confirm(`Remove the team's change to ${gloss}? The built-in version (if any) comes back.`)) return;
    try {
      const words = await backend.adminDeleteWord(gloss);
      setTeam(words);
      setVocabulary(words);
      setForm(null);
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <section className="stack" aria-label="Vocabulary">
      <p className="muted small" style={{ margin: 0 }}>
        {index.stats.entries} words · {index.stats.reviewed} reviewed by a fluent signer · {team?.length ?? 0} added or changed by the
        team. Changes reach every user without a new release.
      </p>
      <div className="row">
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span>Find a word</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="English word or sign name" />
        </label>
        <button type="button" className="btn" style={{ alignSelf: 'end' }} onClick={() => edit({ ...blankWord, gloss: search.trim().toUpperCase() })}>
          + New word
        </button>
      </div>
      <ErrorNote error={error} />
      {saved && (
        <p className="notice" role="status">
          {saved}
        </p>
      )}

      {form && (
        <form className="card stack" onSubmit={(e) => void save(e)}>
          <h3 style={{ margin: 0 }}>{teamGlosses.has(form.gloss) ? 'Edit' : form.gloss ? 'Correct' : 'Add'} {form.gloss || 'a word'}</h3>
          <div className="form-grid">
            <label className="field">
              <span>Sign name (gloss)</span>
              <input
                type="text"
                required
                maxLength={64}
                value={form.gloss}
                onChange={(e) => setForm({ ...form, gloss: e.target.value.toUpperCase() })}
                placeholder="e.g. PAIN"
              />
            </label>
            <label className="field">
              <span>English words (comma-separated)</span>
              <input type="text" required value={englishText} onChange={(e) => setEnglishText(e.target.value)} placeholder="pain, hurt, ache" />
            </label>
            <label className="field">
              <span>Type of word</span>
              <select value={form.pos} onChange={(e) => setForm({ ...form, pos: e.target.value as VocabWord['pos'] })}>
                {POS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category (optional)</span>
              <input type="text" maxLength={40} value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value || null })} placeholder="medical, family…" />
            </label>
          </div>
          <label className="field">
            <span>Notes (optional)</span>
            <input type="text" maxLength={500} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} />
          </label>
          <label className="row" style={{ gap: '0.5rem' }}>
            <input type="checkbox" checked={form.twoHanded} onChange={(e) => setForm({ ...form, twoHanded: e.target.checked })} />
            Uses both hands
          </label>
          <label className="row" style={{ gap: '0.5rem' }}>
            <input type="checkbox" checked={form.reviewed} onChange={(e) => setForm({ ...form, reviewed: e.target.checked })} />
            Checked by a fluent ISL signer
          </label>
          {form.reviewed && (
            <label className="field">
              <span>Who checked it (name and role)</span>
              <input
                type="text"
                required
                maxLength={120}
                value={form.reviewedBy ?? ''}
                onChange={(e) => setForm({ ...form, reviewedBy: e.target.value || null })}
                placeholder="e.g. R. Kumar, ISL interpreter"
              />
            </label>
          )}
          <label className="row" style={{ gap: '0.5rem' }}>
            <input type="checkbox" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} />
            Hide this word (wrong sign — stop using it)
          </label>
          <div className="row">
            <button type="submit" className="btn primary">
              Save
            </button>
            <button type="button" className="btn" onClick={() => setForm(null)}>
              Cancel
            </button>
            {teamGlosses.has(form.gloss) && (
              <button type="button" className="btn" onClick={() => void undo(form.gloss)}>
                Undo team change
              </button>
            )}
          </div>
        </form>
      )}

      {matches.length > 0 && (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Sign</th>
                <th>English</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {matches.map((entry) => (
                <tr key={entry.gloss}>
                  <td>
                    <strong>{entry.gloss}</strong>
                  </td>
                  <td>{entry.english.join(', ')}</td>
                  <td>
                    {teamGlosses.has(entry.gloss) && <span className="tag">Team</span>}
                    <span className={`tag ${entry.reviewed ? 'ok' : ''}`}>{entry.reviewed ? 'Reviewed' : 'Not reviewed'}</span>
                  </td>
                  <td>
                    <button type="button" className="small" onClick={() => edit(entry)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {term && matches.length === 0 && <p className="muted">No word matches “{search}”. Use “+ New word” to add it.</p>}

      {hiddenWords.length > 0 && (
        <p className="small muted">
          Hidden words:{' '}
          {hiddenWords.map((w) => (
            <button key={w.gloss} type="button" className="small" style={{ margin: '0.15rem' }} onClick={() => edit(w)}>
              {w.gloss}
            </button>
          ))}
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────── analytics

const KIND_LABEL: Record<string, string> = {
  'text-to-sign': 'Text → Sign',
  'voice-to-sign': 'Voice → Sign',
  'sign-to-text': 'Sign → Text',
  'sign-to-voice': 'Sign → Voice',
  'wrong-sign': 'Wrong sign',
  'missing-sign': 'Missing sign',
  recognition: 'Recognition',
  bug: 'Bug',
  idea: 'Idea',
  other: 'Other',
};

function HBars({ rows }: { rows: Array<[string, number]> }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p className="muted small">Nothing yet.</p>;
  return (
    <div>
      {rows.map(([label, n]) => (
        <div key={label} className="hbar">
          <span className="small">{KIND_LABEL[label] ?? label}</span>
          <div aria-hidden="true">
            <i style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <strong className="small">{n}</strong>
        </div>
      ))}
    </div>
  );
}

export function Analytics() {
  const { backend } = useSession();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    backend.adminStats(days).then(setStats, (e: unknown) => setError(friendlyError(e)));
  }, [backend, days]);

  const total = (key: 'translations' | 'signups' | 'reports') => stats?.daily.reduce((sum, d) => sum + d[key], 0) ?? 0;
  const maxDay = Math.max(1, ...(stats?.daily.map((d) => d.translations) ?? [0]));

  return (
    <section className="stack" aria-label="Analytics">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="muted small" style={{ margin: 0 }}>
          Counts only — never anyone's words, recordings or identity.
        </p>
        <label className="field" style={{ maxWidth: 180 }}>
          <span>Period</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>
      <ErrorNote error={error} />
      {!stats ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="admin-stats" role="list">
            {(
              [
                ['Translations', total('translations')],
                ['New logins', total('signups')],
                ['Reports', total('reports')],
                ['Blocked logins', stats.blocked],
                ['Team members', stats.admins],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <div key={label} className="card admin-stat" role="listitem">
                <strong>{value.toLocaleString()}</strong>
                <span className="small muted">{label}</span>
              </div>
            ))}
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Translations per day</h3>
            <div className="bars" role="img" aria-label={`Translations per day over the last ${stats.days} days, peak ${maxDay}`}>
              {stats.daily.map((d) => (
                <span
                  key={d.day}
                  className={d.translations ? '' : 'zero'}
                  style={{ height: `${Math.max(2, (d.translations / maxDay) * 100)}%` }}
                  title={`${new Date(d.day).toLocaleDateString()}: ${d.translations} translations, ${d.signups} new logins`}
                />
              ))}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {date(stats.daily[0]?.day)} – {date(stats.daily.at(-1)?.day)} · busiest day {maxDay === 1 && !total('translations') ? 0 : maxDay}
            </p>
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>How people use it</h3>
            <HBars rows={Object.entries(stats.byKind).sort((a, b) => b[1] - a[1])} />
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Signs people asked for or found wrong</h3>
            <p className="small muted" style={{ margin: 0 }}>
              From reports — add these first (Vocabulary tab, then record or import them).
            </p>
            <HBars rows={stats.missingRequested.map((m) => [m.gloss, m.count])} />
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Most-recorded signs</h3>
            <HBars rows={stats.topRecorded.map((m) => [m.gloss, m.count])} />
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Reports by type (all time)</h3>
            <HBars rows={Object.entries(stats.reportsByKind).sort((a, b) => b[1] - a[1])} />
          </div>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────── sign pack

function summarise(pack: SignPack) {
  const samples = new Map<string, number>();
  for (const s of pack.samples) samples.set(s.label, (samples.get(s.label) ?? 0) + 1);
  const motions = new Set(pack.motions.map((m) => m.gloss));
  const glosses = [...new Set([...Object.keys(pack.signs), ...samples.keys()])].sort();
  return glosses.map((gloss) => ({
    gloss,
    category: pack.signs[gloss]?.category ?? '',
    samples: samples.get(gloss) ?? 0,
    motion: motions.has(gloss),
  }));
}

export function PackPublisher() {
  const { backend } = useSession();
  const [current, setCurrent] = useState<SignPack | null | 'none'>(null);
  const [draft, setDraft] = useState<{ pack: SignPack; text: string } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = backend.signPackUrl();
    if (!url) return setCurrent('none');
    fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => setCurrent(json ? validatePack(json) : 'none'))
      .catch(() => setCurrent('none'));
  }, [backend]);

  async function choose(file: File) {
    setStatus(null);
    setDraft(null);
    try {
      const text = await file.text();
      setDraft({ pack: validatePack(JSON.parse(text)), text });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof SyntaxError ? 'That file is not a SignSphere sign pack.' : friendlyError(e) });
    }
  }

  async function publish() {
    if (!draft) return;
    setBusy(true);
    try {
      const url = await backend.adminPublishSignPack(new Blob([draft.text], { type: 'application/json' }));
      setStatus({
        ok: true,
        text: `Published "${draft.pack.name}" (${Object.keys(draft.pack.signs).length} signs, version ${draft.pack.version}). Every device installs it on its next start. ${url}`,
      });
      setCurrent(draft.pack);
      setDraft(null);
    } catch (e) {
      setStatus({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  const rows = draft ? summarise(draft.pack) : [];
  const weak = rows.filter((r) => r.samples < 3);
  const currentSigns = current && current !== 'none' ? new Set(Object.keys(current.signs)) : new Set<string>();
  const added = rows.filter((r) => !currentSigns.has(r.gloss)).length;

  return (
    <section className="card stack" aria-label="Sign pack">
      <p style={{ margin: 0 }}>
        Publish the ISL sign pack made on the <strong>ISL dataset</strong> screen (<code>isl-include.json</code>). Every copy of SignSphere
        downloads it automatically, so new signs reach users without a new release. You'll see what's inside before it goes out.
      </p>
      <p className="small muted" style={{ margin: 0 }}>
        Published now:{' '}
        {current === null
          ? 'checking…'
          : current === 'none'
            ? 'nothing yet (apps use the pack built into the app)'
            : `"${current.name}" · ${Object.keys(current.signs).length} signs · version ${current.version}`}
      </p>
      <label className="btn" style={{ alignSelf: 'start' }}>
        Choose sign pack…
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void choose(file);
            e.target.value = '';
          }}
        />
      </label>

      {draft && (
        <div className="stack">
          <p style={{ margin: 0 }}>
            <strong>{draft.pack.name}</strong> · version {draft.pack.version} · {rows.length} signs ({added} new) · {draft.pack.samples.length}{' '}
            examples · {draft.pack.motions.length} avatar motions
          </p>
          {weak.length > 0 && (
            <p className="notice warn" style={{ margin: 0 }}>
              {weak.length} sign{weak.length === 1 ? ' has' : 's have'} fewer than 3 examples and may be recognised poorly:{' '}
              {weak.map((w) => w.gloss).join(', ')}
            </p>
          )}
          <div className="table-scroll pack-preview">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Sign</th>
                  <th>Category</th>
                  <th>Examples</th>
                  <th>Avatar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.gloss}>
                    <td>
                      <strong>{r.gloss}</strong> {!currentSigns.has(r.gloss) && <span className="tag ok">new</span>}
                    </td>
                    <td>{r.category}</td>
                    <td>{r.samples < 3 ? <span className="tag danger">{r.samples}</span> : r.samples}</td>
                    <td>{r.motion ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" className="btn primary" disabled={busy} onClick={() => void publish()}>
              {busy ? 'Publishing…' : 'Publish to everyone'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && (
        <p className={`notice ${status.ok ? '' : 'error'}`} role={status.ok ? 'status' : 'alert'} style={{ overflowWrap: 'anywhere' }}>
          {status.text}
        </p>
      )}
    </section>
  );
}
