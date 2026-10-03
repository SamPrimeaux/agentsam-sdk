import type { CSSProperties, ReactNode } from 'react';

export type PreflightStatus =
  | 'ready'
  | 'ready_with_warning'
  | 'ready_with_transform'
  | 'prepared_for_digitization'
  | 'needs_variant'
  | 'unsupported';

export interface PreflightIssueView {
  code: string;
  message: string;
  action?: string | null;
}

export interface PreflightIndicatorProps {
  status: PreflightStatus;
  effectivePpi?: number | null;
  readyPpi?: number | null;
  minimumPpi?: number | null;
  issues?: readonly PreflightIssueView[];
  actions?: readonly string[];
  onAction?: (action: string) => void;
  compact?: boolean;
  title?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const STATUS_COPY: Record<PreflightStatus, { label: string; tone: string }> = {
  ready: { label: 'Production ready', tone: 'ready' },
  ready_with_warning: { label: 'Usable with warning', tone: 'warning' },
  ready_with_transform: { label: 'Quick fix available', tone: 'transform' },
  prepared_for_digitization: { label: 'Prepared for digitization', tone: 'handoff' },
  needs_variant: { label: 'Needs another asset variant', tone: 'error' },
  unsupported: { label: 'Unsupported for this process', tone: 'error' },
};

const ACTION_LABELS: Record<string, string> = {
  trim_alpha: 'Auto-Crop Alpha',
  vectorize_monochrome: 'Convert to Monochrome Vector',
  scale_to_safe_zone: 'Scale to Fit Safe Zone',
  normalize_svg: 'Normalize SVG',
  outline_text: 'Outline Text',
  lossless_optimize: 'Optimize Losslessly',
};

function labelForAction(action: string) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith('normalize_color_space:')) return 'Normalize Color';
  if (action.startsWith('convert:')) return 'Convert Format';
  if (action.startsWith('rasterize:')) return 'Rasterize for Print';
  return action
    .replace(/[:_-]+/g, ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function qualityPercent(
  effectivePpi: number | null | undefined,
  readyPpi: number | null | undefined,
) {
  if (!effectivePpi || !readyPpi) return null;
  return Math.max(0, Math.min(100, (effectivePpi / readyPpi) * 100));
}

export function PreflightIndicator({
  status,
  effectivePpi,
  readyPpi,
  minimumPpi,
  issues = [],
  actions = [],
  onAction,
  compact = false,
  title = 'Print quality',
  className,
  style,
}: PreflightIndicatorProps) {
  const state = STATUS_COPY[status];
  const quality = qualityPercent(effectivePpi, readyPpi);
  const uniqueActions = [...new Set(actions)];

  return (
    <section
      className={className}
      data-agentsam-preflight=""
      data-preflight-status={status}
      data-preflight-tone={state.tone}
      style={{
        border: '1px solid var(--agentsam-preflight-border, rgba(90, 92, 98, 0.24))',
        borderRadius: 12,
        padding: compact ? 10 : 14,
        background: 'var(--agentsam-preflight-bg, rgba(255,255,255,0.72))',
        display: 'grid',
        gap: compact ? 8 : 10,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <strong style={{ fontSize: compact ? 12 : 13, fontWeight: 650 }}>{title}</strong>
        <span
          data-preflight-state=""
          style={{
            fontSize: 11,
            opacity: 0.72,
            textAlign: 'right',
          }}
        >
          {state.label}
        </span>
      </div>

      {quality != null ? (
        <div style={{ display: 'grid', gap: 5 }}>
          <div
            aria-label={`Effective print resolution ${Math.round(effectivePpi!)} PPI`}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={readyPpi || 300}
            aria-valuenow={Math.round(effectivePpi!)}
            style={{
              height: 5,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'var(--agentsam-preflight-track, rgba(90,92,98,0.14))',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${quality}%`,
                borderRadius: 'inherit',
                background:
                  status === 'needs_variant' || status === 'unsupported'
                    ? 'var(--agentsam-preflight-error, #9f4d4d)'
                    : status === 'ready_with_warning'
                      ? 'var(--agentsam-preflight-warning, #a87320)'
                      : 'var(--agentsam-preflight-ready, #54745b)',
                transition: 'width 120ms ease',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              fontSize: 11,
              opacity: 0.72,
            }}
          >
            <span>{Math.round(effectivePpi!)} PPI effective</span>
            {readyPpi ? <span>{Math.round(readyPpi)} target</span> : null}
            {minimumPpi && minimumPpi !== readyPpi ? (
              <span>{Math.round(minimumPpi)} minimum</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {!compact && issues.length ? (
        <div style={{ display: 'grid', gap: 4 }}>
          {issues.slice(0, 3).map((issue) => (
            <div key={issue.code} style={{ fontSize: 12, lineHeight: 1.35, opacity: 0.82 }}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}

      {uniqueActions.length && onAction ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {uniqueActions.slice(0, compact ? 2 : 4).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(action)}
              style={{
                border: '1px solid var(--agentsam-preflight-button-border, rgba(70,72,76,0.24))',
                borderRadius: 8,
                padding: compact ? '5px 8px' : '6px 9px',
                background: 'var(--agentsam-preflight-button-bg, rgba(255,255,255,0.82))',
                color: 'inherit',
                font: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {labelForAction(action)}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
