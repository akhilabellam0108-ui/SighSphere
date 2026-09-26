import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon, { type IconName } from './Icon.js';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'soft'
  | 'ghost'
  | 'gradient'
  | 'danger'
  | 'sos'
  | 'white'
  | 'on-dark';

interface CommonProps {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined;
    href?: undefined;
  };
type AsLink = CommonProps & {
  to: string;
  href?: undefined;
  state?: unknown;
  replace?: boolean;
  'aria-label'?: string;
  onClick?: () => void;
};
type AsAnchor = CommonProps & {
  href: string;
  to?: undefined;
  target?: string;
  rel?: string;
  'aria-label'?: string;
  onClick?: () => void;
};

export type ButtonProps = AsButton | AsLink | AsAnchor;

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  block,
  className,
}: Pick<CommonProps, 'variant' | 'size' | 'block' | 'className'>): string {
  return [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Content({ icon, iconRight, loading, children }: CommonProps) {
  return (
    <>
      {loading ? <Icon name="spinner" className="spin" /> : icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </>
  );
}

/** One button for the whole app. Renders a <button>, a router <Link>, or an <a>. */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const { variant, size, icon, iconRight, block, loading, className, children } = props;
  const classes = buttonClass({ variant, size, block, className });
  const content = (
    <Content icon={icon} iconRight={iconRight} loading={loading}>
      {children}
    </Content>
  );

  if (props.to !== undefined) {
    return (
      <Link
        to={props.to}
        state={props.state}
        replace={props.replace}
        className={classes}
        aria-label={props['aria-label']}
        onClick={props.onClick}
      >
        {content}
      </Link>
    );
  }
  if (props.href !== undefined) {
    return (
      <a
        href={props.href}
        target={props.target}
        rel={props.rel}
        className={classes}
        aria-label={props['aria-label']}
        onClick={props.onClick}
      >
        {content}
      </a>
    );
  }

  const {
    variant: _v,
    size: _s,
    icon: _i,
    iconRight: _ir,
    block: _b,
    loading: _l,
    className: _c,
    children: _ch,
    to: _to,
    href: _href,
    type = 'button',
    disabled,
    ...rest
  } = props;
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
});

export default Button;

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  icon: IconName;
  /** Required: an icon-only button has no other accessible name. */
  label: string;
  variant?: ButtonVariant;
  dot?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', dot, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['btn', `btn-${variant}`, 'icon-btn', className ?? ''].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
      {dot && <span className="dot" aria-hidden="true" />}
    </button>
  );
});
