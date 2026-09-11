import type { ReactNode } from 'react';

export function SidePanel({ header, children, footer, className }: { header?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return <aside className={className} data-workbench-side-panel="">{header}{children}{footer}</aside>;
}
