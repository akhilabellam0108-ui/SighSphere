import { Link } from 'react-router-dom';
import { useSession } from '../state/session.js';

const SUPPORT = import.meta.env['VITE_SUPPORT_EMAIL'] as string | undefined;

/**
 * Plain-language privacy notice. Written to match what the code actually does — keep it in
 * sync when data handling changes. Have it reviewed by a lawyer before launch (DPDP Act 2023).
 */
export default function Privacy() {
  const { backend } = useSession();
  return (
    <>
      <h1>Privacy notice</h1>
      <p className="lede">What SignSphere stores, where, and your choices. Plain language, no surprises.</p>

      <section className="card stack">
        <h2>Your camera</h2>
        <p style={{ margin: 0 }}>
          Camera video is processed on your device to track hand and body positions. <strong>Video is never uploaded or stored.</strong>{' '}
          When you record a sign, only the hand and body positions are saved, on this device.
        </p>
      </section>

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>Your microphone</h2>
        <p style={{ margin: 0 }}>
          Voice features use your browser’s speech recognition. Most browsers send the audio to the browser maker (for example
          Google for Chrome) to turn it into text. If you do not want that, type instead — every voice feature has a typing option.
        </p>
      </section>

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>Your account and history</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Login: your email and a securely hashed password (we never see the password itself).</li>
          <li>Accounts: the details you enter on the account form, including hearing status for Individual accounts.</li>
          <li>History: the text, speech transcripts and recognised signs from your translations, stored per account.</li>
          <li>
            Where: {backend.mode === 'cloud' ? 'on SignSphere’s database (Supabase), protected so that only your login can read your data.' : 'currently only in this browser (this-device mode).'}
          </li>
          <li>We do not sell your data or use it for advertising.</li>
        </ul>
      </section>

      <section className="card stack" style={{ marginTop: '1rem' }}>
        <h2>Your rights</h2>
        <p style={{ margin: 0 }}>
          You can see and correct your details (Accounts → Edit), delete any history item or all of it (History), and delete your
          login with everything in it (Accounts → Delete my login and data). Sign recordings on a device can be deleted in Settings.
        </p>
        <p style={{ margin: 0 }}>
          Contact: {SUPPORT ? <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> : <em>support contact not configured yet (set VITE_SUPPORT_EMAIL)</em>}
        </p>
      </section>

      <p className="hint">
        SignSphere is a communication aid, not a replacement for a qualified ISL interpreter. Sign data from the INCLUDE dataset is used
        under CC BY 4.0 (AI4Bharat). <Link to="/welcome">Back</Link>
      </p>
    </>
  );
}
