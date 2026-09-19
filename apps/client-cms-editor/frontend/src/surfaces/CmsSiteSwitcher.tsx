import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CmsWorkspaceSite } from './types';

export type CmsSiteSwitcherProps = {
  sites: CmsWorkspaceSite[];
  activeSlug?: string | null;
  onSelect: (slug: string) => void | Promise<void>;
  onNewSite?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

function sortSites(sites: CmsWorkspaceSite[]): CmsWorkspaceSite[] {
  return [...sites].sort((a, b) => {
    const priA = Number(a.hub_priority) || 0;
    const priB = Number(b.hub_priority) || 0;
    if (priA !== priB) return priB - priA;
    const fa = a.is_featured ? 1 : 0;
    const fb = b.is_featured ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return String(a.name || a.slug).localeCompare(String(b.name || b.slug));
  });
}

function siteLabel(site: CmsWorkspaceSite): string {
  return (site.name || site.slug || 'Site').trim();
}

function siteHint(site: CmsWorkspaceSite): string {
  const domain = site.domain?.trim();
  if (domain) return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return site.slug;
}

export function CmsSiteSwitcher({
  sites,
  activeSlug,
  onSelect,
  onNewSite,
  disabled = false,
  size = 'md',
  className = '',
}: CmsSiteSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => sortSites(sites), [sites]);
  const active = rows.find((s) => s.slug === activeSlug) || null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onPick = (slug: string) => {
    setOpen(false);
    void onSelect(slug);
  };

  return (
    <div
      ref={rootRef}
      className={`iam-cms-site-switcher iam-cms-site-switcher--${size} ${className}`}
      data-open={open ? 'true' : undefined}
    >
      <button
        type="button"
        className="iam-cms-site-switcher__trigger"
        disabled={disabled || rows.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="iam-cms-site-switcher__current">
          <span className="iam-cms-site-switcher__title">
            {active ? siteLabel(active) : rows.length === 0 ? 'No sites' : 'Select site'}
          </span>
          {size === 'md' && active && (
            <span className="iam-cms-site-switcher__meta">{siteHint(active)}</span>
          )}
        </div>
        <svg
          className="iam-cms-site-switcher__chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m7 15 5 5 5-5" />
          <path d="m7 9 5-5 5 5" />
        </svg>
      </button>

      {open && (
        <div className="iam-cms-site-switcher__menu" role="listbox">
          <div className="iam-cms-site-switcher__list">
            {rows.map((s) => {
              const isSelected = s.slug === activeSlug;
              return (
                <button
                  key={s.slug}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`iam-cms-site-switcher__item ${isSelected ? 'iam-cms-site-switcher__item--active' : ''}`}
                  onClick={() => onPick(s.slug)}
                >
                  <div className="iam-cms-site-switcher__item-main">
                    <span className="iam-cms-site-switcher__item-title">{siteLabel(s)}</span>
                    <span className="iam-cms-site-switcher__item-hint">{siteHint(s)}</span>
                  </div>
                  {isSelected && (
                    <svg
                      className="iam-cms-site-switcher__check"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {onNewSite && (
            <div className="iam-cms-site-switcher__footer">
              <button
                type="button"
                className="iam-cms-site-switcher__action"
                onClick={() => {
                  setOpen(false);
                  onNewSite();
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Deploy new site
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
