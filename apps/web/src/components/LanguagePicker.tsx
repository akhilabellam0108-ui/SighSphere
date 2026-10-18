import { UI_LANGS, currentLang, useT, type UiLang } from '../lib/i18n.js';
import { useSettings } from '../state/settings.js';

/** English / हिन्दी / తెలుగు. Also switches the voice that reads things aloud. */
export default function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { settings, update } = useSettings();
  const { t } = useT();
  const lang = currentLang(settings.uiLang);
  const choose = (code: UiLang) => {
    const speech = UI_LANGS.find((l) => l.code === code)?.speech ?? 'en-IN';
    update({ uiLang: code, ttsLang: speech });
  };
  return (
    <div className="stack" style={{ gap: '0.35rem' }}>
      <div className="segmented lang-picker" role="group" aria-label={t('lang.label')}>
        {UI_LANGS.map((l) => (
          <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} onClick={() => choose(l.code)}>
            {l.label}
          </button>
        ))}
      </div>
      {!compact && lang !== 'en' && <p className="hint" style={{ margin: 0 }}>{t('lang.note')}</p>}
    </div>
  );
}
