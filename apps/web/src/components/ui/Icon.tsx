import { createElement } from 'react';
import { ICONS, type IconName } from './icons.js';

export type { IconName };

export interface IconProps {
  name: IconName;
  /** 'lg' = 24px, 'xl' = 32px; default 20px. */
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  /**
   * Icons are decorative by default (aria-hidden). Pass a label only when the icon is the
   * sole content of something meaningful and no visible text says the same thing.
   */
  label?: string;
}

export default function Icon({ name, size = 'md', className, label }: IconProps) {
  const classes = ['icon', size !== 'md' ? size : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {ICONS[name].map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  );
}
