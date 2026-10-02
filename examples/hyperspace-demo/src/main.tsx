import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LoadingSceneController,
  computationalHyperspace,
  adaptAgentSamEvent,
} from "@inneranimalmedia/agentsam-loading-scene";
import {
  LoadingScene,
  LoadingSceneStatus,
  LoadingSceneDevtools,
} from "@inneranimalmedia/agentsam-loading-scene/react";

const preset = computationalHyperspace;

/**
 * Simulated "create a site" run: realistic runtime events flow through
 * the adapter → controller, exactly as a real CMS app would wire it.
 * The renderer never sees any of these names.
 */
function simulateSiteCreation(controller: LoadingSceneController, onDone: () => void) {
  const timeline: Array<[number, () => void]> = [];
  const at = (ms: number, fn: () => void) => timeline.push([ms, fn]);
  const ev = (raw: Parameters<typeof adaptAgentSamEvent>[0]) =>
    controller.handle(adaptAgentSamEvent(raw));

  at(0, () => ev({ type: "agent.session.started", operationId: "session", label: "Starting up" }));
  at(900, () => controller.complete("session"));

  at(1000, () => ev({ type: "context.workspace.loading", operationId: "ctx", label: "Gathering context" }));
  // 19 rapid file reads — coalesced, no flicker
  for (let i = 0; i < 19; i++) {
    at(1200 + i * 60, () => ev({ type: "file.read", label: "Understanding your project" }));
  }
  at(2600, () => controller.complete("ctx"));

  at(2700, () => ev({ type: "model.planning", operationId: "plan", label: "Planning your site" }));
  at(5200, () => controller.complete("plan"));

  // parallel tools + asset generation blending
  at(5300, () => ev({ type: "tool.invoke", operationId: "t1", label: "Laying out pages" }));
  at(5450, () => ev({ type: "tool.invoke", operationId: "t2", label: "Writing copy" }));
  at(5600, () => ev({ type: "tool.image.generate", operationId: "hero", label: "Generating hero artwork" }));
  at(9400, () => controller.complete("t1"));
  at(10200, () => controller.complete("t2"));
  at(12500, () => ev({ type: "content.asset.generated", operationId: "hero", label: "Hero artwork ready" }));

  at(12800, () => ev({ type: "catalog.indexing", operationId: "idx", label: "Organizing your content" }));
  at(15200, () => controller.complete("idx"));

  at(15400, () => ev({ type: "site.build", operationId: "build", label: "Building your site", progress: 0 }));
  at(16500, () => ev({ type: "site.build", operationId: "build", progress: 0.35 }));
  at(17800, () => ev({ type: "site.build", operationId: "build", progress: 0.8 }));
  at(18900, () => controller.complete("build"));

  at(19000, () => ev({ type: "output.verify", operationId: "verify", label: "Checking everything" }));
  at(21500, () => controller.complete("verify"));

  at(21700, () => ev({ type: "site.deploy", operationId: "deploy", label: "Publishing" }));
  at(24800, () => {
    controller.complete("deploy");
    onDone();
  });

  const ids = timeline.map(([ms, fn]) => window.setTimeout(fn, ms));
  return () => ids.forEach((id) => window.clearTimeout(id));
}

function EditorSurface() {
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateRows: "56px 1fr",
        color: "#d5d7e0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 16,
          fontSize: 13,
          letterSpacing: "0.06em",
        }}
      >
        <strong style={{ color: "#8b7db7" }}>AgentSam</strong>
        <span style={{ opacity: 0.5 }}>Fuel N Free Time — Home</span>
        <span style={{ marginLeft: "auto", opacity: 0.4, fontSize: 12 }}>Draft saved</span>
      </header>
      <main style={{ padding: 32, display: "grid", gap: 20, alignContent: "start" }}>
        <div style={{ height: 220, borderRadius: 10, background: "linear-gradient(135deg, rgba(139,125,183,0.18), rgba(104,117,173,0.1))", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, opacity: 0.8 }}>
          Hero section — generated artwork placed here
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
          {["Collection grid", "Countdown banner", "Newsletter"].map((s) => (
            <div key={s} style={{ height: 110, borderRadius: 8, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, opacity: 0.65 }}>
              {s}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function App() {
  const controller = useMemo(() => new LoadingSceneController(preset), []);
  const [run, setRun] = useState(0);
  const debug = new URLSearchParams(window.location.search).get("debugRuntimeVisuals") === "1";

  useEffect(() => {
    if (debug) return; // devtools drive the controller instead
    return simulateSiteCreation(controller, () => undefined);
  }, [controller, run, debug]);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <LoadingScene controller={controller} preset={preset} style={{ width: "100%", height: "100%" }}>
        <EditorSurface />
      </LoadingScene>
      <div style={{ position: "fixed", left: 24, bottom: 24, pointerEvents: "none" }}>
        <LoadingSceneStatus controller={controller} preset={preset} />
      </div>
      {!debug && (
        <button
          onClick={() => {
            controller.reset();
            setRun((r) => r + 1);
          }}
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            color: "#9ea1b0",
            padding: "6px 12px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Replay
        </button>
      )}
      <LoadingSceneDevtools controller={controller} enabled={debug} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
