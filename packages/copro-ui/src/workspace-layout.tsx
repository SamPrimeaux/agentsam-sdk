import React, { useEffect, useState } from "react";

export type WorkspaceLayout = {
  browserWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  browserOpen: boolean;
  inspectorOpen: boolean;
  reversed: boolean;
};

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  browserWidth: 328,
  inspectorWidth: 310,
  timelineHeight: 290,
  browserOpen: true,
  inspectorOpen: true,
  reversed: false,
};
const STORAGE_KEY = "copro.workspace.layout.v2";
export const clampWorkspaceSize = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function loadWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return { ...DEFAULT_WORKSPACE_LAYOUT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WORKSPACE_LAYOUT };
    const data = JSON.parse(raw) as Partial<WorkspaceLayout>;
    return {
      browserWidth: Number.isFinite(data.browserWidth) ? clampWorkspaceSize(data.browserWidth!, 240, 540) : DEFAULT_WORKSPACE_LAYOUT.browserWidth,
      inspectorWidth: Number.isFinite(data.inspectorWidth) ? clampWorkspaceSize(data.inspectorWidth!, 250, 500) : DEFAULT_WORKSPACE_LAYOUT.inspectorWidth,
      timelineHeight: Number.isFinite(data.timelineHeight) ? clampWorkspaceSize(data.timelineHeight!, 135, 600) : DEFAULT_WORKSPACE_LAYOUT.timelineHeight,
      browserOpen: typeof data.browserOpen === "boolean" ? data.browserOpen : true,
      inspectorOpen: typeof data.inspectorOpen === "boolean" ? data.inspectorOpen : true,
      reversed: typeof data.reversed === "boolean" ? data.reversed : false,
    };
  } catch { return { ...DEFAULT_WORKSPACE_LAYOUT }; }
}

export function useWorkspaceLayout() {
  const [layout, setLayout] = useState<WorkspaceLayout>(loadWorkspaceLayout);
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* Storage can be disabled or full. Editing still works. */ }
  }, [layout]);
  return { layout, setLayout, resetLayout: () => setLayout({ ...DEFAULT_WORKSPACE_LAYOUT }) };
}

type ResizeHandleProps = {
  axis: "x" | "y";
  label: string;
  value: number;
  min: number;
  max: number;
  direction?: number;
  onChange: (value: number) => void;
  className?: string;
};

/** Pointer, keyboard and accessible separator. No drag library or additional editor state. */
export function ResizeHandle({ axis, label, value, min, max, direction = 1, onChange, className = "" }: ResizeHandleProps) {
  function begin(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = axis === "x" ? event.clientX : event.clientY;
    const initial = value;
    const priorCursor = document.body.style.cursor;
    const priorSelection = document.body.style.userSelect;
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    function move(next: PointerEvent) {
      onChange(clampWorkspaceSize(initial + ((axis === "x" ? next.clientX : next.clientY) - start) * direction, min, max));
    }
    function finish() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = priorCursor;
      document.body.style.userSelect = priorSelection;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }
  function keyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 32 : 12;
    const delta = axis === "x" ? (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0) :
      (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0);
    if (!delta && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    onChange(event.key === "Home" ? min : event.key === "End" ? max : clampWorkspaceSize(value + delta * direction, min, max));
  }
  return <div
    role="separator" tabIndex={0} aria-label={label} aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max}
    title={`${label} — drag or use arrow keys; Shift for larger steps`}
    className={`copro-resize-handle copro-resize-${axis} ${className}`}
    onPointerDown={begin} onKeyDown={keyDown}
  ><span aria-hidden="true"/></div>;
}
