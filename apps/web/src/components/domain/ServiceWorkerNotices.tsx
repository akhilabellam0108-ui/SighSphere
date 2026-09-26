import { useEffect } from 'react';
import { SW_READY_EVENT, SW_UPDATE_EVENT, applyUpdate } from '../../lib/sw-register.js';
import { useToast } from '../../state/toast.js';

/** Turns service-worker lifecycle events into toasts. Renders nothing itself. */
export function ServiceWorkerNotices() {
  const { toast } = useToast();
  useEffect(() => {
    const onUpdate = () =>
      toast('A new version of SignSphere is ready.', {
        action: { label: 'Reload', onClick: applyUpdate },
        durationMs: 30_000,
      });
    const onReady = () => toast('SignSphere is saved on this device and will open offline.');
    window.addEventListener(SW_UPDATE_EVENT, onUpdate);
    window.addEventListener(SW_READY_EVENT, onReady);
    return () => {
      window.removeEventListener(SW_UPDATE_EVENT, onUpdate);
      window.removeEventListener(SW_READY_EVENT, onReady);
    };
  }, [toast]);
  return null;
}
