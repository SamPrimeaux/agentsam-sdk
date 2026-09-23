import type { ReactNode } from 'react';

export type GoalStatusStripProps = {
  icon?: ReactNode;
  label?: ReactNode;
  title: ReactNode;
  preview?: ReactNode;
  elapsed?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function GoalStatusStrip({
  icon,
  label = 'Pursuing goal',
  title,
  preview,
  elapsed,
  actions,
  className,
}: GoalStatusStripProps) {
  return (
    <div className={className} data-agent-goal-status="">
      <div className="flex min-w-0 items-center gap-2">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
            <span className="shrink-0 font-semibold">{label}</span>
            <span className="min-w-0 truncate font-normal opacity-55">{title}</span>
          </div>
          {preview ? <div className="mt-0.5 truncate text-[11px] opacity-45">{preview}</div> : null}
        </div>
        {elapsed ? <span className="shrink-0 text-[11px] opacity-45">{elapsed}</span> : null}
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </div>
    </div>
  );
}
