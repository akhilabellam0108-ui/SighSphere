/**
 * Learning Hub: levels → lessons, daily challenge, progress, completion records.
 * All lessons come from the lexicon via lib/lessons.ts; nothing here invents content.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildIndex } from '@signsphere/gloss';
import {
  Badge,
  Button,
  Card,
  ComingSoon,
  Icon,
  Notice,
  PageHeader,
  ProgressBar,
  Section,
  Stat,
} from '../../components/ui/index.js';
import { buildLessons, dailyChallenge, groupByLevel, type Lesson } from '../../lib/lessons.js';
import { isMastered, sampleCounts } from '../../lib/storage.js';
import { useSettings } from '../../state/settings.js';

function LessonCard({ lesson, mastered }: { lesson: Lesson; mastered: number }) {
  const done = mastered === lesson.entries.length;
  return (
    <Link to={`/learn/${lesson.id}`} className="card card-interactive lesson-card">
      <span className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: "var(--text-md)" }}>{lesson.title}</h3>
        {done && (
          <Badge tone="success" icon="check">
            Done
          </Badge>
        )}
      </span>
      <p className="small muted" style={{ margin: 0 }}>
        {lesson.entries.map((entry) => entry.gloss).join(' · ')}
      </p>
      <ProgressBar value={mastered} max={lesson.entries.length} label={`${lesson.title} mastered`} />
    </Link>
  );
}

export default function LearningHub() {
  const { progress } = useSettings();
  const lexicon = useMemo(() => buildIndex(), []);
  const lessons = useMemo(() => buildLessons(lexicon.lexicon.entries), [lexicon]);
  const groups = useMemo(() => groupByLevel(lessons), [lessons]);
  const challenge = useMemo(() => dailyChallenge(lessons), [lessons]);
  const [knownSigns, setKnownSigns] = useState<number | null>(null);

  useEffect(() => {
    void sampleCounts()
      .then((counts) => setKnownSigns(Object.keys(counts).length))
      .catch(() => setKnownSigns(null));
  }, []);

  const masteredIn = (lesson: Lesson) => lesson.entries.filter((entry) => isMastered(progress, entry.gloss)).length;
  const masteredTotal = Object.keys(progress.signs).filter((gloss) => isMastered(progress, gloss)).length;
  const now = Date.now();
  const due = Object.values(progress.signs).filter((sign) => sign.dueAt > 0 && sign.dueAt <= now).length;
  const challengeMastered = challenge ? isMastered(progress, challenge.entry.gloss) : false;

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            <Icon name="learn" /> Learn ISL
          </>
        }
        title="Learning Hub"
        subtitle={`Watch a sign, sign it back to the camera, and get specific feedback. ${lessons.length} lessons built from the lexicon.`}
      />

      <div className="stat-grid">
        <Stat icon="zap" tone="amber" value={progress.xp} label="XP" />
        <Stat icon="flame" tone="red" value={progress.dayStreak} label="Day streak" />
        <Stat icon="target" tone="green" value={masteredTotal} label="Signs mastered" />
        <Stat icon="history" tone="cyan" value={due} label="Due for review" />
      </div>

      {knownSigns === 0 && (
        <Notice tone="warn" title="Practice cannot be graded yet">
          You can watch every lesson, but grading needs the recogniser to know the sign.{' '}
          <Link to="/profile/teach">Teach a sign</Link> to unlock feedback for it.
        </Notice>
      )}

      {challenge && (
        <Card variant="hero" as="section" className="section challenge-card" aria-labelledby="challenge-title">
          <div className="challenge-body">
            <span className="badge-pill on-dark">
              <Icon name="calendar" /> Daily challenge
            </span>
            <h2 id="challenge-title">
              Today’s sign: <span className="challenge-sign">{challenge.entry.gloss}</span>
            </h2>
            <p>
              From “{challenge.lesson.title}”. {challengeMastered ? 'You have mastered this one — practise to keep it fresh.' : 'Sign it correctly 3 times in a row to master it.'}
            </p>
            <Button variant="white" size="lg" icon="play" to={`/learn/${challenge.lesson.id}?sign=${challenge.signIndex}`}>
              Start challenge
            </Button>
          </div>
        </Card>
      )}

      <Section title="What you get" className="section">
        <div className="grid-cards-sm">
          <div className="feature-mini">
            <span className="icon-tile" aria-hidden="true">
              <Icon name="sparkles" />
            </span>
            <div>
              <h3 className="small">Instant feedback</h3>
              <p className="small muted mb-0">Handshape, hands-in-frame and two-hand checks after every try.</p>
            </div>
          </div>
          <div className="feature-mini">
            <span className="icon-tile teal" aria-hidden="true">
              <Icon name="target" />
            </span>
            <div>
              <h3 className="small">Spaced review</h3>
              <p className="small muted mb-0">Signs come back just before you would forget them.</p>
            </div>
          </div>
          <div className="feature-mini">
            <span className="icon-tile amber" aria-hidden="true">
              <Icon name="flame" />
            </span>
            <div>
              <h3 className="small">Streaks and XP</h3>
              <p className="small muted mb-0">Small daily practice beats long weekly sessions.</p>
            </div>
          </div>
          <div className="feature-mini">
            <span className="icon-tile cyan" aria-hidden="true">
              <Icon name="award" />
            </span>
            <div>
              <h3 className="small">Completion records</h3>
              <p className="small muted mb-0">A record for each level you finish. Not an accredited certificate.</p>
            </div>
          </div>
        </div>
      </Section>

      {groups.map(({ level, lessons: levelLessons }) => {
        const signs = levelLessons.flatMap((lesson) => lesson.entries);
        const mastered = signs.filter((entry) => isMastered(progress, entry.gloss)).length;
        return (
          <Section
            key={level.id}
            id={`level-${level.id}`}
            title={level.title}
            description={level.description}
          >
            {signs.length > 0 && (
              <div style={{ marginBottom: '1rem', maxWidth: '28rem' }}>
                <ProgressBar value={mastered} max={signs.length} label={`${level.title} signs mastered`} />
              </div>
            )}
            <div className="grid-cards">
              {levelLessons.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} mastered={masteredIn(lesson)} />
              ))}
              {level.planned.map((topic) => (
                <ComingSoon key={topic} icon="lock" title={topic}>
                  Needs reviewed signs and signer videos before it can be taught honestly.
                </ComingSoon>
              ))}
            </div>
          </Section>
        );
      })}

      <Section title="Completion records">
        <div className="grid-cards">
          {groups.map(({ level, lessons: levelLessons }) => {
            const signs = levelLessons.flatMap((lesson) => lesson.entries);
            const mastered = signs.filter((entry) => isMastered(progress, entry.gloss)).length;
            const complete = signs.length > 0 && mastered === signs.length;
            return (
              <Card key={level.id} className={complete ? 'certificate earned' : 'certificate'}>
                <span className={`icon-tile ${complete ? 'gradient' : ''}`} aria-hidden="true">
                  <Icon name={complete ? 'award' : 'lock'} />
                </span>
                <h3>{level.title}</h3>
                <p className="small muted">
                  {signs.length === 0
                    ? 'No lessons at this level yet.'
                    : complete
                      ? 'Completed — every sign at this level mastered on this device.'
                      : `${mastered} of ${signs.length} signs mastered.`}
                </p>
              </Card>
            );
          })}
        </div>
        <p className="hint">
          Completion records reflect practice on this device. They are not accredited ISL
          certificates.
        </p>
      </Section>
    </>
  );
}
