/**
 * Toasts: short, non-blocking confirmations ("Saved", "Copied"). Announced through a polite
 * live region so screen-reader users get the same feedback. Never use a toast for anything
 * the user must act on — errors that block a task belong inline, next to the task.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '../components/ui/Button.js';

interface ToastItem {
  id: number;
  message: string;
  action?: { label: string; onClick(): void };
  durationMs: number;
}

interface ToastContextValue {
  toast(message: string, options?: { action?: ToastItem['action']; durationMs?: number }): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue['toast']>(
    (message, options) => {
      const id = nextId.current++;
      const durationMs = options?.durationMs ?? (options?.action ? 10_000 : 4_000);
      setItems((current) => [...current.slice(-2), { id, message, action: options?.action, durationMs }]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((item) => (
          <div className="toast" key={item.id}>
            <p>{item.message}</p>
            {item.action && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
            <IconButton icon="close" label="Dismiss" onClick={() => dismiss(item.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
