import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  GripVertical,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import type { DesignWorkspaceSnapshot } from "@inneranimalmedia/agentsam-contracts";
import { ResizableStageHandle } from "../shell/ResizableStage";

type Pane = "stage" | "explorer" | "inspector" | "assistant";
type AssistantDock = "left" | "right";
type AssistantDropTarget = AssistantDock | "expand" | null;

/** Arrangement only: specialist products render and own the editor and assistant children. */
export interface DesignWorkspaceFrameProps {
  snapshot: DesignWorkspaceSnapshot;
  children: ReactNode;
  leading?: ReactNode;
  commands?: ReactNode;
  documentActions?: ReactNode;
  explorer?: ReactNode;
  inspector?: ReactNode;
  inspectorSheetOpen?: boolean;
  onInspectorSheetDismiss?: () => void;
  assistant?: ReactNode;
  status?: ReactNode;
  assistantOpen?: boolean;
  onAssistantOpenChange?: (open: boolean) => void;
  assistantDock?: AssistantDock;
  onAssistantDockChange?: (dock: AssistantDock) => void;
  stageLabel?: string;
  className?: string;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
const DEFAULT_ASSISTANT_WIDTH = 360;

export function DesignWorkspaceFrame({
  snapshot,
  children,
  leading,
  commands,
  documentActions,
  explorer,
  inspector,
  inspectorSheetOpen = false,
  onInspectorSheetDismiss,
  assistant,
  status,
  assistantOpen,
  onAssistantOpenChange,
  assistantDock,
  onAssistantDockChange,
  stageLabel = "Design workspace",
  className = "",
}: DesignWorkspaceFrameProps) {
  const [internalAssistantOpen, setInternalAssistantOpen] = useState(true);
  const [internalAssistantDock, setInternalAssistantDock] = useState<AssistantDock>("left");
  const [mobilePane, setMobilePane] = useState<Pane>("stage");
  useEffect(() => {
    if (inspectorSheetOpen) setMobilePane("inspector");
    else setMobilePane((pane) => pane === "inspector" ? "stage" : pane);
  }, [inspectorSheetOpen]);
  const [explorerWidth, setExplorerWidth] = useState(228);
  const [inspectorWidth, setInspectorWidth] = useState(268);
  const [assistantWidth, setAssistantWidth] = useState(DEFAULT_ASSISTANT_WIDTH);
  const [assistantExpanded, setAssistantExpanded] = useState(false);
  const [assistantDragging, setAssistantDragging] = useState(false);
  const [assistantDropTarget, setAssistantDropTarget] = useState<AssistantDropTarget>(null);
  const [widthsReady, setWidthsReady] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const assistantDraggingRef = useRef(false);
  const assistantDropTargetRef = useRef<AssistantDropTarget>(null);

  // Per-app panel preferences are shared by every document type in this workspace.
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
        if (value.assistantDock === "left" || value.assistantDock === "right") {
          setInternalAssistantDock(value.assistantDock);
        }
        if (typeof value.assistantOpen === "boolean") setInternalAssistantOpen(value.assistantOpen);
      }
    } catch {
      // Private mode or invalid old settings: keep safe defaults.
    }
    setWidthsReady(true);
  }, [widthsKey]);

  const visible = Boolean(assistant) && (assistantOpen ?? internalAssistantOpen);
  const dock = assistantDock ?? internalAssistantDock;

  useEffect(() => {
    if (!widthsReady) return;
    try {
      window.localStorage.setItem(widthsKey, JSON.stringify({
        explorer: explorerWidth,
        inspector: inspectorWidth,
        assistant: assistantWidth,
        assistantDock: dock,
        assistantOpen: visible,
      }));
    } catch {
      // Panel interactions remain available when storage is unavailable.
    }
  }, [widthsKey, widthsReady, explorerWidth, inspectorWidth, assistantWidth, dock, visible]);

  const toggleAssistant = (open: boolean) => {
    if (!open) setAssistantExpanded(false);
    if (assistantOpen === undefined) setInternalAssistantOpen(open);
    onAssistantOpenChange?.(open);
    if (!open && mobilePane === "assistant") setMobilePane("stage");
  };

  const moveAssistant = (nextDock: AssistantDock) => {
    setAssistantExpanded(false);
    if (assistantDock === undefined) setInternalAssistantDock(nextDock);
    onAssistantDockChange?.(nextDock);
  };

  const setAssistantDrop = (target: AssistantDropTarget) => {
    assistantDropTargetRef.current = target;
    setAssistantDropTarget(target);
  };

  const beginAssistantDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    assistantDraggingRef.current = true;
    setAssistantDragging(true);
    setAssistantDrop(null);
  };

  const updateAssistantDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!assistantDraggingRef.current) return;
    const bounds = layoutRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0) return;
    const relativeX = (event.clientX - bounds.left) / bounds.width;
    setAssistantDrop(relativeX < 0.22 ? "left" : relativeX > 0.78 ? "right" : "expand");
  };

  const finishAssistantDrag = (applyDrop: boolean) => {
    if (!assistantDraggingRef.current) return;
    assistantDraggingRef.current = false;
    const target = assistantDropTargetRef.current;
    setAssistantDragging(false);
    setAssistantDrop(null);
    if (!applyDrop) return;
    if (target === "left" || target === "right") moveAssistant(target);
    else if (target === "expand") setAssistantExpanded(true);
  };

  const handleAssistantGripKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveAssistant("left");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveAssistant("right");
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setAssistantExpanded((expanded) => !expanded);
    }
  };

  useEffect(() => {
    if (!visible) setAssistantExpanded(false);
  }, [visible]);

  const style = {
    "--dw-explorer-width": explorerWidth + "px",
    "--dw-inspector-width": inspectorWidth + "px",
    "--dw-assistant-width": assistantWidth + "px",
  } as CSSProperties;

  const panes: { id: Pane; name: string; enabled: boolean }[] = [
    { id: "stage", name: "Canvas", enabled: true },
    { id: "explorer", name: "Structure", enabled: Boolean(explorer) },
    { id: "inspector", name: "Properties", enabled: Boolean(inspector) },
    { id: "assistant", name: "AgentSam", enabled: Boolean(assistant) },
  ];

  const assistantResizeHandle = visible && !assistantExpanded ? (
    <ResizableStageHandle
      className={"dw-resize-handle dw-assistant-resize dock-" + dock}
      axis="x"
      label="Resize AgentSam conversation panel"
      title="Drag to resize AgentSam · double-click to reset"
      value={assistantWidth}
      min={270}
      max={560}
      onDrag={(delta) => setAssistantWidth((width) => clamp(
        width + (dock === "left" ? delta : -delta),
        270,
        560,
      ))}
      onDoubleClick={() => setAssistantWidth(DEFAULT_ASSISTANT_WIDTH)}
    />
  ) : null;

  // Keep the conversation mounted while hidden or re-docked so composer state is never discarded.
  const assistantAside = assistant ? (
    <aside
      className={"dw-assistant dw-pane dock-" + dock + (assistantExpanded ? " is-expanded" : "")}
      data-dw-pane="assistant"
      data-dw-dock={dock}
      data-dw-visible={visible ? "true" : "false"}
      data-dw-expanded={assistantExpanded ? "true" : "false"}
      aria-hidden={!visible}
      aria-label="Contextual AgentSam conversation"
    >
      <div className="dw-assistant-heading">
        <button
          className="dw-assistant-drag-grip"
          type="button"
          aria-label="Drag AgentSam to dock left, dock right or fill the workspace"
          aria-keyshortcuts="ArrowLeft ArrowRight Enter"
          title="Drag to dock left, dock right or fill the workspace · Arrow keys to move"
          onPointerDown={beginAssistantDrag}
          onPointerMove={updateAssistantDrag}
          onPointerUp={() => finishAssistantDrag(true)}
          onPointerCancel={() => finishAssistantDrag(false)}
          onLostPointerCapture={() => finishAssistantDrag(false)}
          onKeyDown={handleAssistantGripKeyDown}
        >
          <GripVertical size={15} />
        </button>
        <strong>AgentSam</strong>
        <div className="dw-assistant-actions">
          <button
            className="dw-icon-button"
            type="button"
            title={"Move AgentSam to the " + (dock === "left" ? "right" : "left")}
            aria-label={"Move AgentSam to the " + (dock === "left" ? "right" : "left")}
            onClick={() => moveAssistant(dock === "left" ? "right" : "left")}
          >
            {dock === "left" ? <PanelRight size={15} /> : <PanelLeft size={15} />}
          </button>
          <button
            className="dw-icon-button"
            type="button"
            title={assistantExpanded ? "Restore AgentSam panel" : "Expand AgentSam to fill the workspace"}
            aria-label={assistantExpanded ? "Restore AgentSam panel" : "Expand AgentSam"}
            aria-pressed={assistantExpanded}
            onClick={() => setAssistantExpanded((expanded) => !expanded)}
          >
            {assistantExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            className="dw-icon-button"
            type="button"
            title="Hide AgentSam"
            aria-label="Hide AgentSam"
            onClick={() => toggleAssistant(false)}
          >
            {dock === "left" ? <PanelLeftClose size={15} /> : <PanelRightClose size={15} />}
          </button>
        </div>
      </div>
      <div className="dw-assistant-content">{assistant}</div>
    </aside>
  ) : null;

  return (
    <section
      className={"agentsam-design-workspace " + className}
      style={style}
      data-design-kind={snapshot.resource.kind}
      data-design-app={snapshot.resource.appId}
      data-design-status={snapshot.status}
      data-mobile-pane={mobilePane}
      data-contextual-inspector={inspectorSheetOpen ? "true" : undefined}
      data-assistant-expanded={assistantExpanded ? "true" : "false"}
      data-assistant-dragging={assistantDragging ? "true" : "false"}
      aria-label={stageLabel}
    >
      <header className="dw-command-bar">
        {leading ? <div className="dw-document-leading">{leading}</div> : null}
        <div className="dw-document-heading">
          <strong title={snapshot.resource.title}>{snapshot.resource.title}</strong>
          <span className="dw-document-status">
            {snapshot.status !== "ready"
              ? snapshot.status
              : snapshot.dirty
                ? "Unsaved changes"
                : "Saved"}
          </span>
        </div>
        <div className="dw-command-actions">{commands}</div>
        {documentActions ? <div className="dw-document-actions">{documentActions}</div> : null}
        {assistant && !visible ? (
          <button
            className="dw-icon-button dw-assistant-reopen"
            type="button"
            title="Show AgentSam"
            aria-label="Show AgentSam"
            onClick={() => {
              toggleAssistant(true);
              setMobilePane("assistant");
            }}
          >
            <MessageSquare size={16} />
          </button>
        ) : null}
      </header>

      {panes.filter((pane) => pane.enabled).length > 1 && <nav className="dw-mobile-switcher" aria-label="Workspace panels">
        {panes.filter((pane) => pane.enabled).map((pane) => (
          <button
            key={pane.id}
            type="button"
            className={mobilePane === pane.id ? "active" : ""}
            aria-current={mobilePane === pane.id ? "page" : undefined}
            onClick={() => {
              if (pane.id === "assistant") toggleAssistant(true);
              if (inspectorSheetOpen && pane.id !== "inspector") onInspectorSheetDismiss?.();
              setMobilePane(pane.id);
            }}
          >
            {pane.name}
          </button>
        ))}
      </nav>}

      <div className="dw-layout" ref={layoutRef}>
        {mobilePane !== "stage" ? (
          <button
            type="button"
            className="dw-mobile-scrim"
            aria-label="Close workspace panel"
            onClick={() => { if (inspectorSheetOpen) onInspectorSheetDismiss?.(); setMobilePane("stage"); }}
          />
        ) : null}


        {explorer ? (
          <>
            <aside className="dw-explorer dw-pane" data-dw-pane="explorer" aria-label="Document structure">
              {explorer}
            </aside>
            <ResizableStageHandle
              className="dw-resize-handle"
              axis="x"
              label="Resize structure panel"
              onDrag={(delta) => setExplorerWidth((width) => clamp(width + delta, 164, 400))}
              onDoubleClick={() => setExplorerWidth(228)}
            />
          </>
        ) : null}

        <main className="dw-stage" data-dw-pane="stage" aria-label={stageLabel}>
          {children}
        </main>

        {inspector ? (
          <>
            <ResizableStageHandle
              className="dw-resize-handle"
              axis="x"
              label="Resize properties panel"
              onDrag={(delta) => setInspectorWidth((width) => clamp(width - delta, 204, 460))}
              onDoubleClick={() => setInspectorWidth(268)}
            />
            <aside className="dw-inspector dw-pane" data-dw-pane="inspector" aria-label="Selected object properties">
              {inspector}
            </aside>
          </>
        ) : null}

        {assistantAside}
        {assistantResizeHandle}
        {assistantDragging ? (
          <div className="dw-dock-drop-overlay" aria-hidden="true">
            <div className="dw-dock-drop-zone" data-active={assistantDropTarget === "left"}>
              <PanelLeft size={19} />
              <span>Dock left</span>
            </div>
            <div className="dw-dock-drop-zone dw-dock-drop-zone-center" data-active={assistantDropTarget === "expand"}>
              <Maximize2 size={19} />
              <span>Fill workspace</span>
            </div>
            <div className="dw-dock-drop-zone" data-active={assistantDropTarget === "right"}>
              <PanelRight size={19} />
              <span>Dock right</span>
            </div>
          </div>
        ) : null}
      </div>
      {status ? <footer className="dw-status-bar">{status}</footer> : null}
    </section>
  );
}
