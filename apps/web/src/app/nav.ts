/**
 * Navigation config — the single source of truth for what appears in the bottom tabs,
 * the tablet rail and the desktop sidebar. Routes live in App.tsx; every `to` here must
 * exist there (routes.test.ts checks it).
 */

import type { IconName } from '../components/ui/index.js';

export interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the tablet rail. */
  short?: string;
  icon: IconName;
  /** Path prefixes that mark this item as current, in addition to `to`. */
  match?: string[];
  tone?: 'sos';
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const TABS: readonly NavItem[] = [
  { to: '/home', label: 'Home', icon: 'home', match: ['/translate'] },
  { to: '/learn', label: 'Learn', icon: 'learn' },
  { to: '/community', label: 'Community', icon: 'community' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

export const SIDEBAR: readonly NavGroup[] = [
  { items: [{ to: '/home', label: 'Home', icon: 'home' }] },
  {
    label: 'Translate',
    items: [
      { to: '/translate/text-to-sign', label: 'Text → Sign', short: 'Text', icon: 'keyboard' },
      { to: '/translate/voice-to-sign', label: 'Voice → Sign', short: 'Voice', icon: 'mic' },
      { to: '/translate/sign-to-text', label: 'Sign → Text', short: 'Sign', icon: 'camera' },
      { to: '/translate/sign-to-voice', label: 'Sign → Voice', short: 'Speak', icon: 'volume' },
      { to: '/translate/conversation', label: 'Live Conversation', short: 'Live', icon: 'conversation' },
    ],
  },
  {
    label: 'Explore',
    items: [
      { to: '/learn', label: 'Learning Hub', short: 'Learn', icon: 'learn' },
      { to: '/record', label: 'Record signs', short: 'Record', icon: 'record' },
      { to: '/community', label: 'Community', icon: 'community' },
      { to: '/accessibility', label: 'Accessibility Tools', short: 'Access', icon: 'accessibility' },
    ],
  },
];

export const SIDEBAR_FOOTER: readonly NavItem[] = [
  { to: '/emergency', label: 'Emergency', short: 'SOS', icon: 'sos', tone: 'sos' },
  { to: '/profile', label: 'Profile', icon: 'profile' },
];

/** Old flat URLs → new locations, so bookmarks and shared links keep working. */
export const LEGACY_REDIRECTS: Readonly<Record<string, string>> = {
  '/text-to-sign': '/translate/text-to-sign',
  '/voice-to-sign': '/translate/voice-to-sign',
  '/sign-to-text': '/translate/sign-to-text',
  '/sign-to-voice': '/translate/sign-to-voice',
  '/profile/teach': '/record',
  '/settings': '/profile/settings',
};

export function isActive(item: NavItem, pathname: string): boolean {
  const prefixes = [item.to, ...(item.match ?? [])];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Every navigable path, for tests. */
export function allNavPaths(): string[] {
  return [
    ...new Set([
      ...TABS.map((item) => item.to),
      ...SIDEBAR.flatMap((group) => group.items.map((item) => item.to)),
      ...SIDEBAR_FOOTER.map((item) => item.to),
    ]),
  ];
}
