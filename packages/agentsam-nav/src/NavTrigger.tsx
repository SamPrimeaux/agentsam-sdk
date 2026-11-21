import type { ButtonHTMLAttributes } from 'react';
import { useNav } from './NavProvider.js';
import { cx } from './utils.js';

export function NavTrigger({ className, onClick, 'aria-label': ariaLabel = 'Toggle navigation', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, toggle } = useNav();
  return (
    <button type="button" aria-label={ariaLabel} aria-expanded={open} className={cx('agentsam-nav__trigger', className)} {...props} onClick={(event) => { toggle(); onClick?.(event); }}>
      <span className="agentsam-nav__trigger-morph" aria-hidden="true">
        <span /><span /><span />
      </span>
      <span className="agentsam-nav__trigger-help" aria-hidden="true">Navigation</span>
    </button>
  );
}
