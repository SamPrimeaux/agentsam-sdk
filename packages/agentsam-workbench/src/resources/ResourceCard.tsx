import type { ReactNode } from 'react';

/** Creative Department family personalities. Apps keep distinct look via this attribute + CSS vars. */
export type ResourceCardPersonality = 'cad' | 'sketch' | 'sculpt' | 'movie' | 'work';

export type ResourcePreviewKind = 'plan-2d' | 'model-3d' | 'image' | 'clip' | 'abstract';

export interface ResourceCardProps {
  title: string;
  category?: string;
  meta?: string;
  preview: ReactNode;
  previewKind?: ResourcePreviewKind;
  personality?: ResourceCardPersonality;
  appLabel?: string;
  appMark?: ReactNode;
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
 * Shared Creative Department resource-card grammar.
 * Lightweight previews only — never mount a live 3D/timeline engine inside a gallery card.
 * Apps import this once; specialize with `personality` / CSS variables, not a second registry.
 */
export function ResourceCard({
  title,
  category,
  meta,
  preview,
  previewKind = 'abstract',
  personality = 'work',
  appLabel,
  appMark,
  selected = false,
  disabled = false,
  openLabel = 'Open',
  secondaryLabel,
  onOpen,
  onSecondary,
  className = '',
  'aria-label': ariaLabel,
}: ResourceCardProps) {
  return (
    <article
      className={`as-resource-card${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
      data-personality={personality}
      data-preview-kind={previewKind}
      aria-label={ariaLabel || (appLabel ? `${title} · ${appLabel}` : title)}
    >
      <div className="as-resource-card__preview">
        {preview}
        {appLabel ? (
          <span className="as-resource-card__app">
            {appMark}
            {appLabel}
          </span>
        ) : null}
        {category ? <span className="as-resource-card__kind">{category}</span> : null}
      </div>
      <div className="as-resource-card__body">
        <h3 className="as-resource-card__title">{title}</h3>
        {meta ? <p className="as-resource-card__meta">{meta}</p> : null}
      </div>
      <div className="as-resource-card__actions">
        {secondaryLabel && onSecondary ? (
          <button type="button" className="as-resource-card__ghost" disabled={disabled} onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="as-resource-card__open"
          disabled={disabled || !onOpen}
          onClick={onOpen}
          aria-label={`${openLabel} ${title}`}
        >
          <span>{openLabel}</span>
          <span className="as-resource-card__open-mark" aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  );
}
