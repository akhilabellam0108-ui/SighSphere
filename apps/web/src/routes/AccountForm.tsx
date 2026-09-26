import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ACCOUNT_TYPES, typeLabel, validateAccount, visibleFields, type AccountType, type FieldDef } from '../lib/accountTypes.js';
import { friendlyError } from '../lib/backend.js';
import { useSession } from '../state/session.js';

function Field({ field, value, error, onChange }: { field: FieldDef; value: string; error?: string; onChange(value: string): void }) {
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
        {field.label}
        {!field.required && <span className="muted small"> (optional)</span>}
      </label>
      {field.kind === 'select' ? (
        <select {...common} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
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
          {field.hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
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
        <h1>Account not found</h1>
        <Link className="btn" to="/accounts">
          Back to accounts
        </Link>
      </>
    );
  }

  if (!type) {
    return (
      <>
        <h1>Add an account</h1>
        <p className="lede">One login can hold several accounts — for you, your hospital, or your organisation.</p>
        <div className="type-cards">
          {ACCOUNT_TYPES.map((option) => (
            <button key={option.type} type="button" className="type-card" onClick={() => setType(option.type)}>
              <span className="type-icon" aria-hidden="true">
                {option.icon}
              </span>
              <span className="type-label">{option.label}</span>
              <span className="type-desc">{option.description}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h1>{editing ? `Edit ${editing.displayName}` : `New ${typeLabel(type)} account`}</h1>
      <p className="lede">
        {type === 'individual'
          ? 'Tell us a little about you so SignSphere can set sensible defaults.'
          : `These details identify your ${type === 'hospital' ? 'hospital' : 'organisation'}. Accounts start as “unverified” until SignSphere checks the registration.`}
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
            I confirm these details are accurate and I agree to how SignSphere stores them, described in the{' '}
            <Link to="/privacy">privacy notice</Link>.
            {type === 'individual' && ' My hearing information is kept private to this account.'}
          </span>
        </label>
        {consentError && !consent && <p className="field-error">Please confirm to continue.</p>}

        {serverError && (
          <p className="notice error" role="alert">
            {serverError}
          </p>
        )}

        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
          </button>
          <Link className="btn" to={editing || accounts.length > 0 ? '/accounts' : '/welcome'}>
            Cancel
          </Link>
          {editing && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (!confirm(`Delete “${editing.displayName}” and its history? This cannot be undone.`)) return;
                void deleteAccount(editing.id).then(() => navigate('/accounts', { replace: true }));
              }}
            >
              Delete account
            </button>
          )}
        </div>
        {backend.mode === 'device' && <p className="hint">This-device mode: saved in this browser only.</p>}
      </form>
    </>
  );
}
