import { Link } from 'react-router-dom';
import { TERMS_VERSION } from '../lib/terms.js';
import { useT } from '../lib/i18n.js';
import { TERMS } from '../lib/legal.js';
import { richText } from '../components/RichText.js';

const SUPPORT = import.meta.env['VITE_SUPPORT_EMAIL'] as string | undefined;

/**
 * Terms of Use in plain language, in the interface language (lib/legal.ts). Draft written to
 * match what the app does; have it reviewed by a lawyer before the Play Store release. Bump
 * TERMS_VERSION (lib/terms.ts) when it changes.
 */
export default function Terms() {
  const { t, lang } = useT();
  return (
    <>
      <h1>{t('legal.termsTitle')}</h1>
      <p className="lede">{t('legal.termsLede', { v: TERMS_VERSION })}</p>
      {lang !== 'en' && <p className="hint">{t('legal.englishGoverns')}</p>}
      {TERMS[lang].map((section) => (
        <section key={section.title} className="card stack" style={{ marginBottom: '1rem' }}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} style={{ margin: 0 }}>
              {richText(paragraph)}
            </p>
          ))}
        </section>
      ))}
      <p className="hint">
        {t('legal.questions')} {SUPPORT ? <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> : <Link to="/feedback">{t('legal.report')}</Link>} ·{' '}
        <Link to="/privacy">{t('legal.privacyTitle')}</Link> · <Link to="/welcome">{t('legal.back')}</Link>
      </p>
    </>
  );
}
