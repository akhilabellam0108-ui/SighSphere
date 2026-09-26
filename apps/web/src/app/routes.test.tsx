/**
 * Route smoke test: every screen renders (server-side, no browser) inside the real
 * providers, with exactly one <h1>, and every navigation link points at a real route.
 * Catches broken imports, render-time crashes and heading regressions before a browser does.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Minimal browser globals: providers read localStorage while rendering; speech feature
// detection reads window. Effects never run under renderToString.
beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  });
  vi.stubGlobal('window', globalThis);
  // A guest session, as if the user had tapped "Continue as Guest".
  store.set('signsphere.session.v1', JSON.stringify({ kind: 'guest', name: 'Guest', createdAt: 1 }));
});

type Screen = { path: string; pattern?: string; load: () => Promise<{ default: ComponentType<never> }>; props?: object };

const SCREENS: Screen[] = [
  { path: '/welcome', load: () => import('../screens/entry/Splash.js') },
  { path: '/onboarding', load: () => import('../screens/entry/Onboarding.js') },
  { path: '/auth', load: () => import('../screens/entry/Auth.js') },
  { path: '/home', load: () => import('../screens/home/Home.js') },
  { path: '/translate/text-to-sign', load: () => import('../screens/translate/TextToSign.js'), props: { mode: 'text' } },
  { path: '/translate/voice-to-sign', load: () => import('../screens/translate/TextToSign.js'), props: { mode: 'voice' } },
  { path: '/translate/sign-to-text', load: () => import('../screens/translate/SignToText.js'), props: { speakOutput: false } },
  { path: '/translate/sign-to-voice', load: () => import('../screens/translate/SignToText.js'), props: { speakOutput: true } },
  { path: '/translate/conversation', load: () => import('../screens/translate/Conversation.js') },
  { path: '/learn', load: () => import('../screens/learn/LearningHub.js') },
  { path: '/learn/courtesy-1', pattern: '/learn/:lessonId', load: () => import('../screens/learn/Lesson.js') },
  { path: '/learn/nope', pattern: '/learn/:lessonId', load: () => import('../screens/learn/Lesson.js') },
  { path: '/community', load: () => import('../screens/community/Community.js') },
  { path: '/emergency', load: () => import('../screens/emergency/Emergency.js') },
  { path: '/accessibility', load: () => import('../screens/accessibility/AccessibilityTools.js') },
  { path: '/profile', load: () => import('../screens/profile/Profile.js') },
  { path: '/profile/history', load: () => import('../screens/profile/History.js') },
  { path: '/profile/teach', load: () => import('../screens/profile/Teach.js') },
  { path: '/profile/settings', load: () => import('../screens/profile/Settings.js') },
  { path: '/profile/help', load: () => import('../screens/profile/Help.js') },
  { path: '/nowhere', pattern: '*', load: () => import('../screens/NotFound.js') },
];

async function render(screen: Screen): Promise<string> {
  const [{ default: Component }, { SettingsProvider }, { AuthProvider }, { ToastProvider }] = await Promise.all([
    screen.load(),
    import('../state/settings.js'),
    import('../state/auth.js'),
    import('../state/toast.js'),
  ]);
  const Any = Component as ComponentType<Record<string, unknown>>;
  return renderToString(
    <MemoryRouter initialEntries={[screen.path]}>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path={screen.pattern ?? screen.path} element={<Any {...(screen.props ?? {})} />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </MemoryRouter>,
  );
}

describe('every screen renders', () => {
  for (const screen of SCREENS) {
    it(`${screen.path} renders with exactly one h1`, async () => {
      const html = await render(screen);
      expect(html.length).toBeGreaterThan(200);
      expect(html.match(/<h1[\s>]/g)?.length ?? 0).toBe(1);
    });
  }

  it('labels demo community content as demo', async () => {
    const html = await render(SCREENS.find((s) => s.path === '/community') as Screen);
    expect(html).toContain('Demo content.');
  });

  it('keeps the interpreter disclaimer on the emergency screen', async () => {
    const html = await render(SCREENS.find((s) => s.path === '/emergency') as Screen);
    expect(html).toContain('Not an interpreting service');
    expect(html).toContain('tel:112');
  });
});

describe('navigation', () => {
  it('points every nav item at a route defined in App.tsx', async () => {
    const { allNavPaths, LEGACY_REDIRECTS } = await import('./nav.js');
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    const declared = new Set([...app.matchAll(/path="([^"]+)"/g)].map((match) => match[1]));
    const exists = (path: string) =>
      declared.has(path) || (path.startsWith('/translate/') && declared.has(path.slice('/translate/'.length)));
    for (const path of allNavPaths()) expect(exists(path), path).toBe(true);
    for (const target of Object.values(LEGACY_REDIRECTS)) expect(exists(target), target).toBe(true);
  });
});
