import type { HTMLAttributes } from 'react';
import { cx } from './utils.js';

export function NavFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('agentsam-nav__footer', className)} {...props} />;
}
