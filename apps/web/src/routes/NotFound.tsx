import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n.js';

export default function NotFound() {
  const { t } = useT();
  return (
    <>
      <h1>{t('nf.title')}</h1>
      <p className="lede">{t('nf.body')}</p>
      <Link className="btn primary" to="/">
        {t('nf.home')}
      </Link>
    </>
  );
}
