import type { CSSProperties } from 'react';
import { formatCountdown } from './countdown';
import { useCountdown } from './useCountdown';

export interface CountdownWidgetProps {
  durationMs: number;
  label?: string;
  autoStart?: boolean;
  compact?: boolean;
  onComplete?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function CountdownWidget({
  durationMs,
  label = 'Time remaining',
  autoStart = false,
  compact = false,
  onComplete,
  className,
  style,
}: CountdownWidgetProps) {
  const countdown = useCountdown({ durationMs, autoStart, onComplete });
  const primaryLabel =
    countdown.phase === 'running'
      ? 'Pause'
      : countdown.phase === 'paused'
        ? 'Resume'
        : countdown.phase === 'complete'
          ? 'Start again'
          : 'Start';

  const onPrimary = () => {
    if (countdown.phase === 'running') countdown.pause();
    else if (countdown.phase === 'paused') countdown.resume();
    else countdown.start();
  };

  return (
    <div
      className={['agentsam-countdown', className].filter(Boolean).join(' ')}
      data-countdown-phase={countdown.phase}
      data-compact={compact ? 'true' : 'false'}
      style={style}
    >
      <div
        className="agentsam-countdown__time"
        role="timer"
        aria-label={label}
        aria-live="off"
      >
        {formatCountdown(countdown.remainingMs)}
      </div>
      <div className="agentsam-countdown__controls">
        <button type="button" className="agentsam-widget-button agentsam-widget-button--primary" onClick={onPrimary}>
          {primaryLabel}
        </button>
        <button type="button" className="agentsam-widget-button" onClick={() => countdown.reset()}>
          Reset
        </button>
      </div>
      <span className="agentsam-countdown__status" role="status" aria-live="polite">
        {countdown.phase === 'complete' ? 'Timer complete.' : ''}
      </span>
    </div>
  );
}
