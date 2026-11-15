import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { DesignWorkspaceSnapshot } from "@inneranimalmedia/agentsam-contracts";
import { ResizableStageHandle } from "../shell/ResizableStage";

type Pane = "stage" | "explorer" | "inspector" | "assistant";

/** Arrangement only: the specialist product renders and owns children. */
export interface DesignWorkspaceFrameProps {
  snapshot: DesignWorkspaceSnapshot;
  children: ReactNode;
  commands?: ReactNode;
  explorer?: ReactNode;
  inspector?: ReactNode;
  assistant?: ReactNode;
  status?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  stageLabel?: string;
  className?: string;
}

const clamp = (v: number, low: number, high: number) =>
  Math.min(high, Math.max(low, v));

export function DesignWorkspaceFrame({
  snapshot,
  children,
  commands,
  explorer,
  inspector,
  assistant,
  status,
  assistantOpen,
  onAssistantOpenChange,
  stageLabel = "Design workspace",
  className = "",
}: DesignWorkspaceFrameProps) {
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<Pane>("stage");
  const [explorerWidth, setExplorerWidth] = useState(228);
  const [inspectorWidth, setInspectorWidth] = useState(268);
  const [assistantWidth, setAssistantWidth] = useState(336);
  const [widthsReady, setWidthsReady] = useState(false);
  // Per-app settings: the same packaged frame serves standalone apps and embeds.
  const widthsKey = "agentsam.design-workspace.widths.v1." + snapshot.resource.appId;
  useEffect(() => {
    setWidthsReady(false);
    try {
      const raw = window.localStorage.getItem(widthsKey);
      if (raw) {
        const value = JSON.parse(raw) as Record<string, unknown>;
        if (typeof value.explorer === "number") setExplorerWidth(clamp(value.explorer, 164, 400));
        if (typeof value.inspector === "number") setInspectorWidth(clamp(value.inspector, 204, 460));
        if (typeof value.assistant === "number") setAssistantWidth(clamp(value.assistant, 270, 560));
      }
    } catch { /* private mode or invalid old settings: use safe defaults */ }
    setWidthsReady(true);
  }, [widthsKey]);
  useEffect(() => {
    if (!widthsReady) return;
    try { window.localStorage.setItem(widthsKey, JSON.stringify({
      explorer:explorerWidth,inspector:inspectorWidth,assistant:assistantWidth,
    })); } catch { /* UI still works without persistence */ }
  }, [widthsKey,widthsReady,explorerWidth,inspectorWidth,assistantWidth]);
  const visible =
    Boolean(assistant) && (assistantOpen ?? internalAssistantOpen);
  const toggleAssistant = (open: boolean) => {
    if (assistantOpen === undefined) setInternalAssistantOpen(open);
    onAssistantOpenChange?.(open);
    if (!open && mobilePane === "assistant") setMobilePane("stage");
  };
  const style = {
    "--dw-explorer-width": explorerWidth + "px",
    "--dw-inspector-width": inspectorWidth + "px",
    "--dw-assistant-width": assistantWidth + "px",
  } as CSSProperties;
  const panes: { id: Pane; name: string; enabled: boolean }[] = [
    { id: "stage", name: "Canvas", enabled: true },
    { id: "explorer", name: "Structure", enabled: Boolean(explorer) },
    { id: "inspector", name: "Properties", enabled: Boolean(inspector) },
    { id: "assistant", name: "AgentSam", enabled: visible },
  ];
  return (
    <section
      className={"agentsam-design-workspace " + className}
      style={style}
      data-design-kind={snapshot.resource.kind}
      data-design-app={snapshot.resource.appId}
      data-design-status={snapshot.status}
      data-mobile-pane={mobilePane}
      aria-label={stageLabel}
    >
      <header className="dw-command-bar">
        <div className="dw-document-heading">
          <strong title={snapshot.resource.title}>
            {snapshot.resource.title}
          </strong>
          <span className="dw-document-status">
            {snapshot.status !== "ready"
              ? snapshot.status
              : snapshot.dirty
                ? "Unsaved changes"
                : "Saved"}
          </span>
        </div>
        <div className="dw-command-actions">{commands}</div>
        {assistant && !visible && (
          <button
            className="dw-utility-button"
            type="button"
            onClick={() => {
              toggleAssistant(true);
              setMobilePane("assistant");
            }}
          >
            Open assistant
          </button>
        )}
      </header>
      <nav className="dw-mobile-switcher" aria-label="Workspace panels">
        {panes
          .filter((p) => p.enabled)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              className={mobilePane === p.id ? "active" : ""}
              aria-current={mobilePane === p.id ? "page" : undefined}
              onClick={() => setMobilePane(p.id)}
            >
              {p.name}
            </button>
          ))}
      </nav>
      <div className="dw-layout">
        {explorer && (
          <>
            <aside
              className="dw-explorer dw-pane"
              data-dw-pane="explorer"
              aria-label="Document structure"
            >
              {explorer}
            </aside>
            <ResizableStageHandle
              className="dw-resize-handle"
              axis="x"
              label="Resize structure panel"
              onDrag={(d) => setExplorerWidth((w) => clamp(w + d, 164, 400))}
              onDoubleClick={() => setExplorerWidth(228)}
            />
          </>
        )}
        <main className="dw-stage" data-dw-pane="stage" aria-label={stageLabel}>
          {children}
        </main>
        {inspector && (
          <>
            <ResizableStageHandle
              className="dw-resize-handle"
              axis="x"
              label="Resize properties panel"
              onDrag={(d) => setInspectorWidth((w) => clamp(w - d, 204, 460))}
              onDoubleClick={() => setInspectorWidth(268)}
            />
            <aside
              className="dw-inspector dw-pane"
              data-dw-pane="inspector"
              aria-label="Selected object properties"
            >
              {inspector}
            </aside>
          </>
        )}
        {visible && (
          <>
            <ResizableStageHandle
              className="dw-resize-handle"
              axis="x"
              label="Resize assistant panel"
              onDrag={(d) => setAssistantWidth((w) => clamp(w - d, 270, 560))}
              onDoubleClick={() => setAssistantWidth(336)}
            />
            <aside
              className="dw-assistant dw-pane"
              data-dw-pane="assistant"
              aria-label="Contextual AgentSam assistant"
            >
              <div className="dw-assistant-heading">
                <strong>AgentSam</strong>
                <button
                  className="dw-utility-button"
                  type="button"
                  aria-label="Close assistant"
                  onClick={() => toggleAssistant(false)}
                >
                  Close
                </button>
              </div>
              <div className="dw-assistant-content">{assistant}</div>
            </aside>
          </>
        )}
      </div>
      {status && <footer className="dw-status-bar">{status}</footer>}
    </section>
  );
}
