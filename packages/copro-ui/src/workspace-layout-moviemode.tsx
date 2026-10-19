import React, { useEffect, useState } from "react";

export type WorkspaceLayout = {
  browserWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
  browserOpen: boolean;
  inspectorOpen: boolean;
  reversed: boolean;
  browserFloating: boolean;
  inspectorFloating: boolean;
  playerFloating: boolean;
  browserX: number;
  browserY: number;
  inspectorX: number;
  inspectorY: number;
  playerX: number;
  playerY: number;
  playerFloatWidth: number;
  playerFloatHeight: number;
  browserFloatHeight: number;
  inspectorFloatHeight: number;
};

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  browserWidth: 490,
  inspectorWidth: 350,
  timelineHeight: 0,
  browserOpen: true,
  inspectorOpen: true,
  reversed: false,
  browserFloating: false,
  inspectorFloating: false,
  playerFloating: false,
  browserX: 70,
  browserY: 110,
  inspectorX: 760,
  inspectorY: 110,
  playerX: 410,
  playerY: 120,
  playerFloatWidth: 640,
  playerFloatHeight: 440,
  browserFloatHeight: 520,
  inspectorFloatHeight: 520,
};
const STORAGE_KEY = "moviemode.workspace.layout.v3";
export const clampWorkspaceSize = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function loadWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") return { ...DEFAULT_WORKSPACE_LAYOUT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WORKSPACE_LAYOUT };
    const data = JSON.parse(raw) as Partial<WorkspaceLayout>;
    return {
      browserWidth: Number.isFinite(data.browserWidth) ? clampWorkspaceSize(data.browserWidth!, 260, 800) : DEFAULT_WORKSPACE_LAYOUT.browserWidth,
      inspectorWidth: Number.isFinite(data.inspectorWidth) ? clampWorkspaceSize(data.inspectorWidth!, 260, 700) : DEFAULT_WORKSPACE_LAYOUT.inspectorWidth,
      timelineHeight: Number.isFinite(data.timelineHeight) && data.timelineHeight! > 0 ? clampWorkspaceSize(data.timelineHeight!, 140, 1200) : DEFAULT_WORKSPACE_LAYOUT.timelineHeight,
      browserOpen: typeof data.browserOpen === "boolean" ? data.browserOpen : true,
      inspectorOpen: typeof data.inspectorOpen === "boolean" ? data.inspectorOpen : true,
      reversed: typeof data.reversed === "boolean" ? data.reversed : false,
      browserFloating: data.browserFloating === true,
      inspectorFloating: data.inspectorFloating === true,
      playerFloating: data.playerFloating === true,
      browserX: Number.isFinite(data.browserX) ? clampWorkspaceSize(data.browserX!, 0, 4000) : 70,
      browserY: Number.isFinite(data.browserY) ? clampWorkspaceSize(data.browserY!, 0, 4000) : 110,
      inspectorX: Number.isFinite(data.inspectorX) ? clampWorkspaceSize(data.inspectorX!, 0, 4000) : 760,
      inspectorY: Number.isFinite(data.inspectorY) ? clampWorkspaceSize(data.inspectorY!, 0, 4000) : 110,
      playerX: Number.isFinite(data.playerX) ? clampWorkspaceSize(data.playerX!, 0, 4000) : 410,
      playerY: Number.isFinite(data.playerY) ? clampWorkspaceSize(data.playerY!, 0, 4000) : 120,
      playerFloatWidth: Number.isFinite(data.playerFloatWidth) ? clampWorkspaceSize(data.playerFloatWidth!, 360, 2000) : 640,
      playerFloatHeight: Number.isFinite(data.playerFloatHeight) ? clampWorkspaceSize(data.playerFloatHeight!, 260, 1500) : 440,
      browserFloatHeight: Number.isFinite(data.browserFloatHeight) ? clampWorkspaceSize(data.browserFloatHeight!, 250, 1500) : 520,
      inspectorFloatHeight: Number.isFinite(data.inspectorFloatHeight) ? clampWorkspaceSize(data.inspectorFloatHeight!, 250, 1500) : 520,
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
