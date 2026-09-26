import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildIndex } from '@signsphere/gloss';
import { isMastered, sampleCounts } from '../lib/storage.js';
import { useSettings } from '../state/settings.js';

const FEATURES = [
  {
    to: '/text-to-sign',
    title: 'Text → Sign',
    body: 'Type English and see it in ISL gloss order, with fingerspelling for unknown words.',
  },
  {
    to: '/voice-to-sign',
    title: 'Voice → Sign',
    body: 'Speak, and see the same translation. Falls back to typing if speech is unavailable.',
  },
  {
    to: '/sign-to-text',
    title: 'Sign → Text',
    body: 'Sign to your camera and see the recognised sign. Limited vocabulary.',
  },
  {
    to: '/sign-to-voice',
    title: 'Sign → Voice',
    body: 'The same recognition, spoken aloud for a hearing person.',
  },
  {
    to: '/learn',
    title: 'Learning Hub',
    body: 'Lessons with camera practice and instant feedback. Streaks and spaced review.',
  },
  {
    to: '/emergency',
    title: 'Emergency',
    body: 'Offline phrase cards and contacts. Works with no network, always free.',
  },
] as const;

export default function Home() {
  const { progress } = useSettings();
  const [recorded, setRecorded] = useState(0);
  const [labels, setLabels] = useState(0);

  useEffect(() => {
    void sampleCounts().then((counts) => {
      setRecorded(Object.values(counts).reduce((sum, n) => sum + n, 0));
      setLabels(Object.keys(counts).length);
    });
  }, []);

  const lexicon = buildIndex();
  const mastered = Object.keys(progress.signs).filter((gloss) => isMastered(progress, gloss)).length;

  return (
    <>
      <h1>SignSphere</h1>
      <p className="lede">
        Learn and communicate in Indian Sign Language. Your camera is processed entirely on this
        device — no video is uploaded, and it works offline once loaded.
      </p>

      {labels === 0 && (
        <p className="notice">
          <strong>Start here: teach it three signs</strong>
          Recognition needs examples before it can recognise anything. Open{' '}
          <Link to="/record">Record</Link> and record 5 takes each of 3 signs — then{' '}
          <Link to="/sign-to-text">Sign → Text</Link> will start working. No training run or
          server needed.
        </p>
      )}

      <section className="card grid" aria-label="Your progress" style={{ marginBottom: '1.25rem' }}>
        <Stat value={progress.xp} label="XP" />
        <Stat value={progress.dayStreak} label="Day streak" />
        <Stat value={mastered} label="Signs mastered" />
        <Stat value={`${labels}`} label="Signs it can recognise" />
        <Stat value={recorded} label="Clips you recorded" />
        <Stat value={lexicon.stats.entries} label="Lexicon size" />
      </section>

      <h2>What you can do</h2>
      <div className="grid">
        {FEATURES.map((feature) => (
          <Link key={feature.to} to={feature.to} className="card" style={{ textDecoration: 'none' }}>
            <h3>{feature.title}</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {feature.body}
            </p>
          </Link>
        ))}
      </div>

      {/*
        Honest status, in the product. PLAN.md §10 rule 6: publish real numbers, including
        the unflattering ones. Update this block as the lexicon gets reviewed — do not
        delete it while the numbers are still zero.
      */}
      <h2 style={{ marginTop: '1.75rem' }}>Current limitations</h2>
      <div className="card stack">
        <p className="small" style={{ margin: 0 }}>
          Being straight with you about where this is:
        </p>
        <ul className="small" style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>
            <strong>{lexicon.stats.reviewed} of {lexicon.stats.entries}</strong> lexicon entries
            have been checked by a fluent ISL signer. The rest are placeholders and may be wrong.
          </li>
          <li>
            <strong>{lexicon.stats.withClip} of {lexicon.stats.entries}</strong> entries have a
            real signer video. The rest display as text.
          </li>
          <li>
            Recognition covers <strong>{labels}</strong> signs and works on isolated signs only,
            not connected sentences.
          </li>
          <li>
            Gloss order comes from rules that have not yet been validated against ISL grammar,
            and gloss text cannot represent facial expression or mouthing, which carry meaning
            in ISL.
          </li>
        </ul>
      </div>
    </>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
