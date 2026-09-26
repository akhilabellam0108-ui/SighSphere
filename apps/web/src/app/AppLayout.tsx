import { Suspense, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Brand, SOSLink } from '../components/domain/index.js';
import { NotificationsButton } from '../components/domain/Notifications.js';
import { Avatar, Badge, Icon, LoadingState } from '../components/ui/index.js';
import { useOnline } from '../hooks/useDevice.js';
import { useAuth } from '../state/auth.js';
import { SIDEBAR, SIDEBAR_FOOTER, TABS, isActive, type NavItem } from './nav.js';

function SideLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const current = isActive(item, pathname);
  return (
    <li>
      <Link
        to={item.to}
        className={['nav-link', item.tone === 'sos' ? 'sos' : ''].filter(Boolean).join(' ')}
        aria-current={current ? 'page' : undefined}
      >
        <Icon name={item.icon} />
        <span className="nav-label-full">{item.label}</span>
        <span className="nav-label-short" aria-hidden="true">
          {item.short ?? item.label}
        </span>
      </Link>
    </li>
  );
}

/**
 * The app shell: sidebar/rail (tablet+), app bar, content, bottom tabs (phone).
 * Also owns focus management — after every navigation, focus moves to the new page's <h1>
 * so screen-reader users hear where they are, and the page scrolls to the top.
 */
export default function AppLayout() {
  const { pathname } = useLocation();
  const { session } = useAuth();
  const online = useOnline();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    // Wait for lazy screens to render their heading.
    let tries = 0;
    const focusHeading = () => {
      const heading = mainRef.current?.querySelector<HTMLElement>('h1');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      } else if (tries < 20) {
        tries += 1;
        window.setTimeout(focusHeading, 50);
      } else {
        mainRef.current?.focus({ preventScroll: true });
      }
    };
    const timer = window.setTimeout(focusHeading, 30);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Sidebar">
        <Brand />
        <nav aria-label="Main">
          {SIDEBAR.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label && <p className="nav-group-label">{group.label}</p>}
              <ul className="nav-list">
                {group.items.map((item) => (
                  <SideLink key={item.to} item={item} pathname={pathname} />
                ))}
              </ul>
            </div>
          ))}
          <div className="sidebar-footer">
            <p className="nav-group-label">You</p>
            <ul className="nav-list">
              {SIDEBAR_FOOTER.map((item) => (
                <SideLink key={item.to} item={item} pathname={pathname} />
              ))}
            </ul>
          </div>
        </nav>
      </aside>

      <div className="shell-main">
        <header className="appbar glass">
          <div className="appbar-title">
            <Brand className="mobile-only" />
            {!online && (
              <Badge tone="warning" icon="wifi-off">
                Offline
              </Badge>
            )}
          </div>
          <div className="appbar-actions">
            <NotificationsButton />
            <SOSLink compact />
            {session && (
              <Link to="/profile" className="appbar-avatar" aria-label={`Profile: ${session.name}`}>
                <Avatar name={session.name} size="sm" />
              </Link>
            )}
          </div>
        </header>

        <main id="main" ref={mainRef} tabIndex={-1}>
          <Suspense fallback={<LoadingState label="Loading…" />}>
            <div className="page" key={pathname}>
              <Outlet />
            </div>
          </Suspense>
        </main>

        {/*
          Scope limits stated in the product, not just in the report. A user in a hospital
          waiting room needs to know this before they rely on it (PLAN.md §10).
        */}
        <footer className="disclaimer">
          SignSphere is a learning and communication aid, not a replacement for a qualified ISL
          interpreter. Do not rely on it for medical, legal, or emergency interpretation. Sign
          recognition covers a limited vocabulary and makes mistakes.
        </footer>
      </div>

      <nav className="bottom-nav glass" aria-label="Main">
        {TABS.map((item) => {
          const current = isActive(item, pathname);
          return (
            <Link key={item.to} to={item.to} aria-current={current ? 'page' : undefined}>
              <Icon name={item.icon} size="lg" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
