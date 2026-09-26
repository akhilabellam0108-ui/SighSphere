/**
 * Settings + progress context.
 *
 * Accessibility settings are applied as data attributes on <html> so CSS owns the
 * presentation (see styles.css :root[data-contrast='high']). Keeping it in CSS rather than
 * inline styles means the whole app responds, including anything added later.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PROGRESS,
  DEFAULT_SETTINGS,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  type Progress,
  type Settings,
} from '../lib/storage.js';

interface SettingsContextValue {
  settings: Settings;
  update(patch: Partial<Settings>): void;
  progress: Progress;
  setProgress(next: Progress): void;
  resetAll(): void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [progress, setProgressState] = useState<Progress>(() => loadProgress());

  useEffect(() => {
    saveSettings(settings);
    const root = document.documentElement;
    root.dataset['contrast'] = settings.highContrast ? 'high' : 'normal';
    root.dataset['reduceMotion'] = String(settings.reduceMotion);
    root.style.setProperty('--font-scale', String(settings.fontScale));
  }, [settings]);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
  }, []);

  const setProgress = useCallback((next: Progress) => {
    setProgressState(next);
  }, []);

  const resetAll = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setProgressState(DEFAULT_PROGRESS);
  }, []);

  const value = useMemo(
    () => ({ settings, update, progress, setProgress, resetAll }),
    [settings, update, progress, setProgress, resetAll],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>');
  return context;
}
