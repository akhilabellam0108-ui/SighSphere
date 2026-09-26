import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '../state/settings.js';

/**
 * Short vibration on key events when the user turned haptics on. navigator.vibrate is
 * unsupported on iOS Safari and most desktops — it silently does nothing there, which is
 * why haptics are only ever a supplement to a visible/announced signal, never a replacement.
 */
export function useHaptics() {
  const { settings } = useSettings();
  return useCallback(
    (pattern: number | number[] = 30) => {
      if (!settings.haptics) return;
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* unsupported */
      }
    },
    [settings.haptics],
  );
}

export function isHapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
