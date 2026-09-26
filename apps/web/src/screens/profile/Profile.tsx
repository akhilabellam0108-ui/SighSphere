import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildIndex } from '@signsphere/gloss';
import { Avatar, Badge, Button, Card, Icon, Modal, ProgressBar, Section, Stat, type IconName } from '../../components/ui/index.js';
import { useHistory } from '../../hooks/useHistory.js';
import { computeAchievements } from '../../lib/achievements.js';
import { buildLessons, groupByLevel } from '../../lib/lessons.js';
import { isMastered, sampleCounts } from '../../lib/storage.js';
import { useAuth } from '../../state/auth.js';
import { useSettings } from '../../state/settings.js';

const LINKS: Array<{ to: string; icon: IconName; title: string; body: string }> = [
  { to: '/profile/history', icon: 'bookmark', title: 'Saved conversations & translations', body: 'Search, re-open and delete your history.' },
  { to: '/record', icon: 'record', title: 'Record signs', body: 'Record your own signs or install built-in ISL signs.' },
  { to: '/profile/settings', icon: 'settings', title: 'Settings', body: 'Speech, recognition, display and your data.' },
  { to: '/accessibility', icon: 'accessibility', title: 'Accessibility tools', body: 'Captions, text-to-speech, reading aid.' },
  { to: '/profile/help', icon: 'help', title: 'Help & Support', body: 'FAQ, privacy and what SignSphere can and cannot do.' },
];

export default function Profile() {
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const { progress } = useSettings();
  const { entries } = useHistory();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    void sampleCounts()
      .then(setCounts)
      .catch(() => setCounts({}));
  }, []);

  const lexicon = useMemo(() => buildIndex(), []);
  const groups = useMemo(() => groupByLevel(buildLessons(lexicon.lexicon.entries)), [lexicon]);
  const mastered = Object.keys(progress.signs).filter((gloss) => isMastered(progress, gloss)).length;
  const achievements = computeAchievements({ progress, masteredCount: mastered, history: entries, sampleCounts: counts });
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const saved = entries.filter((entry) => entry.saved).length;
  const name = session?.name ?? 'Guest';

  return (
    <>
      <Card variant="hero" as="section" className="profile-hero" aria-labelledby="profile-name">
        <Avatar name={name} size="lg" />
        <div className="profile-id">
          <h1 id="profile-name" tabIndex={-1}>
            {name}
          </h1>
          <p className="mb-0">
            {session?.kind === 'demo' ? session.email : 'Using SignSphere without a profile'}
          </p>
          <span className="badge-pill on-dark" style={{ marginTop: '0.5rem' }}>
            <Icon name={session?.kind === 'demo' ? 'info' : 'profile'} />
            {session?.kind === 'demo' ? 'Demo profile · on this device only' : 'Guest'}
          </span>
        </div>
        <div className="profile-hero-actions">
          {session?.kind !== 'demo' && (
            <Button variant="white" icon="user-plus" to="/auth?mode=signup">
              Create a profile
            </Button>
          )}
          <Button variant="on-dark" icon="logout" onClick={() => setConfirmSignOut(true)}>
            Sign out
          </Button>
        </div>
      </Card>

      <div className="stat-grid section">
        <Stat icon="zap" tone="amber" value={progress.xp} label="XP" />
        <Stat icon="flame" tone="red" value={progress.dayStreak} label="Day streak" />
        <Stat icon="target" tone="green" value={mastered} label="Signs mastered" />
        <Stat icon="bookmark" tone="cyan" value={saved} label="Saved items" />
      </div>

      <Section title="Learning progress" action={{ to: '/learn', label: 'Open Learning Hub' }}>
        <Card className="stack">
          {groups.map(({ level, lessons }) => {
            const signs = lessons.flatMap((lesson) => lesson.entries);
            if (signs.length === 0) {
              return (
                <p key={level.id} className="small muted mb-0">
                  <strong>{level.title}:</strong> lessons coming soon.
                </p>
              );
            }
            const done = signs.filter((entry) => isMastered(progress, entry.gloss)).length;
            return <ProgressBar key={level.id} value={done} max={signs.length} label={`${level.title} signs mastered`} />;
          })}
        </Card>
      </Section>

      <Section title={`Achievements · ${unlocked} of ${achievements.length}`}>
        <div className="grid-cards-sm">
          {achievements.map((achievement) => (
            <div key={achievement.id} className={`achievement${achievement.unlocked ? ' unlocked' : ''}`}>
              <span className={`icon-tile ${achievement.unlocked ? 'gradient' : ''}`} aria-hidden="true">
                <Icon name={achievement.unlocked ? achievement.icon : 'lock'} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h3 className="small" style={{ margin: 0 }}>
                  {achievement.title}
                  {achievement.unlocked && <span className="sr-only"> (unlocked)</span>}
                </h3>
                <p className="small muted mb-0">{achievement.description}</p>
                {!achievement.unlocked && (
                  <div style={{ marginTop: '0.4rem' }}>
                    <ProgressBar
                      value={Number(achievement.progressLabel.split('/')[0])}
                      max={Number(achievement.progressLabel.split('/')[1])}
                      label={`${achievement.title} progress`}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Your space">
        <ul className="list link-list">
          {LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="list-item">
                <span className="icon-tile" aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 14 }}>
                  <Icon name={link.icon} />
                </span>
                <span className="list-item-main">
                  <span className="list-item-title" style={{ display: 'block' }}>
                    {link.title}
                  </span>
                  <span className="list-item-meta" style={{ display: 'block' }}>
                    {link.body}
                  </span>
                </span>
                {link.to === '/profile/history' && saved > 0 && <Badge tone="accent">{saved}</Badge>}
                <Icon name="chevron" className="chev" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Modal
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSignOut(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="logout"
              onClick={() => {
                signOut();
                navigate('/welcome', { replace: true });
              }}
            >
              Sign out
            </Button>
          </>
        }
      >
        <p className="mb-0">
          Your progress, history and recordings stay on this device. To erase them, use “Delete
          everything on this device” in Settings.
        </p>
      </Modal>
    </>
  );
}
