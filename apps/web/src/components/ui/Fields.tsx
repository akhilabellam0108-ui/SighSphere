import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldShell {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  hideLabel?: boolean;
}

function describedBy(hintId: string, errorId: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');
  return ids || undefined;
}

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  id,
  ...input
}: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  return (
    <div className="field">
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <input
        id={fieldId}
        type="text"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId, hint, error)}
        {...input}
      />
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  hideLabel,
  id,
  ...input
}: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  return (
    <div className="field">
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hintId, errorId, hint, error)}
        {...input}
      />
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  hideLabel,
  id,
  children,
  ...select
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  return (
    <div className="field">
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <select id={fieldId} aria-describedby={hint ? hintId : undefined} {...select}>
        {children}
      </select>
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function SwitchField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <span>
        {label}
        {hint && (
          <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  valueText,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  valueText?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
