import type { ReactNode } from 'react';

export function TerminalSurface({ children, header, className }: { children: ReactNode; header?: ReactNode; className?: string }) {
  return <section className={className} data-terminal-surface="">{header}{children}</section>;
}
