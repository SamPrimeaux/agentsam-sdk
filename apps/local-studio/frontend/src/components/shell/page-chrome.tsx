import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageChrome({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium tracking-tight text-foreground">{title}</div>
          {subtitle ? <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-0.5">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
