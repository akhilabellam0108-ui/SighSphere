import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ACCOUNT_TYPES, validateAccount, visibleFields, type AccountType, type FieldDef } from '../lib/accountTypes.js';
import { useT, type MessageKey, type UiLang } from '../lib/i18n.js';
import { trText } from '../lib/i18nFields.js';
import { friendlyError } from '../lib/backend.js';
import { useSession } from '../state/session.js';

/** The validation message from accountTypes.ts, in the interface language. */
function translateError(lang: UiLang, t: (key: MessageKey, vars?: Record<string, string>) => string, field: FieldDef, message: string): string {
  if (message === `${field.label} is required.`) return t('form.required', { field: trText(lang, field.label) });
  if (message === `Choose a ${field.label.toLowerCase()}.`) return t('form.chooseA', { field: trText(lang, field.label) });
  return trText(lang, message);
}

function Field({ field, value, error, onChange }: { field: FieldDef; value: string; error?: string; onChange(value: string): void }) {
  const { t, lang } = useT();
  const id = `acct-${field.key}`;
  const describedBy = [field.hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    required: field.required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    autoComplete: field.autoComplete,
  } as const;
  return (
    <div className="field">
      <label htmlFor={id}>
        {trText(lang, field.label)}
        {!field.required && <span className="muted small"> {t('form.optional')}</span>}
      </label>
      {field.kind === 'select' ? (
        <select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('form.choose')}</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {trText(lang, option)}
            </option>
          ))}
        </select>
      ) : field.kind === 'textarea' ? (
        <textarea {...common} rows={3} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          {...common}
          type={field.kind === 'number' ? 'text' : field.kind}
          inputMode={field.kind === 'number' ? 'numeric' : field.kind === 'tel' ? 'tel' : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint && (
        <p className="hint" id={`${id}-hint`}>
          {trText(lang, field.hint)}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {translateError(lang, t, field, error)}
        </p>
      )}
    </div>
  );
}

/** Create (/accounts/new?type=…) or edit (/accounts/:id) an account. */
export default function AccountForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { accounts, createAccount, updateAccount, deleteAccount, backend } = useSession();
  const editing = id ? accounts.find((a) => a.id === id) ?? null : null;
  const [type, setType] = useState<AccountType | null>(editing?.type ?? (params.get('type') as AccountType | null));
  const [values, setValues] = useState<Record<string, string>>(editing?.details ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(Boolean(editing));
  const [consentError, setConsentError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { t } = useT();
  const typeName = (value: AccountType) => t(`acct.${value}` as MessageKey);

  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setValues(editing.details);
    }
  }, [editing]);

  const fields = useMemo(() => (type ? visibleFields(type, values) : []), [type, values]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!type) return;
    const found = validateAccount(type, values);
    setErrors(found);
    setConsentError(!consent);
    const firstBad = fields.find((f) => found[f.key]);
    if (firstBad || !consent) {
      document.getElementById(firstBad ? `acct-${firstBad.key}` : 'acct-consent')?.focus();
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      if (editing) await updateAccount(editing, values);
      else await createAccount(type, values);
      navigate(editing ? '/accounts' : '/', { replace: true });
    } catch (cause) {
      setServerError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (id && !editing) {
    return (
      <>
        <h1>{t('form.notFound')}</h1>
        <Link className="btn" to="/accounts">
          {t('form.back')}
        </Link>
      </>
    );
  }

  if (!type) {
    return (
      <>
        <h1>{t('form.addTitle')}</h1>
        <p className="lede">{t('form.addLede')}</p>
        <div className="type-cards">
          {ACCOUNT_TYPES.map((option) => (
            <button key={option.type} type="button" className="type-card" onClick={() => setType(option.type)}>
              <span className="type-icon" aria-hidden="true">
                {option.icon}
              </span>
              <span className="type-label">{typeName(option.type)}</span>
              <span className="type-desc">{t(`acct.${option.type}.desc` as MessageKey)}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h1>{editing ? t('form.editTitle', { name: editing.displayName }) : t('form.newTitle', { type: typeName(type) })}</h1>
      <p className="lede">
        {t(type === 'individual' ? 'form.ledeIndividual' : type === 'hospital' ? 'form.ledeHospital' : 'form.ledeOrg')}
      </p>

      <form className="card account-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-grid">
          {fields.map((field) => (
            <Field
              key={field.key}
              field={field}
              value={values[field.key] ?? ''}
              error={errors[field.key]}
              onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </div>

        <label className="consent" htmlFor="acct-consent">
          <input
            id="acct-consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={consentError && !consent ? true : undefined}
          />
          <span>
            {(() => {
              const [before, after] = t('form.consent').split('{link}');
              return (
                <>
                  {before}
                  <Link to="/privacy">{t('form.privacyLink')}</Link>
                  {after}
                </>
              );
            })()}
            {type === 'individual' && ` ${t('form.consentHearing')}`}
          </span>
        </label>
        {consentError && !consent && <p className="field-error">{t('form.consentNeeded')}</p>}

        {serverError && (
          <p className="notice error" role="alert">
            {serverError}
          </p>
        )}

        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? t('pw.saving') : editing ? t('form.save') : t('form.create')}
          </button>
          <Link className="btn" to={editing || accounts.length > 0 ? '/accounts' : '/welcome'}>
            {t('form.cancel')}
          </Link>
          {editing && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (!confirm(t('form.deleteConfirm', { name: editing.displayName }))) return;
                void deleteAccount(editing.id).then(() => navigate('/accounts', { replace: true }));
              }}
            >
              {t('form.delete')}
            </button>
          )}
        </div>
        {backend.mode === 'device' && <p className="hint">{t('form.deviceMode')}</p>}
      </form>
    </>
  );
}
