import { useState, type ReactNode } from 'react';
import './EmptyState.css';

export type EmptyStateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export type EmptyStateStatus = {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

export type EmptyStateProps = {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  command?: string;
  copyLabel?: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  tertiaryAction?: EmptyStateAction;
  status?: EmptyStateStatus;
  className?: string;
};

type ActionButtonProps = {
  action?: EmptyStateAction;
  variant: 'primary' | 'secondary' | 'ghost';
};

function ActionButton({ action, variant }: ActionButtonProps) {
  if (!action) return null;
  const className = `asbd-empty__btn asbd-empty__btn--${variant}`;
  if (action.href) {
    return (
      <a className={className} href={action.href} aria-disabled={action.disabled || undefined}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </button>
  );
}

/**
 * Sparse empty / install / connect grammar for Local Studio + installables.
 */
export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  command,
  copyLabel = 'Copy command',
  primaryAction,
  secondaryAction,
  tertiaryAction,
  status,
  className = '',
}: EmptyStateProps) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className={`asbd-empty ${className}`.trim()} aria-labelledby="asbd-empty-title">
      <div className="asbd-empty__body">
        {icon ? (
          <div className="asbd-empty__icon" aria-hidden="true">
            {icon}
          </div>
        ) : null}

        {eyebrow ? <div className="asbd-empty__eyebrow">{eyebrow}</div> : null}

        <h2 id="asbd-empty-title" className="asbd-empty__title">
          {title}
        </h2>

        {description ? <p className="asbd-empty__description">{description}</p> : null}

        {status ? (
          <span className="asbd-empty__status" data-tone={status.tone || 'neutral'}>
            {status.label}
          </span>
        ) : null}

        {command ? (
          <button
            type="button"
            className="asbd-empty__command"
            onClick={copyCommand}
            aria-label={copyLabel}
            title={copyLabel}
          >
            <span aria-hidden="true">$</span> {command}
            <span className="asbd-empty__copy-hint">{copied ? 'Copied' : '⧉'}</span>
          </button>
        ) : null}

        {(primaryAction || secondaryAction || tertiaryAction) && (
          <div className="asbd-empty__actions">
            {secondaryAction ? <ActionButton action={secondaryAction} variant="secondary" /> : null}
            {primaryAction ? <ActionButton action={primaryAction} variant="primary" /> : null}
            {tertiaryAction ? <ActionButton action={tertiaryAction} variant="ghost" /> : null}
          </div>
        )}
      </div>
    </section>
  );
}

export type InstallableManifest = {
  id?: string;
  display_name?: string;
  name?: string;
  package?: string;
  icon?: string;
  install?: {
    command?: string;
    supported?: boolean;
  };
  preview?: {
    supported?: boolean;
    route?: string;
  };
  empty_state?: {
    title?: string;
    description?: string;
    primary_label?: string;
    secondary_label?: string;
  };
  docs?: {
    route?: string;
  };
};

export type InstallableEmptyStateProps = {
  installable: InstallableManifest;
  icon?: ReactNode;
  onInstall?: () => void;
  onPreview?: () => void;
};

/**
 * Manifest-driven installable empty state.
 */
export function InstallableEmptyState({
  installable,
  icon,
  onInstall,
  onPreview,
}: InstallableEmptyStateProps) {
  const name = installable?.display_name || installable?.name || installable?.id || 'Package';
  const pkg = installable?.package || '';
  const command =
    installable?.install?.command || (pkg ? `npm install ${pkg}` : undefined);
  const docsHref = installable?.docs?.route;
  const title = installable?.empty_state?.title || `${name} isn't installed`;
  const description =
    installable?.empty_state?.description ||
    `Install the packaged ${name} workspace, then open it locally or launch a preview.`;
  const primaryLabel = installable?.empty_state?.primary_label || 'Install';
  const secondaryLabel = installable?.empty_state?.secondary_label || 'Preview';
  const semanticIcon = installable?.icon || 'generic';

  return (
    <EmptyState
      icon={icon || <span style={{ fontSize: 28 }}>▢</span>}
      eyebrow={`AgentSam package · ${semanticIcon}`}
      title={title}
      description={description}
      command={command}
      secondaryAction={
        installable?.preview?.supported !== false && onPreview
          ? { label: secondaryLabel, onClick: onPreview }
          : undefined
      }
      primaryAction={onInstall ? { label: primaryLabel, onClick: onInstall } : undefined}
      tertiaryAction={docsHref ? { label: 'View docs', href: docsHref } : undefined}
    />
  );
}
