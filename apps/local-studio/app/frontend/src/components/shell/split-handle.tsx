import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Axis = "x" | "y";
type SeamState = "inactive" | "hover" | "active";

function setBodyFlag(name: "data-resizing" | "data-split-hover", on: boolean) {
  if (on) document.body.setAttribute(name, "");
  else document.body.removeAttribute(name);
}

export function SplitHandle({
  axis = "x",
  onDrag,
  onDoubleClick,
  label,
  className,
}: {
  axis?: Axis;
  onDrag: (deltaPx: number) => void;
  onDoubleClick?: () => void;
  label: string;
  className?: string;
}) {
  const last = useRef(0);
  const dragging = useRef(false);
  const [state, setState] = useState<SeamState>("inactive");

  const stop = useCallback(() => {
    dragging.current = false;
    setState("inactive");
    setBodyFlag("data-resizing", false);
    setBodyFlag("data-split-hover", false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  function clientOf(e: { clientX: number; clientY: number }) {
    return axis === "x" ? e.clientX : e.clientY;
  }

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      data-separator={state}
      className={cn("studio-separator", axis === "y" && "is-row", className)}
      onDoubleClick={onDoubleClick}
      onPointerEnter={() => {
        if (!dragging.current) setState("hover");
        setBodyFlag("data-split-hover", true);
      }}
      onPointerLeave={() => {
        if (!dragging.current) {
          setState("inactive");
          setBodyFlag("data-split-hover", false);
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        last.current = clientOf(e);
        setState("active");
        setBodyFlag("data-resizing", true);
        setBodyFlag("data-split-hover", true);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const next = clientOf(e);
        const delta = next - last.current;
        last.current = next;
        if (delta) onDrag(delta);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          onDrag(-step);
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          onDrag(step);
        } else if (e.key === "Home" || e.key === "Enter") {
          e.preventDefault();
          onDoubleClick?.();
        }
      }}
    >
      <span className="split-bar" />
      <span className="split-grip" aria-hidden />
    </div>
  );
}
