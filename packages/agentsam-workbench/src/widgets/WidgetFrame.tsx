import type { CSSProperties, ReactNode } from 'react';
import type { AgentSamWidgetSize, AgentSamWidgetState } from '@inneranimalmedia/agentsam-contracts/widgets';

export interface WidgetFrameProps {
  title: ReactNode;
  description?: ReactNode;
  size?: AgentSamWidgetSize;
  state?: AgentSamWidgetState;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function stateLabel(state: AgentSamWidgetState | undefined): string | null {
  if (!state || state.status === 'ready') return null;
  if (state.status === 'empty') return 'No data';
  if (state.status === 'stale') return 'Stale';
  return 'Unavailable';
}

export function WidgetFrame({
  title,
  description,
  size = 'small',
  state,
  actions,
  children,
  className,
  style,
}: WidgetFrameProps) {
  const label = stateLabel(state);
  const errorMessage = state && (state.status === 'stale' || state.status === 'error')
    ? state.error.message
    : null;

  return (
    <section
      className={['agentsam-widget', className].filter(Boolean).join(' ')}
      data-widget-size={size}
      data-widget-state={state?.status ?? 'ready'}
      style={style}
    >
      <header className="agentsam-widget__header">
        <div className="agentsam-widget__heading">
          <h2 className="agentsam-widget__title">{title}</h2>
          {description ? <p className="agentsam-widget__description">{description}</p> : null}
        </div>
        {label ? <span className="agentsam-widget__state">{label}</span> : null}
      </header>
      <div className="agentsam-widget__body">{children}</div>
      {errorMessage ? <p className="agentsam-widget__message" role="status">{errorMessage}</p> : null}
      {actions ? <footer className="agentsam-widget__actions">{actions}</footer> : null}
    </section>
  );
}
