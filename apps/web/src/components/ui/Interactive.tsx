import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { IconButton } from './Button.js';

// ------------------------------------------------------------------------------ Tabs

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface TabsProps<T extends string> {
  label: string;
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange(value: T): void;
  /** id prefix used to link tabs to panels: panel id is `${idPrefix}-panel`. */
  idPrefix: string;
}

/** WAI-ARIA tabs with roving tabindex and arrow/Home/End keys. */
export function Tabs<T extends string>({ label, items, value, onChange, idPrefix }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === value);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.id);
    refs.current[next]?.focus();
  }

  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, i) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[i] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count !== undefined && <span className="count"> {item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, activeId, children }: { idPrefix: string; activeId: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${activeId}`} tabIndex={0}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------------ Segmented

export interface SegmentedProps<T extends string> {
  legend: string;
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange(value: T): void;
  hideLegend?: boolean;
}

/** A radio group styled as a segmented control. Native radios = native keyboard support. */
export function Segmented<T extends string>({ legend, options, value, onChange, hideLegend }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className={hideLegend ? 'sr-only' : 'small'} style={hideLegend ? undefined : { fontWeight: 600, marginBottom: '0.35rem' }}>
        {legend}
      </legend>
      <div className="segmented">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              {option.icon}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ----------------------------------------------------------------------------- Modal

export interface ModalProps {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  fullScreen?: boolean;
  /** Visually hide the title (it remains the dialog's accessible name). */
  hideTitle?: boolean;
}

/**
 * Native <dialog> with showModal(): the browser handles the focus trap, Escape, inert
 * background and top-layer stacking — more robust than any hand-rolled modal.
 */
export function Modal({ open, onClose, title, children, footer, fullScreen, hideTitle }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={['modal', fullScreen ? 'full' : ''].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself, outside the content) closes.
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <>
          <div className="modal-head">
            <h2 id={titleId} className={hideTitle ? 'sr-only' : undefined}>
              {title}
            </h2>
            {hideTitle && <span className="spacer" />}
            <IconButton icon="close" label="Close" onClick={onClose} />
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
