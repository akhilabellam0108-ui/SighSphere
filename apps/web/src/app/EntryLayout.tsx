import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LoadingState } from '../components/ui/index.js';

/** Chrome-less layout for Splash, Onboarding and Auth. */
export default function EntryLayout() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Outlet />
    </Suspense>
  );
}
