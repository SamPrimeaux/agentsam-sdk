import { useId, useState, type ReactNode } from 'react';
import type { MxsBrand, MxsFooterColumn, MxsLink } from './types.js';

export interface MxsHeaderProps {
  brand: MxsBrand;
  links?: MxsLink[];
  /** Right-aligned slot: theme toggle, primary CTA, etc. */
  actions?: ReactNode;
}

export function MxsHeader({ brand, links = [], actions }: MxsHeaderProps) {
  const [open, setOpen] = useState(false);
  const navId = useId();

  return (
    <header className="mxs-header">
      <a className="mxs-brand" href={brand.href ?? '#'}>
        {brand.mark ?? <span className="mxs-brand-mark" aria-hidden="true" />}
        <span>{brand.label}</span>
      </a>

      <nav id={navId} className="mxs-nav" aria-label="Primary" data-open={open}>
        {links.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
      </nav>

      <div className="mxs-header-actions">
        {actions}
        {links.length > 0 ? (
          <button
            type="button"
            className="mxs-menu-button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls={navId}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export interface MxsFooterProps {
  brand: { label: string; blurb?: string };
  columns?: MxsFooterColumn[];
  legal?: ReactNode;
}

export function MxsFooter({ brand, columns = [], legal }: MxsFooterProps) {
  return (
    <footer className="mxs-footer">
      <div className="mxs-footer-inner">
        <div className="mxs-footer-brand">
          <strong>{brand.label}</strong>
          {brand.blurb ? <p>{brand.blurb}</p> : null}
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="mxs-footer-col">
            <h3>{column.title}</h3>
            {column.links.map((link) => (
              <a key={link.href} href={link.href}>{link.label}</a>
            ))}
          </nav>
        ))}
      </div>
      {legal ? <div className="mxs-footer-legal">{legal}</div> : null}
    </footer>
  );
}
