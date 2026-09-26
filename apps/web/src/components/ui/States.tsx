import { type ReactNode } from 'react';
import Icon, { type IconName } from './Icon.js';

export interface StateProps {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  bare?: boolean;
  headingLevel?: 'h2' | 'h3';
}

export function EmptyState({ icon = 'sparkles', title, children, actions, compact, bare, headingLevel: H = 'h3' }: StateProps) {
  return (
    <div className={['state', compact ? 'compact' : '', bare ? 'bare' : ''].filter(Boolean).join(' ')}>
      <span className="icon-tile" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <H>{title}</H>
      {children && <p>{children}</p>}
      {actions && <div className="btn-group">{actions}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', children, actions, compact }: Partial<StateProps>) {
  return (
    <div className={['state', 'error', compact ? 'compact' : ''].filter(Boolean).join(' ')} role="alert">
      <span className="icon-tile red" aria-hidden="true">
        <Icon name="alert" />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="btn-group">{actions}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', compact = true }: { label?: string; compact?: boolean }) {
  return (
    <div className={['state', 'bare', compact ? 'compact' : ''].filter(Boolean).join(' ')} role="status">
      <Icon name="spinner" size="xl" className="spin" />
      <p>{label}</p>
    </div>
  );
}

/** For features the product narrative promises but the code does not deliver yet. */
export function ComingSoon({ icon = 'clock', title, children, actions }: StateProps) {
  return (
    <div className="state soon compact">
      <span className="icon-tile gradient" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="badge-pill accent">Coming soon</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="btn-group">{actions}</div>}
    </div>
  );
}

/** Any screen that shows sample data must show this. Never remove it while data is fake. */
export function DemoBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="demo-banner" role="note">
      <Icon name="info" />
      <p>
        <strong>Demo content.</strong>{' '}
        {children ??
          'Everything below is sample data to show how this feature will work. The people, posts and events are fictional.'}
      </p>
    </div>
  );
}
