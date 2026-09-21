import type { HTMLAttributes } from 'react';
import { cx } from './utils.js';

export function NavGroup({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cx('agentsam-nav__group', className)} {...props} />;
}

export function NavGroupLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx('agentsam-nav__group-label', className)} {...props} />;
}
