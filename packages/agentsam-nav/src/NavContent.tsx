import type { HTMLAttributes } from 'react';
import { cx } from './utils.js';

export function NavContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('agentsam-nav__content', className)} {...props} />;
}
