import { useCallback, useEffect, useRef, useState } from 'react';

type Axis = 'x' | 'y';
type SeamState = 'inactive' | 'hover' | 'active';

export interface ResizableStageHandleProps {
  axis?: Axis;
  onDrag: (deltaPx: number) => void;
  onDoubleClick?: () => void;
  label: string;
  className?: string;
  bodyResizeAttribute?: string;
  bodyHoverAttribute?: string;
}

function setBodyFlag(name: string | undefined, on: boolean) {
  if (!name || typeof document === 'undefined') return;
  if (on) document.body.setAttribute(name, '');
  else document.body.removeAttribute(name);
}

export function ResizableStageHandle({
  axis = 'x',
  onDrag,
  onDoubleClick,
  label,
  className,
  bodyResizeAttribute,
  bodyHoverAttribute,
}: ResizableStageHandleProps) {
  const last = useRef(0);
  const dragging = useRef(false);
  const [state, setState] = useState<SeamState>('inactive');

  const stop = useCallback(() => {
    dragging.current = false;
    setState('inactive');
    setBodyFlag(bodyResizeAttribute, false);
    setBodyFlag(bodyHoverAttribute, false);
  }, [bodyResizeAttribute, bodyHoverAttribute]);

  useEffect(() => () => stop(), [stop]);
  const clientOf = (event: { clientX: number; clientY: number }) => axis === 'x' ? event.clientX : event.clientY;

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      data-separator={state}
      data-axis={axis}
      className={className}
      onDoubleClick={onDoubleClick}
      onPointerEnter={() => {
        if (!dragging.current) setState('hover');
        setBodyFlag(bodyHoverAttribute, true);
      }}
      onPointerLeave={() => {
        if (!dragging.current) {
          setState('inactive');
          setBodyFlag(bodyHoverAttribute, false);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        last.current = clientOf(event);
        setState('active');
        setBodyFlag(bodyResizeAttribute, true);
        setBodyFlag(bodyHoverAttribute, true);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const next = clientOf(event);
        const delta = next - last.current;
        last.current = next;
        if (delta) onDrag(delta);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        const amount = event.shiftKey ? 24 : 8;
        if ((axis === 'x' && event.key === 'ArrowLeft') || (axis === 'y' && event.key === 'ArrowUp')) {
          event.preventDefault();
          onDrag(-amount);
        }
        if ((axis === 'x' && event.key === 'ArrowRight') || (axis === 'y' && event.key === 'ArrowDown')) {
          event.preventDefault();
          onDrag(amount);
        }
      }}
    />
  );
}
