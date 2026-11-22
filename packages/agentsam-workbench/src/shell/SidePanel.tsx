import type { CSSProperties, PointerEventHandler, ReactNode } from 'react';

export function SidePanel({ header, children, footer, id, className, ariaLabel, style, onPointerUp, dataAttributes }: { header?: ReactNode; children: ReactNode; footer?: ReactNode; id?: string; className?: string; ariaLabel?: string; style?: CSSProperties; onPointerUp?: PointerEventHandler<HTMLElement>; dataAttributes?: Record<string, string | undefined> }) {
  return <aside id={id} className={className} aria-label={ariaLabel} style={style} onPointerUp={onPointerUp} data-workbench-side-panel="" {...dataAttributes}>{header}{children}{footer}</aside>;
}
