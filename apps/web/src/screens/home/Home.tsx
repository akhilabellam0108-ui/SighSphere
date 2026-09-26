import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildIndex } from '@signsphere/gloss';
import { HistoryList } from '../../components/domain/index.js';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  FeatureCard,
  Icon,
  Notice,
  Section,
  Stat,
  type IconName,
} from '../../components/ui/index.js';
import { useHistory } from '../../hooks/useHistory.js';
import { firstName } from '../../lib/auth.js';
import { buildLessons } from '../../lib/lessons.js';
import { isMastered, sampleCounts } from '../../lib/storage.js';
import { useAuth } from '../../state/auth.js';
import { useSettings } from '../../state/settings.js';

const HUB = [
  {
    to: '/translate/text-to-sign',
    icon: 'keyboard',
    pair: 'hand',
    tone: 'indigo',
    title: 'Text → Sign',
    body: 'Convert written text into ISL sign order, played as signs or fingerspelling.',
    action: 'Translate',
  },
  {
    to: '/translate/sign-to-text',
    icon: 'camera',
    pair: 'type',
    tone: 'cyan',
    title: 'Sign → Text',
    body: 'Recognise signs on camera and turn them into text.',
    action: 'Open Camera',
  },
  {
    to: '/translate/voice-to-sign',
    icon: 'mic',
    pair: 'hand',
    tone: 'teal',
    title: 'Voice → Sign',
    body: 'Convert spoken language into ISL signs.',
    action: 'Start Listening',
  },
  {
    to: '/translate/sign-to-voice',
    icon: 'hand',
    pair: 'volume',
    tone: 'amber',
    title: 'Sign → Voice',
    body: 'Recognise signs and speak them aloud for a hearing person.',
    action: 'Start Camera',
  },
] as const;

const QUICK = [
  { to: '/learn', icon: 'learn', tone: 'indigo', title: 'Learn Sign Language', body: 'Lessons with camera feedback.' },
  { to: '/emergency', icon: 'sos', tone: 'red', title: 'Emergency Assistance', body: 'Phrase cards, contacts, location.' },
  { to: '/accessibility', icon: 'accessibility', tone: 'teal', title: 'Accessibility Tools', body: 'Captions, speech, reading aid.' },
  { to: '/community', icon: 'community', tone: 'cyan', title: 'Community', body: 'Forums, events, mentorship.' },
  { to: '/record', icon: 'record', tone: 'amber', title: 'Record Signs', body: 'Teach it signs, or install built-in ISL.' },
] as const;

interface SearchResult {
  key: string;
  label: string;
  detail: string;
  to: string;
  icon: IconName;
}

const DESTINATIONS: Array<Omit<SearchResult, 'key'>> = [
  ...HUB.map((item) => ({ label: item.title, detail: item.body, to: item.to, icon: item.icon as IconName })),
  { label: 'Live Conversation', detail: 'Split-screen voice and sign conversation', to: '/translate/conversation', icon: 'conversation' },
  ...QUICK.map((item) => ({ label: item.title, detail: item.body, to: item.to, icon: item.icon as IconName })),
  { label: 'Saved & history', detail: 'Your saved translations and conversations', to: '/profile/history', icon: 'history' },
  { label: 'Record signs', detail: 'Record examples or install built-in ISL signs', to: '/record', icon: 'record' },
  { label: 'Settings', detail: 'Speech, recognition, data', to: '/profile/settings', icon: 'settings' },
  { label: 'Help & Support', detail: 'FAQ, privacy, limitations', to: '/profile/help', icon: 'help' },
];

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { progress } = useSettings();
  const { entries, toggleSaved, remove } = useHistory();
  const [recorded, setRecorded] = useState(0);
  const [labels, setLabels] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void sampleCounts()
      .then((counts) => {
        setRecorded(Object.values(counts).reduce((sum, n) => sum + n, 0));
        setLabels(Object.keys(counts).length);
      })
      .catch(() => setLabels(0));
  }, []);

  const lexicon = useMemo(() => buildIndex(), []);
  const lessons = useMemo(() => buildLessons(lexicon.lexicon.entries), [lexicon]);
  const mastered = Object.keys(progress.signs).filter((gloss) => isMastered(progress, gloss)).length;
  const name = firstName(session);
  const recent = entries.slice(0, 5);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pages = DESTINATIONS.filter((d) => `${d.label} ${d.detail}`.toLowerCase().includes(q)).map((d) => ({
      ...d,
      key: `page-${d.to}`,
    }));
    const words = lexicon.lexicon.entries
      .filter((entry) => entry.gloss.toLowerCase().includes(q) || entry.english.some((word) => word.includes(q)))
      .slice(0, 5)
      .map((entry) => ({
        key: `sign-${entry.gloss}`,
        label: `${entry.english[0] ?? entry.gloss} → ${entry.gloss}`,
        detail: `See it in Text → Sign${entry.category ? ` · ${entry.category}` : ''}`,
        to: `/translate/text-to-sign?text=${encodeURIComponent(entry.english[0] ?? entry.gloss)}`,
        icon: 'hand' as IconName,
      }));
    const lessonHits = lessons
      .filter((lesson) => lesson.title.toLowerCase().includes(q))
      .slice(0, 3)
      .map((lesson) => ({
        key: `lesson-${lesson.id}`,
        label: `Lesson: ${lesson.title}`,
        detail: `${lesson.entries.length} signs`,
        to: `/learn/${lesson.id}`,
        icon: 'learn' as IconName,
      }));
    const historyHits = entries
      .filter((entry) => `${entry.input} ${entry.output}`.toLowerCase().includes(q))
      .slice(0, 3)
      .map((entry) => ({
        key: `history-${entry.id}`,
        label: entry.input || entry.output,
        detail: 'From your history',
        to: '/profile/history',
        icon: 'history' as IconName,
      }));
    return [...pages, ...words, ...lessonHits, ...historyHits].slice(0, 10);
  }, [query, lexicon, lessons, entries]);

  return (
    <>
      <header className="home-header">
        <div className="home-greeting">
          <Link to="/profile" className="home-avatar" aria-label="Your profile">
            <Avatar name={session?.name ?? 'Guest'} />
          </Link>
          <div>
            <p className="muted small mb-0">{greeting()}</p>
            <h1 tabIndex={-1}>{name ? `Welcome back, ${name}` : 'Welcome Back'}</h1>
          </div>
        </div>

        <form
          role="search"
          className="search"
          onSubmit={(event) => {
            event.preventDefault();
            const first = results[0];
            if (first) navigate(first.to);
          }}
        >
          <label htmlFor="home-search" className="sr-only">
            Search features, signs, lessons and history
          </label>
          <Icon name="search" />
          <input
            id="home-search"
            type="search"
            placeholder="Search signs, lessons, tools…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            aria-describedby="home-search-status"
          />
        </form>
      </header>
      <p id="home-search-status" className="sr-only" role="status">
        {query.trim() ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}
      </p>
      {query.trim() && (
        <div className="search-results">
          {results.length === 0 ? (
            <EmptyState icon="search" title="No matches" compact>
              Nothing matched “{query}”. Try a word like “water” or a feature like “camera”.
            </EmptyState>
          ) : (
            <ul className="list link-list">
              {results.map((result) => (
                <li key={result.key}>
                  <Link to={result.to} className="list-item">
                    <span className="icon-tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12 }}>
                      <Icon name={result.icon} />
                    </span>
                    <span className="list-item-main">
                      <span className="list-item-title" style={{ display: 'block' }}>
                        {result.label}
                      </span>
                      <span className="list-item-meta" style={{ display: 'block' }}>
                        {result.detail}
                      </span>
                    </span>
                    <Icon name="chevron" className="chev" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Card variant="hero" className="home-hero" as="section" aria-labelledby="hero-title">
        <div className="home-hero-text">
          <span className="badge-pill on-dark">
            <Icon name="sparkles" /> On-device AI · ISL
          </span>
          <h2 id="hero-title">Communicate Without Limits</h2>
          <p>Use AI-powered translation to bridge communication gaps instantly.</p>
          <div className="btn-group">
            <Button variant="white" size="lg" icon="conversation" to="/translate/conversation">
              Start Conversation
            </Button>
            <Button variant="on-dark" to="/translate/text-to-sign">
              Quick translate
            </Button>
          </div>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <Icon name="hand" size="xl" />
        </div>
      </Card>

      {labels === 0 && (
        <Notice title="Start here: teach it three signs">
          Recognition needs examples before it can recognise anything. Open{' '}
          <Link to="/record">Record signs</Link> and record 5 takes each of 3 signs — then{' '}
          <Link to="/translate/sign-to-text">Sign → Text</Link> will start working. No training run or
          server needed.
        </Notice>
      )}

      <Section title="Translation hub" description="Four ways to bridge speech, text and sign.">
        <div className="hub-grid">
          {HUB.map((item) => (
            <FeatureCard
              key={item.to}
              to={item.to}
              icon={item.icon}
              pairIcon={item.pair}
              tone={item.tone}
              title={item.title}
              description={item.body}
              action={item.action}
            />
          ))}
        </div>
      </Section>

      <Section title="Quick access">
        <div className="quick-grid">
          {QUICK.map((item) => (
            <Link key={item.to} to={item.to} className="card card-interactive quick-card">
              <span className={`icon-tile ${item.tone === 'indigo' ? '' : item.tone}`} aria-hidden="true">
                <Icon name={item.icon} />
              </span>
              <span>
                <span className="quick-title">{item.title}</span>
                <span className="quick-body">{item.body}</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Recent activity" action={entries.length > 0 ? { to: '/profile/history', label: 'View all' } : undefined}>
        {recent.length === 0 ? (
          <EmptyState icon="history" title="No activity yet" compact>
            Translations you make show up here, so you can find and save them later. Everything stays
            on this device.
          </EmptyState>
        ) : (
          <HistoryList entries={recent} onToggleSaved={toggleSaved} onDelete={remove} />
        )}
      </Section>

      <Section title="Your progress" action={{ to: '/learn', label: 'Keep learning' }}>
        <div className="stat-grid">
          <Stat icon="zap" tone="amber" value={progress.xp} label="XP" />
          <Stat icon="flame" tone="red" value={progress.dayStreak} label="Day streak" />
          <Stat icon="target" tone="green" value={mastered} label="Signs mastered" />
          <Stat icon="hand" tone="cyan" value={labels ?? '—'} label="Signs it recognises" />
          <Stat icon="video" tone="teal" value={recorded} label="Clips you recorded" />
          <Stat icon="book" value={lexicon.stats.entries} label="Lexicon size" />
        </div>
      </Section>

      {/*
        Honest status, in the product. PLAN.md §10 rule 6: publish real numbers, including
        the unflattering ones. Update as the lexicon gets reviewed — do not delete it while the
        numbers are still zero.
      */}
      <section className="section" aria-label="Current limitations">
        <details className="disclosure">
          <summary>
            <Icon name="info" />
            Current limitations — being straight with you
            <Icon name="chevron" className="chev" />
          </summary>
          <div className="disclosure-body">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li>
                <strong>
                  {lexicon.stats.reviewed} of {lexicon.stats.entries}
                </strong>{' '}
                lexicon entries have been checked by a fluent ISL signer. The rest are placeholders
                and may be wrong.
              </li>
              <li>
                <strong>
                  {lexicon.stats.withClip} of {lexicon.stats.entries}
                </strong>{' '}
                entries have a real signer video. The rest display as text.
              </li>
              <li>
                Recognition covers <strong>{labels ?? 0}</strong> signs and works on isolated signs
                only, not connected sentences.
              </li>
              <li>
                Gloss order comes from rules that have not yet been validated against ISL grammar,
                and gloss text cannot represent facial expression or mouthing, which carry meaning
                in ISL.
              </li>
            </ul>
          </div>
        </details>
      </section>
    </>
  );
}
