import type { ElementType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon, { type IconName } from './Icon.js';

// ------------------------------------------------------------------------------ Card

export interface CardProps {
  as?: ElementType;
  variant?: 'default' | 'glass' | 'soft' | 'outline' | 'inner' | 'hero';
  className?: string;
  children?: ReactNode;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function Card({ as: Tag = 'div', variant = 'default', className, children, ...rest }: CardProps) {
  const classes = ['card', variant !== 'default' ? `card-${variant}` : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}

// ----------------------------------------------------------------------- FeatureCard

export type Tone = 'indigo' | 'cyan' | 'teal' | 'amber' | 'red' | 'green' | 'gradient';

export function IconTile({ icon, tone = 'indigo', pair }: { icon: IconName; tone?: Tone; pair?: IconName }) {
  const toneClass = tone === 'indigo' ? '' : tone;
  return (
    <span className={['icon-tile', toneClass, pair ? 'pair' : ''].filter(Boolean).join(' ')} aria-hidden="true">
      <Icon name={icon} />
      {pair && <Icon name={pair} />}
    </span>
  );
}

export interface FeatureCardProps {
  to: string;
  icon: IconName;
  pairIcon?: IconName;
  tone?: Tone;
  title: string;
  description: string;
  action: string;
  badge?: ReactNode;
  headingLevel?: 'h2' | 'h3';
}

/** A whole-card link. The heading is the accessible name; the CTA text is visual. */
export function FeatureCard({
  to,
  icon,
  pairIcon,
  tone,
  title,
  description,
  action,
  badge,
  headingLevel: Heading = 'h3',
}: FeatureCardProps) {
  return (
    <Link to={to} className="card card-interactive feature-card">
      <span className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <IconTile icon={icon} tone={tone} pair={pairIcon} />
        {badge}
      </span>
      <Heading>{title}</Heading>
      <p>{description}</p>
      <span className="feature-cta" aria-hidden="true">
        {action}
        <Icon name="arrow-right" />
      </span>
    </Link>
  );
}

// ------------------------------------------------------------------------ PageHeader

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}

/**
 * Every screen's <h1>. AppLayout moves focus to the first h1 after navigation, so
 * screen-reader users hear the new page title — keep exactly one h1 per screen.
 */
export function PageHeader({ title, subtitle, eyebrow, back, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      {back && (
        <Link to={back.to} className="btn btn-ghost icon-btn" aria-label={back.label} title={back.label}>
          <Icon name="back" />
        </Link>
      )}
      <div className="page-header-text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 tabIndex={-1}>{title}</h1>
        {subtitle && <p className="lede">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

// --------------------------------------------------------------------------- Section

export interface SectionProps {
  title: string;
  id?: string;
  action?: { to: string; label: string };
  headingLevel?: 'h2' | 'h3';
  children: ReactNode;
  className?: string;
  description?: ReactNode;
}

export function Section({
  title,
  id,
  action,
  headingLevel: Heading = 'h2',
  children,
  className,
  description,
}: SectionProps) {
  const headingId = id ?? `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className={['section', className ?? ''].filter(Boolean).join(' ')} aria-labelledby={headingId}>
      <div className="section-head">
        <Heading id={headingId}>{title}</Heading>
        {action && (
          <Link to={action.to}>
            {action.label}
            <Icon name="chevron" />
          </Link>
        )}
      </div>
      {description && <p className="muted small" style={{ marginTop: '-0.5rem' }}>{description}</p>}
      {children}
    </section>
  );
}

// ----------------------------------------------------------------------------- Badge

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'demo' | 'on-dark';
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={['badge-pill', tone !== 'neutral' ? tone : ''].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------- Avatar

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  size = 'md',
  tone,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 1 | 2 | 3;
}) {
  return (
    <span
      className={['avatar', size !== 'md' ? size : '', tone ? `tone-${tone}` : ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

// ------------------------------------------------------------------------------ Stat

export function Stat({ value, label, icon, tone }: { value: ReactNode; label: string; icon?: IconName; tone?: Tone }) {
  if (icon) {
    return (
      <div className="stat-tile">
        <IconTile icon={icon} tone={tone} />
        <div className="stat">
          <div className="value">{value}</div>
          <div className="label">{label}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

// ----------------------------------------------------------------------- ProgressBar

export function ProgressBar({ value, max, label, showLabel = true }: { value: number; max: number; label: string; showLabel?: boolean }) {
  const pct = max <= 0 ? 0 : Math.round((Math.min(value, max) / max) * 100);
  return (
    <div>
      {showLabel && (
        <div className="progress-label">
          <span>{label}</span>
          <span>
            {value}/{max}
          </span>
        </div>
      )}
      <div
        className="progress"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={`${value} of ${max}`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- Notice

export function Notice({
  tone = 'info',
  title,
  children,
  role,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div className={['notice', tone !== 'info' ? tone : ''].filter(Boolean).join(' ')} role={role}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}
