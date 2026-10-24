import { Link } from 'react-router-dom';
import { useSession } from '../state/session.js';
import { useT } from '../lib/i18n.js';
import { PRIVACY, PRIVACY_FOOTER, PRIVACY_WHERE } from '../lib/legal.js';
import { richText } from '../components/RichText.js';

const SUPPORT = import.meta.env['VITE_SUPPORT_EMAIL'] as string | undefined;

/**
 * Plain-language privacy notice, in the interface language (lib/legal.ts). Written to match
 * what the code actually does — keep it in sync when data handling changes. Have it reviewed
 * by a lawyer before launch (DPDP Act 2023).
 */
export default function Privacy() {
  const { backend } = useSession();
  const { t, lang } = useT();
  const where = PRIVACY_WHERE[lang][backend.mode === 'cloud' ? 'cloud' : 'device'];
  const sections = PRIVACY[lang];
  return (
    <>
      <h1>{t('legal.privacyTitle')}</h1>
      <p className="lede">{t('legal.privacyLede')}</p>
      {lang !== 'en' && <p className="hint">{t('legal.englishGoverns')}</p>}

      {sections.map((section, index) => (
        <section key={section.title} className="card stack" style={index ? { marginTop: '1rem' } : undefined}>
          <h2>{section.title}</h2>
          {section.list ? (
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {section.body.map((item) => (
                <li key={item}>{richText(item.replace('{where}', where))}</li>
              ))}
            </ul>
          ) : (
            section.body.map((paragraph) => (
              <p key={paragraph} style={{ margin: 0 }}>
                {richText(paragraph)}
              </p>
            ))
          )}
          {index === sections.length - 1 && (
            <p style={{ margin: 0 }}>
              {t('legal.contact')} {SUPPORT ? <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> : <em>{t('legal.noSupport')}</em>}
            </p>
          )}
        </section>
      ))}

      <p className="hint">
        {PRIVACY_FOOTER[lang]} <Link to="/welcome">{t('legal.back')}</Link>
      </p>
    </>
  );
}
