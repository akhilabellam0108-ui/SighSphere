import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildIndex } from '@signsphere/gloss';
import { useLexicon } from '../lib/vocabulary.js';
import { useT, type MessageKey } from '../lib/i18n.js';
import { isMastered, sampleSummary } from '../lib/storage.js';
import { useSession } from '../state/session.js';
import { useSettings } from '../state/settings.js';

const FEATURES = [
  { to: '/text-to-sign', title: 'nav.textToSign', body: 'home.card.textToSign' },
  { to: '/voice-to-sign', title: 'nav.voiceToSign', body: 'home.card.voiceToSign' },
  { to: '/sign-to-text', title: 'nav.signToText', body: 'home.card.signToText' },
  { to: '/sign-to-voice', title: 'nav.signToVoice', body: 'home.card.signToVoice' },
  { to: '/conversation', title: 'home.card.conversationTitle', body: 'home.card.conversation' },
  { to: '/record', title: 'home.card.recordTitle', body: 'home.card.record' },
  { to: '/learn', title: 'home.card.learnTitle', body: 'home.card.learn' },
  { to: '/emergency', title: 'nav.emergency', body: 'home.card.emergency' },
  { to: '/history', title: 'nav.history', body: 'home.card.history' },
  { to: '/dataset', title: 'home.card.datasetTitle', body: 'home.card.dataset' },
] as const satisfies ReadonlyArray<{ to: string; title: MessageKey; body: MessageKey }>;

export default function Home() {
  const { progress } = useSettings();
  const { active } = useSession();
  const { t } = useT();
  const [recorded, setRecorded] = useState(0);
  const [labels, setLabels] = useState(0);

  useEffect(() => {
    void sampleSummary().then((summary) => {
      setRecorded(summary.mine);
      setLabels(summary.signs);
    });
  }, []);

  const lexicon = buildIndex(useLexicon());
  const mastered = Object.keys(progress.signs).filter((gloss) => isMastered(progress, gloss)).length;

  return (
    <>
      <h1>{active ? t('home.welcome', { name: active.type === 'individual' ? (active.displayName.split(' ')[0] ?? active.displayName) : active.displayName }) : 'SignSphere'}</h1>
      <p className="lede">{t('home.lede')}</p>

      {labels === 0 && (
        <p className="notice">
          <strong>Start here: add some signs</strong>
          Recognition needs examples before it can recognise anything. Install ready-made ISL signs
          from the <Link to="/dataset">ISL dataset</Link>, or open <Link to="/record">Record</Link> and
          record 5 takes each of 3 signs — then <Link to="/sign-to-text">Sign → Text</Link> will start
          working.
        </p>
      )}

      <section className="card grid" aria-label="Your progress" style={{ marginBottom: '1.25rem' }}>
        <Stat value={progress.xp} label={t('home.xp')} />
        <Stat value={progress.dayStreak} label={t('home.streak')} />
        <Stat value={mastered} label={t('home.mastered')} />
        <Stat value={`${labels}`} label={t('home.recognise')} />
        <Stat value={recorded} label={t('home.recorded')} />
        <Stat value={lexicon.stats.entries} label={t('home.words')} />
      </section>

      <h2>{t('home.whatYouCanDo')}</h2>
      <div className="grid">
        {FEATURES.map((feature) => (
          <Link key={feature.to} to={feature.to} className="card" style={{ textDecoration: 'none' }}>
            <h3>{t(feature.title)}</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {t(feature.body)}
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
