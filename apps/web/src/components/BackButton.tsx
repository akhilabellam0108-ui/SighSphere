import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** True when the app itself has a previous screen to return to (not another website). */
function hasAppHistory(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

/**
 * Returns a function that goes to the previous screen, or to `fallback` when the user
 * opened this screen directly (from a link, a QR code or a fresh app start).
 */
export function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  return useCallback(() => {
    if (hasAppHistory()) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}

export default function BackButton({ fallback = '/', onBack }: { fallback?: string; onBack?: () => void }) {
  const goBack = useGoBack(fallback);
  return (
    <button type="button" className="back-btn" onClick={onBack ?? goBack} aria-label="Go back">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="back-btn-label">Back</span>
    </button>
  );
}

/**
 * Android's own back button / back gesture inside the installed app. Without this the
 * app would close instead of returning to the previous screen.
 * On the first screens (Home, Welcome) it leaves the app, like any Android app.
 */
export function useNativeBackButton(rootPaths: readonly string[], currentPath: string, fallback = '/') {
  const goBack = useGoBack(fallback);
  useEffect(() => {
    let removed = false;
    let remove: (() => void) | undefined;
    void (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', () => {
        // Close an open menu first, like a native app would.
        const openMenu = document.querySelector<HTMLDetailsElement>('details.account-menu[open]');
        if (openMenu) {
          openMenu.open = false;
          return;
        }
        const moreButton = document.querySelector<HTMLButtonElement>('.nav-more[aria-expanded="true"]');
        if (moreButton) {
          moreButton.click();
          return;
        }
        if (rootPaths.includes(currentPath)) void App.exitApp();
        else goBack();
      });
      if (removed) void handle.remove();
      else remove = () => void handle.remove();
    })();
    return () => {
      removed = true;
      remove?.();
    };
  }, [rootPaths, currentPath, goBack]);
}
