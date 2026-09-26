/**
 * Settings: accessibility, recognition, speech, and data control.
 *
 * The data-control section is not optional garnish — PLAN.md §10 rule 5 commits to a
 * deletion path that actually works, so "Delete everything" here really does clear
 * IndexedDB and localStorage.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buildIndex, validateLexicon } from '@signsphere/gloss';
import { FEATURE_VERSION, FRAME_DIM, WINDOW_FRAMES } from '../lib/features.js';
import { deleteAllLocalData } from '../lib/storage.js';
import { isSpeechRecognitionSupported, isSpeechSynthesisSupported, speak } from '../lib/speech.js';
import { useSettings } from '../state/settings.js';
import ShareApp from '../components/ShareApp.js';

const LANGS = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'bn-IN', label: 'Bengali' },
  { code: 'mr-IN', label: 'Marathi' },
];

export default function SettingsPage() {
  const { settings, update, resetAll } = useSettings();
  const [message, setMessage] = useState<string | null>(null);
  const lexicon = buildIndex();
  const problems = validateLexicon();

  return (
    <>
      <h1>Settings</h1>
      <p className="lede">Everything here is stored on this device only.</p>

      <section className="card stack" aria-labelledby="a11y-heading">
        <h2 id="a11y-heading">Accessibility</h2>

        <label className="switch">
          <span>
            High contrast
            <span className="hint" style={{ display: 'block' }}>
              Maximum contrast, independent of your light/dark setting.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(event) => update({ highContrast: event.target.checked })}
          />
        </label>

        <label className="switch">
          <span>
            Reduce motion
            <span className="hint" style={{ display: 'block' }}>
              Removes animations and transitions.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.reduceMotion}
            onChange={(event) => update({ reduceMotion: event.target.checked })}
          />
        </label>

        <div className="field">
          <label htmlFor="font-scale">Text size: {Math.round(settings.fontScale * 100)}%</label>
          <input
            id="font-scale"
            type="range"
            min={0.85}
            max={1.6}
            step={0.05}
            value={settings.fontScale}
            onChange={(event) => update({ fontScale: Number(event.target.value) })}
          />
        </div>
      </section>

      <section className="card stack" aria-labelledby="recognition-heading" style={{ marginTop: '1rem' }}>
        <h2 id="recognition-heading">Signing and recognition</h2>

        <div className="field">
          <label htmlFor="dominant-hand">Dominant hand</label>
          <select
            id="dominant-hand"
            value={settings.dominantHand}
            onChange={(event) => update({ dominantHand: event.target.value as 'left' | 'right' })}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
          <p className="hint">
            Set this correctly before recording. It decides which hand is treated as dominant in the
            features, and getting it wrong makes recognition much worse for left-dominant signers.
          </p>
        </div>

        <label className="switch">
          <span>
            Hands only (faster)
            <span className="hint" style={{ display: 'block' }}>
              Skips body tracking. Roughly halves CPU use on slow devices, but loses the
              signing-space position information — expect lower accuracy.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.handsOnly}
            onChange={(event) => update({ handsOnly: event.target.checked })}
          />
        </label>

        <div className="field">
          <label htmlFor="processor">Tracking runs on</label>
          <select
            id="processor"
            value={settings.processor}
            onChange={(event) => update({ processor: event.target.value as 'auto' | 'gpu' | 'cpu' })}
          >
            <option value="auto">Automatic (recommended)</option>
            <option value="gpu">Graphics chip</option>
            <option value="cpu">Main processor</option>
          </select>
          <p className="hint">
            If the camera screens show fewer than about 12 frames per second, try “Main processor” —
            on some laptops it is much faster.
          </p>
        </div>

        <div className="field">
          <label htmlFor="signer-id-setting">Signer ID</label>
          <input
            id="signer-id-setting"
            type="text"
            value={settings.signerId}
            onChange={(event) => update({ signerId: event.target.value })}
          />
          <p className="hint">Pseudonymous label attached to recordings. Never use a real name.</p>
        </div>
      </section>

      <section className="card stack" aria-labelledby="speech-heading" style={{ marginTop: '1rem' }}>
        <h2 id="speech-heading">Speech</h2>

        <div className="field">
          <label htmlFor="tts-lang">Speaking voice</label>
          <select
            id="tts-lang"
            value={settings.ttsLang}
            onChange={(event) => update({ ttsLang: event.target.value })}
          >
            {LANGS.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={{ marginTop: '0.5rem' }}
            onClick={() => speak('This is how SignSphere will sound.', settings.ttsLang)}
            disabled={!isSpeechSynthesisSupported()}
          >
            🔊 Test voice
          </button>
        </div>

        <div className="field">
          <label htmlFor="stt-lang">Listening language</label>
          <select
            id="stt-lang"
            value={settings.sttLang}
            onChange={(event) => update({ sttLang: event.target.value })}
          >
            {LANGS.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <p className="small muted">
          Speech recognition: {isSpeechRecognitionSupported() ? 'available' : 'not available in this browser'}.
          Speech output: {isSpeechSynthesisSupported() ? 'available' : 'not available'}.
        </p>
      </section>

      <section className="card stack" aria-labelledby="data-heading" style={{ marginTop: '1rem' }}>
        <h2 id="data-heading">Your data</h2>
        <p className="small" style={{ margin: 0 }}>
          Camera frames are processed on this device and never uploaded. Recordings, progress, and
          contacts are stored locally. Speech recognition is the one exception — see the note on the
          Voice → Sign screen.
        </p>
        <label className="switch">
          <span>
            Allow my recordings to be used for training
            <span className="hint" style={{ display: 'block' }}>
              Off by default. Only affects samples exported from the Record screen.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.consentTrain}
            onChange={(event) => update({ consentTrain: event.target.checked })}
          />
        </label>
        <div className="row">
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (!confirm('Delete all local data: recordings, progress, contacts, and settings?')) return;
              void deleteAllLocalData().then(() => {
                resetAll();
                setMessage('All local data deleted.');
              });
            }}
          >
            Delete everything on this device
          </button>
        </div>
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="card stack" aria-labelledby="share-heading" style={{ marginTop: '1rem' }}>
        <h2 id="share-heading">Open on another device</h2>
        <ShareApp />
      </section>

      <section className="card stack" aria-labelledby="dataset-heading" style={{ marginTop: '1rem' }}>
        <h2 id="dataset-heading">Indian Sign Language dataset</h2>
        <p className="small" style={{ margin: 0 }}>
          Import the INCLUDE ISL dataset so signs are recognised and the 3D avatar can sign them without anyone recording.
        </p>
        <div>
          <Link className="btn" to="/dataset">
            Open ISL dataset
          </Link>
        </div>
      </section>

      <section className="card stack" aria-labelledby="about-heading" style={{ marginTop: '1rem' }}>
        <h2 id="about-heading">Build details</h2>
        <table>
          <caption className="sr-only">Technical details</caption>
          <tbody>
            <tr>
              <th scope="row">Feature version</th>
              <td>{FEATURE_VERSION}</td>
            </tr>
            <tr>
              <th scope="row">Feature window</th>
              <td>
                {WINDOW_FRAMES} frames × {FRAME_DIM} dims
              </td>
            </tr>
            <tr>
              <th scope="row">Lexicon</th>
              <td>
                {lexicon.stats.entries} entries · {lexicon.stats.reviewed} signer-reviewed ·{' '}
                {lexicon.stats.withClip} with video
              </td>
            </tr>
            <tr>
              <th scope="row">Lexicon problems</th>
              <td>{problems.length === 0 ? 'none' : problems.join('; ')}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
