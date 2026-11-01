import React from 'react';
import { ArrowUpRight, Box } from 'lucide-react';

export type CadPreviewKind = 'plan-2d' | 'model-3d' | 'image' | 'abstract';

export interface CadResourceCardProps {
  title: string;
  category?: string;
  meta?: string;
  preview: React.ReactNode;
  previewKind?: CadPreviewKind;
  selected?: boolean;
  disabled?: boolean;
  openLabel?: string;
  secondaryLabel?: string;
  onOpen?: () => void;
  onSecondary?: () => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Shared Creative Department resource-card grammar for CAD Creator.
 * Lightweight previews only — never mounts a live 3D engine inside the card.
 */
export function CadResourceCard({
  title,
  category = 'CAD project',
  meta,
  preview,
  previewKind = 'plan-2d',
  selected = false,
  disabled = false,
  openLabel = 'Open',
  secondaryLabel,
  onOpen,
  onSecondary,
  className = '',
  'aria-label': ariaLabel,
}: CadResourceCardProps) {
  return (
    <article
      className={`cad-resource-card${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()}
      data-preview-kind={previewKind}
      aria-label={ariaLabel || `${title} · CAD Creator`}
    >
      <div className="cad-resource-card__preview" aria-hidden={false}>
        {preview}
        <span className="cad-resource-card__app">
          <Box size={12} aria-hidden="true" />
          CAD Creator
        </span>
        <span className="cad-resource-card__kind">{category}</span>
      </div>
      <div className="cad-resource-card__body">
        <h3 className="cad-resource-card__title">{title}</h3>
        {meta ? <p className="cad-resource-card__meta">{meta}</p> : null}
      </div>
      <div className="cad-resource-card__actions">
        {secondaryLabel && onSecondary ? (
          <button type="button" className="cad-resource-card__ghost" disabled={disabled} onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="cad-resource-card__open"
          disabled={disabled || !onOpen}
          onClick={onOpen}
          aria-label={`${openLabel} ${title}`}
        >
          <span>{openLabel}</span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
