import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  HYPERSPACE_STUDIES,
  LoadingSceneController,
  adaptAgentSamEvent,
  computationalHyperspace,
  type HyperspaceStudyId,
} from "@inneranimalmedia/agentsam-loading-scene";
import {
  LoadingScene,
  LoadingSceneStatus,
  LoadingSceneDevtools,
} from "@inneranimalmedia/agentsam-loading-scene/react";

const preset = computationalHyperspace;

type StudyChoice = HyperspaceStudyId | "auto";

function simulateRuntime(
  controller: LoadingSceneController,
  onDone: () => void,
) {
  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => {
    timers.push(window.setTimeout(fn, ms));
  };
  const emit = (raw: Parameters<typeof adaptAgentSamEvent>[0]) =>
    controller.handle(adaptAgentSamEvent(raw));

  later(0, () =>
    emit({
      type: "agent.session.started",
      operationId: "boot",
      label: "Preparing runtime",
      detail: "Opening the AgentSam workspace",
    }),
  );
  later(3600, () => controller.complete("boot"));

  later(3900, () =>
    emit({
      type: "file.read",
      operationId: "read",
      label: "Reading project context",
      detail: "Reviewing files and instructions relevant to the task",
    }),
  );
  later(7700, () => controller.complete("read"));

  later(8000, () =>
    emit({
      type: "context.workspace.loading",
      operationId: "context",
      label: "Loading context",
      detail: "Assembling the workspace state needed for this turn",
    }),
  );
  later(11900, () => controller.complete("context"));

  later(12200, () =>
    emit({
      type: "tool.invoke",
      operationId: "tool-a",
      label: "Running tools",
      detail: "Executing the first task action",
    }),
  );
  later(12450, () =>
    emit({
      type: "tool.invoke",
      operationId: "tool-b",
      label: "Tracing dependencies",
      detail: "Following related package and runtime edges",
    }),
  );
  later(16300, () => controller.complete("tool-a"));
  later(16600, () => controller.complete("tool-b"));

  later(16900, () =>
    emit({
      type: "catalog.indexing",
      operationId: "index",
      label: "Reconciling state",
      detail: "Checking the resulting workspace state",
    }),
  );
  later(20700, () => controller.complete("index"));

  later(21000, () =>
    emit({
      type: "site.build",
      operationId: "build",
      label: "Building application",
      progress: 0,
    }),
  );
  later(22200, () =>
    emit({
      type: "site.build",
      operationId: "build",
      progress: 0.38,
    }),
  );
  later(23500, () =>
    emit({
      type: "site.build",
      operationId: "build",
      progress: 0.78,
    }),
  );
  later(24900, () => controller.complete("build"));

  later(26200, onDone);

  return () => timers.forEach((id) => window.clearTimeout(id));
}

function PreviewSurface() {
  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        background: "#090A0E",
        color: "#F7F5FB",
        fontFamily:
          'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ textAlign: "center", opacity: 0.9 }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#B5B1C0",
          }}
        >
          AgentSam
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 30,
            letterSpacing: "-0.035em",
            fontWeight: 600,
          }}
        >
          Runtime complete
        </div>
      </div>
    </div>
  );
}

function App() {
  const controller = useMemo(
    () => new LoadingSceneController(preset),
    [],
  );
  const [run, setRun] = useState(0);
  const params = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const debug = params.get("debugRuntimeVisuals") === "1";
  const initialStudy = params.get("study") as StudyChoice | null;
  const [study, setStudy] = useState<StudyChoice>(
    initialStudy &&
      (initialStudy === "auto" ||
        HYPERSPACE_STUDIES.some((item) => item.id === initialStudy))
      ? initialStudy
      : "auto",
  );

  useEffect(() => {
    if (debug) return;
    return simulateRuntime(controller, () => {
      window.setTimeout(() => {
        controller.reset();
        setRun((value) => value + 1);
      }, 1500);
    });
  }, [controller, run, debug]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#090A0E",
      }}
    >
      <LoadingScene
        controller={controller}
        preset={preset}
        study={study}
        reducedMotion="auto"
        style={{ width: "100%", height: "100%" }}
      >
        <PreviewSurface />
      </LoadingScene>

      <div
        style={{
          position: "fixed",
          left: 24,
          bottom: 24,
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <LoadingSceneStatus
          controller={controller}
          preset={preset}
        />
      </div>

      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 10,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          maxWidth: "min(860px, calc(100vw - 32px))",
          fontFamily:
            'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {(["auto", ...HYPERSPACE_STUDIES.map((item) => item.id)] as StudyChoice[]).map(
          (item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStudy(item)}
              style={{
                border:
                  item === study
                    ? "1px solid #8B5CF6"
                    : "1px solid rgba(255,255,255,.12)",
                background:
                  item === study
                    ? "rgba(139,92,246,.16)"
                    : "rgba(9,10,14,.72)",
                color: item === study ? "#F7F5FB" : "#B5B1C0",
                borderRadius: 999,
                padding: "7px 10px",
                fontSize: 11,
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
            >
              {item === "auto"
                ? "Auto"
                : HYPERSPACE_STUDIES.find((entry) => entry.id === item)?.title}
            </button>
          ),
        )}
      </div>

      <LoadingSceneDevtools controller={controller} enabled={debug} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
