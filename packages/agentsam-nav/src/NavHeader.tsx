import type { HTMLAttributes } from 'react';
import { cx } from './utils.js';

export function NavHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('agentsam-nav__header', className)} {...props} />;
}
