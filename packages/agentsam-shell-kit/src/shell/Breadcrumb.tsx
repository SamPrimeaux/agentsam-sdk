// Breadcrumb.tsx — Generic "Collaborate / Artifacts" breadcrumb pattern.
// Not tied to any specific surface.

import React from 'react';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  separator?: React.ReactNode;
}

export function Breadcrumb({ segments, separator = '/' }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className="sk-breadcrumb">
      <ol>
        {segments.map((seg, i) => (
          <li key={i} className={i === segments.length - 1 ? 'sk-breadcrumb__current' : ''}>
            {seg.href && i < segments.length - 1 ? (
              <a href={seg.href}>{seg.label}</a>
            ) : (
              <span>{seg.label}</span>
            )}
            {i < segments.length - 1 && (
              <span className="sk-breadcrumb__sep" aria-hidden="true">{separator}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
