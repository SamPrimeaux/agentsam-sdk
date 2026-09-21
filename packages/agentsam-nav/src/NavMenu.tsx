import type { ButtonHTMLAttributes, ComponentType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './utils.js';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export function NavMenu({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx('agentsam-nav__menu', className)} {...props} />;
}

export function NavMenuItem({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={cx('agentsam-nav__menu-item', className)} {...props} />;
}

export type NavMenuButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  // Deliberately structural: applications commonly use a different React
  // type package instance for icon libraries than this source package.
  icon?: unknown;
  active?: boolean;
  itemId?: string;
  children: ReactNode;
};

export function NavMenuButton({ icon: Icon, active = false, itemId, className, children, ...props }: NavMenuButtonProps) {
  const IconComponent = Icon as Icon | undefined;
  return (
    <button
      type="button"
      data-nav-item-id={itemId}
      data-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      className={cx('agentsam-nav__menu-button', className)}
      {...props}
    >
      {IconComponent ? <IconComponent className="agentsam-nav__menu-icon" aria-hidden /> : null}
      <span className="agentsam-nav__menu-label">{children}</span>
    </button>
  );
}

export function NavMenuSub({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx('agentsam-nav__menu-sub', className)} {...props} />;
}

export type NavMenuSubButtonProps = {
  href?: string;
  active?: boolean;
  className?: string;
  children?: unknown;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
};

export function NavMenuSubButton({ active = false, className, children, ...props }: NavMenuSubButtonProps) {
  return <a data-active={active ? 'true' : undefined} aria-current={active ? 'page' : undefined} className={cx('agentsam-nav__menu-sub-button', className)} {...props}>{children as ReactNode}</a>;
}

export function NavMenuChevron({ className }: { className?: string }) {
  return (
    <svg className={cx('agentsam-nav__chevron', className)} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
