import type { ButtonHTMLAttributes } from 'react';
import { useNav } from './NavProvider.js';
import { cx } from './utils.js';

export function NavTrigger({ className, 'aria-label': ariaLabel = 'Toggle navigation', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, toggle } = useNav();
  return (
    <button type="button" aria-label={ariaLabel} aria-expanded={open} className={cx('agentsam-nav__trigger', className)} onClick={toggle} {...props}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
