import { useEffect, useRef, useState } from "react";
import type { LoadingSceneController } from "../core/controller.js";
import type { LoadingSceneSemantic } from "../core/types.js";

const SEMANTICS: LoadingSceneSemantic[] = [
  "idle", "boot", "reading", "thinking", "tool_execution", "parallel_execution",
  "context_loading", "indexing", "verification", "compaction", "asset_generation",
  "build", "deployment", "waiting_external", "success", "error",
];

export interface LoadingSceneDevtoolsProps {
  controller: LoadingSceneController;
  /** Gate rendering yourself, e.g. location.search.includes("debugRuntimeVisuals=1"). */
  enabled?: boolean;
}

/** Dev-only panel: semantic buttons, auto-cycle, speed. Never ship in production UI. */
export function LoadingSceneDevtools({ controller, enabled = true }: LoadingSceneDevtoolsProps) {
  const [cycle, setCycle] = useState(false);
  const [speed, setSpeed] = useState(4000);
  const [active, setActive] = useState<LoadingSceneSemantic>("idle");
  const idx = useRef(0);

  useEffect(() => {
    if (!cycle) return;
    const id = setInterval(() => {
      idx.current = (idx.current + 1) % SEMANTICS.length;
      const s = SEMANTICS[idx.current]!;
      setActive(s);
      controller.debugSet(s, `debug: ${s}`);
    }, speed);
    return () => clearInterval(id);
  }, [cycle, speed, controller]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        background: "rgba(8,8,12,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        padding: 10,
        maxWidth: 300,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        color: "#cfd2dd",
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
      }}
    >
      {SEMANTICS.map((s) => (
        <button
          key={s}
          onClick={() => {
            setCycle(false);
            setActive(s);
            controller.debugSet(s, `debug: ${s}`);
          }}
          style={{
            background: s === active ? "rgba(139,125,183,0.35)" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 4,
            color: "inherit",
            padding: "3px 6px",
            cursor: "pointer",
            fontSize: 10,
          }}
        >
          {s}
        </button>
      ))}
      <label style={{ display: "flex", gap: 4, alignItems: "center", width: "100%", marginTop: 6 }}>
        <input type="checkbox" checked={cycle} onChange={(e) => setCycle(e.target.checked)} />
        auto-cycle
        <input
          type="range"
          min={1500}
          max={8000}
          step={500}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        {(speed / 1000).toFixed(1)}s
      </label>
    </div>
  );
}
