/**
 * In-app notices. These are NOT push notifications — they are reminders computed from what
 * is on this device right now, shown when the user opens the bell.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOnline } from '../../hooks/useDevice.js';
import { sampleCounts } from '../../lib/storage.js';
import { useAuth } from '../../state/auth.js';
import { useSettings } from '../../state/settings.js';
import { Icon, IconButton, Modal, type IconName } from '../ui/index.js';

export interface AppNotice {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  to?: string;
  action?: string;
}

export function useNotices(): AppNotice[] {
  const { progress } = useSettings();
  const { session } = useAuth();
  const online = useOnline();
  const [labels, setLabels] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    sampleCounts()
      .then((counts) => !cancelled && setLabels(Object.keys(counts).length))
      .catch(() => !cancelled && setLabels(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const notices: AppNotice[] = [];
  if (!online) {
    notices.push({
      id: 'offline',
      icon: 'wifi-off',
      title: 'You are offline',
      body: 'Translation, learning and emergency cards still work. Speech recognition needs a connection.',
    });
  }
  if (labels === 0) {
    notices.push({
      id: 'teach',
      icon: 'hand',
      title: 'Teach SignSphere your first signs',
      body: 'Sign recognition needs examples first. Record 5 takes each of 3 signs.',
      to: '/record',
      action: 'Record signs',
    });
  }
  const now = Date.now();
  const due = Object.values(progress.signs).filter((sign) => sign.dueAt > 0 && sign.dueAt <= now).length;
  if (due > 0) {
    notices.push({
      id: 'review',
      icon: 'target',
      title: `${due} sign${due === 1 ? '' : 's'} due for review`,
      body: 'Spaced review keeps signs from slipping. It takes a minute.',
      to: '/learn',
      action: 'Review',
    });
  }
  if (progress.dayStreak > 0) {
    notices.push({
      id: 'streak',
      icon: 'flame',
      title: `${progress.dayStreak}-day streak`,
      body: 'Practise today to keep it going.',
      to: '/learn',
      action: 'Practise',
    });
  }
  if (session?.kind === 'demo') {
    notices.push({
      id: 'demo',
      icon: 'info',
      title: 'You are using a demo profile',
      body: 'Accounts are not connected yet. Everything stays on this device.',
    });
  }
  return notices;
}

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const notices = useNotices();
  const actionable = notices.filter((notice) => notice.to).length;
  return (
    <>
      <IconButton
        icon="bell"
        label={actionable > 0 ? `Notifications, ${actionable} new` : 'Notifications'}
        dot={actionable > 0}
        onClick={() => setOpen(true)}
      />
      <Modal open={open} onClose={() => setOpen(false)} title="Notifications">
        {notices.length === 0 ? (
          <div className="state bare compact">
            <span className="icon-tile" aria-hidden="true">
              <Icon name="check" />
            </span>
            <h3>You are all caught up</h3>
            <p>Reminders about practice and setup will appear here.</p>
          </div>
        ) : (
          <ul className="list">
            {notices.map((notice) => (
              <li key={notice.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <span className="icon-tile" aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12 }}>
                  <Icon name={notice.icon} />
                </span>
                <div className="list-item-main">
                  <p className="list-item-title">{notice.title}</p>
                  <p className="small muted">{notice.body}</p>
                  {notice.to && (
                    <Link to={notice.to} className="small" onClick={() => setOpen(false)} style={{ fontWeight: 600 }}>
                      {notice.action ?? 'Open'}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="hint" style={{ marginTop: '1rem' }}>
          These are on-device reminders, not push notifications.
        </p>
      </Modal>
    </>
  );
}
