import { Link } from 'react-router-dom';
import { TERMS_VERSION } from '../lib/terms.js';

const SUPPORT = import.meta.env['VITE_SUPPORT_EMAIL'] as string | undefined;

/**
 * Terms of Use in plain language. Draft written to match what the app does; have it reviewed
 * by a lawyer before the Play Store release. Bump TERMS_VERSION (lib/terms.ts) when it changes.
 */
export default function Terms() {
  const sections: Array<[string, React.ReactNode]> = [
    [
      'What SignSphere is',
      <>
        SignSphere helps people learn and communicate in Indian Sign Language (ISL). It recognises a limited number of signs from
        your camera and shows English as ISL with a 3D signer. It is a <strong>learning and communication aid</strong>.
      </>,
    ],
    [
      'What it is not',
      <>
        SignSphere is <strong>not a qualified ISL interpreter</strong> and makes mistakes. Do not rely on it alone for medical,
        legal, financial or emergency decisions — use a qualified interpreter, or write things down, when it matters. In an
        emergency, call <strong>112</strong> directly. The Emergency screen helps you ask for help, but it can misread a sign and
        never calls anyone by itself.
      </>,
    ],
    [
      'Your login',
      <>
        Keep your password private; you are responsible for what is done with your login. One login can hold up to 10 accounts
        (Individual, Hospital or Organisation). Give true details — hospitals and organisations are checked before they are shown
        as verified. If you are under 18, use SignSphere with a parent's or guardian's permission.
      </>,
    ],
    [
      'Using it fairly',
      <>
        Do not misuse SignSphere: no abuse or harassment through reports, no false hospital or organisation details, no attempts
        to break its security or read other people's data, and no automated mass use. The SignSphere team may suspend a login
        that does this. A suspended login can still view and delete its own data.
      </>,
    ],
    [
      'Your data',
      <>
        Camera video stays on your device and is never uploaded. What is stored, where, and how to delete it is explained in the{' '}
        <Link to="/privacy">Privacy notice</Link>, which is part of these terms. You can delete your login and everything in it at
        any time from Accounts. When the app breaks, it may send the SignSphere team a short error report (what went wrong and on
        which screen — never your words, recordings or contact details) so it can be fixed.
      </>,
    ],
    [
      'Signs and content',
      <>
        Sign data from the INCLUDE dataset (AI4Bharat) is used under the CC BY 4.0 licence. Signs you record stay yours; you let
        SignSphere store them so they work on your devices. Translations and signs may be incomplete or regional — report anything
        wrong with <Link to="/feedback">Report a problem</Link>.
      </>,
    ],
    [
      'Changes and availability',
      <>
        SignSphere is provided as it is, while it is being developed, and may change or be unavailable at times. If these terms
        change in an important way, the app will ask you to agree again. These terms are governed by the laws of India.
      </>,
    ],
  ];
  return (
    <>
      <h1>Terms of Use</h1>
      <p className="lede">The rules for using SignSphere, in plain language. Version {TERMS_VERSION}.</p>
      {sections.map(([title, body]) => (
        <section key={title} className="card stack" style={{ marginBottom: '1rem' }}>
          <h2>{title}</h2>
          <p style={{ margin: 0 }}>{body}</p>
        </section>
      ))}
      <p className="hint">
        Questions: {SUPPORT ? <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> : <Link to="/feedback">Report a problem</Link>} ·{' '}
        <Link to="/privacy">Privacy notice</Link> · <Link to="/welcome">Back</Link>
      </p>
    </>
  );
}
