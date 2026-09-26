import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../state/auth.js';

/**
 * Screens behind this need a session — a guest session counts. Emergency and Not Found
 * deliberately sit outside it: nobody should swipe through onboarding in an emergency.
 */
export function RequireSession() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/welcome" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

export function RootRedirect() {
  const { session } = useAuth();
  return <Navigate to={session ? '/home' : '/welcome'} replace />;
}

/** Where to go after signing in: back to what the user originally opened, if anything. */
export function useReturnTo(fallback = '/home'): string {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    if (!['/welcome', '/onboarding', '/auth'].some((path) => from.startsWith(path))) return from;
  }
  return fallback;
}
