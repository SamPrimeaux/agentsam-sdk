import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  GitBranch,
  Grip,
  Layers3,
  Maximize2,
  Merge,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow as WorkflowIcon,
  X,
  ZoomIn,
  ZoomOut,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useId, type PointerEvent as ReactPointerEvent } from "react";
import {
  autoLayoutWorkflowNodes,
  createWorkflowNodeKey,
  resolveWorkflowNodePositions,
  validateWorkflowGraph,
  workflowEdgeKey,
  WORKFLOW_GRID_SIZE,
  WORKFLOW_NODE_SIZE,
} from "./model";
import type {
  WorkflowAgentProfileOption,
  WorkflowCapabilityOption,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
  WorkflowNodeStatus,
  WorkflowRunStep,
  WorkflowRunSummary,
  WorkflowStudioProps,
  WorkflowToolOption,
  WorkflowValidationResult,
} from "./types";

const NODE_META: Record<WorkflowNodeKind, { label: string; description: string; Icon: typeof Zap }> = {
  action: { label: "Action", description: "Run a routed capability or a pinned tool", Icon: Zap },
  agent: { label: "Agent", description: "Delegate a bounded task to an agent profile", Icon: Bot },
  branch: { label: "Branch", description: "Choose a path using a condition", Icon: GitBranch },
  approval: { label: "Approval", description: "Pause for an explicit human decision", Icon: ShieldCheck },
  parallel: { label: "Parallel", description: "Start independent branches", Icon: Layers3 },
  join: { label: "Join", description: "Wait for incoming branches", Icon: Merge },
  output: { label: "Output", description: "Produce a workflow result", Icon: CircleDot },
};

const NODE_KINDS = Object.keys(NODE_META) as WorkflowNodeKind[];
const STATUS_LABEL: Record<WorkflowNodeStatus, string> = {
  idle: "Idle", pending: "Pending", queued: "Queued", running: "Running", waiting: "Waiting",
  success: "Succeeded", completed: "Completed", failed: "Failed", skipped: "Skipped",
  approval_pending: "Approval needed", timed_out: "Timed out", retrying: "Retrying",
};

function statusTone(status?: WorkflowNodeStatus | WorkflowRunSummary["status"]): string {
  if (status === "success" || status === "completed") return "success";
  if (status === "failed" || status === "timed_out") return "danger";
  if (status === "waiting" || status === "approval_pending") return "warning";
  if (status === "running" || status === "retrying") return "active";
  return "neutral";
}

function displayStatus(status?: WorkflowNodeStatus | WorkflowRunSummary["status"]): string {
  if (!status) return "";
  return STATUS_LABEL[status as WorkflowNodeStatus] ?? status.replaceAll("_", " ");
}

function formatDuration(ms?: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function nodeSubtitle(node: WorkflowGraphNode): string {
  if (node.kind === "action") {
    if (node.resolutionMode === "routed" && node.capabilityKey) return node.capabilityKey;
    if (node.resolutionMode === "pinned" && node.pinnedToolId) return node.pinnedToolId;
    return "Action not configured";
  }
  if (node.kind === "agent" && node.agentProfileId) return node.agentProfileId;
  return node.description?.trim() || NODE_META[node.kind].label;
}

function nodeStatusByKey(steps: WorkflowRunStep[] = []): Record<string, WorkflowNodeStatus> {
  const result: Record<string, WorkflowNodeStatus> = {};
  for (const step of steps) result[step.nodeKey] = step.status;
  return result;
}

function updateNodeInGraph(
  graph: WorkflowGraph,
  nodeKey: string,
  patch: Partial<WorkflowGraphNode>,
): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => node.nodeKey === nodeKey ? { ...node, ...patch } : node),
  };
}

function updateEdgeInGraph(
  graph: WorkflowGraph,
  index: number,
  patch: Partial<WorkflowGraphEdge>,
): WorkflowGraph {
  return {
    ...graph,
    edges: graph.edges.map((edge, edgeIndex) => edgeIndex === index ? { ...edge, ...patch } : edge),
  };
}

function newNode(kind: WorkflowNodeKind, graph: WorkflowGraph): WorkflowGraphNode {
  const nodeKey = createWorkflowNodeKey(kind, graph.nodes.map((node) => node.nodeKey));
  const node: WorkflowGraphNode = {
    nodeKey,
    kind,
    title: NODE_META[kind].label,
    description: "",
    ui: {},
  };
  if (kind === "action") {
    node.resolutionMode = "routed";
    node.capabilityKey = null;
  }
  const layout = autoLayoutWorkflowNodes([...graph.nodes, node], graph.edges);
  node.ui = { position: layout[nodeKey] };
  return node;
}

function statusFromIssueCount(result: WorkflowValidationResult): string {
  const errors = result.issues.filter((issue) => issue.severity === "error").length;
  const warnings = result.issues.filter((issue) => issue.severity === "warning").length;
  if (!errors && !warnings) return "No structural issues found";
  return `${errors} error${errors === 1 ? "" : "s"}${warnings ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`;
}

function ValidationPanel({ result, hostChecked }: { result: WorkflowValidationResult; hostChecked: boolean }) {
  return (
    <section className="as-wf-validation" aria-live="polite">
      <div className="as-wf-validation__head">
        {result.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
        <strong>{statusFromIssueCount(result)}</strong>
        <span>{hostChecked ? "Host validation included" : "Local structure check only"}</span>
      </div>
      {result.issues.length ? (
        <ul>
          {result.issues.map((issue, index) => (
            <li key={`${issue.code}:${issue.nodeKey ?? issue.edgeIndex ?? index}`} data-severity={issue.severity}>
              <span>{issue.severity === "error" ? "Error" : "Warning"}</span>
              <p>{issue.message}</p>
              {issue.nodeKey ? <code>{issue.nodeKey}</code> : null}
            </li>
          ))}
        </ul>
      ) : <p className="as-wf-validation__empty">The graph passes the local structural checks.</p>}
    </section>
  );
}

function RunPanel({ run, steps = [] }: { run: WorkflowRunSummary; steps?: WorkflowRunStep[] }) {
  return (
    <section className="as-wf-run-panel">
      <div className="as-wf-run-panel__head">
        <div>
          <span className="as-wf-eyebrow">Latest execution</span>
          <strong>{run.id}</strong>
        </div>
        <span className={`as-wf-status as-wf-status--${statusTone(run.status)}`}>{displayStatus(run.status)}</span>
      </div>
      <div className="as-wf-run-meta">
        {run.triggerKind ? <span>Trigger · {run.triggerKind.replaceAll("_", " ")}</span> : null}
        {run.waitingReason ? <span>Waiting · {run.waitingReason.replaceAll("_", " ")}</span> : null}
        {formatDuration(run.durationMs) ? <span>{formatDuration(run.durationMs)}</span> : null}
      </div>
      {run.errorMessage ? <p className="as-wf-run-error">{run.errorMessage}</p> : null}
      {steps.length ? (
        <ol className="as-wf-run-steps">
          {steps.map((step) => (
            <li key={step.id}>
              <span className={`as-wf-step-dot as-wf-step-dot--${statusTone(step.status)}`} />
              <span className="as-wf-run-steps__name">{step.nodeKey}</span>
              <span className="as-wf-run-steps__status">{displayStatus(step.status)}</span>
              {step.attempt && step.attempt > 1 ? <small>Attempt {step.attempt}</small> : null}
              {formatDuration(step.latencyMs) ? <small>{formatDuration(step.latencyMs)}</small> : null}
              {step.errorMessage ? <p className="as-wf-run-steps__error">{step.errorMessage}</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

type WorkflowCanvasProps = {
  graph: WorkflowGraph;
  selectedNodeKey: string | null;
  selectedEdgeIndex: number | null;
  connectMode: boolean;
  connectFrom: string | null;
  readOnly: boolean;
  statuses: Record<string, WorkflowNodeStatus>;
  onSelectNode: (key: string | null) => void;
  onSelectEdge: (index: number | null) => void;
  onConnectNode: (key: string) => void;
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void;
  onAutoLayout: () => void;
};

type CanvasDrag =
  | { kind: "node"; nodeKey: string; offsetX: number; offsetY: number; pointerId: number }
  | { kind: "pan"; startX: number; startY: number; originX: number; originY: number; pointerId: number };

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const forward = from.x <= to.x;
  const sx = from.x + (forward ? WORKFLOW_NODE_SIZE.width : 0);
  const tx = to.x + (forward ? 0 : WORKFLOW_NODE_SIZE.width);
  const sy = from.y + WORKFLOW_NODE_SIZE.height / 2;
  const ty = to.y + WORKFLOW_NODE_SIZE.height / 2;
  const curve = Math.max(56, Math.abs(tx - sx) * 0.42);
  const direction = forward ? 1 : -1;
  return `M ${sx} ${sy} C ${sx + curve * direction} ${sy}, ${tx - curve * direction} ${ty}, ${tx} ${ty}`;
}

function WorkflowCanvas({
  graph,
  selectedNodeKey,
  selectedEdgeIndex,
  connectMode,
  connectFrom,
  readOnly,
  statuses,
  onSelectNode,
  onSelectEdge,
  onConnectNode,
  onPositionsChange,
  onAutoLayout,
}: WorkflowCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<CanvasDrag | null>(null);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => resolveWorkflowNodePositions(graph.nodes, graph.edges));
  const [pan, setPan] = useState({ x: 42, y: 38 });
  const [zoom, setZoom] = useState(0.9);
  const [snap, setSnap] = useState(true);
  const markerId = `as-wf-arrow-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const next = resolveWorkflowNodePositions(graph.nodes, graph.edges);
    positionsRef.current = next;
    setPositions(next);
  }, [graph.id, graph.revision, graph.nodes]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-workflow-node]")) return;
    onSelectNode(null);
    onSelectEdge(null);
    rootRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      kind: "pan",
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      pointerId: event.pointerId,
    };
  }, [onSelectEdge, onSelectNode, pan, readOnly]);

  const handleNodePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>, nodeKey: string) => {
    event.stopPropagation();
    onSelectEdge(null);
    onSelectNode(nodeKey);
    if (connectMode) return;
    if (readOnly || event.button !== 0) return;
    rootRef.current?.setPointerCapture?.(event.pointerId);
    const world = toWorld(event.clientX, event.clientY);
    const current = positionsRef.current[nodeKey] ?? { x: 0, y: 0 };
    dragRef.current = {
      kind: "node",
      nodeKey,
      offsetX: world.x - current.x,
      offsetY: world.y - current.y,
      pointerId: event.pointerId,
    };
  }, [connectMode, onConnectNode, onSelectEdge, onSelectNode, readOnly, toWorld]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "pan") {
      setPan({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      });
      return;
    }
    const world = toWorld(event.clientX, event.clientY);
    let x = world.x - drag.offsetX;
    let y = world.y - drag.offsetY;
    if (snap) {
      x = Math.round(x / WORKFLOW_GRID_SIZE) * WORKFLOW_GRID_SIZE;
      y = Math.round(y / WORKFLOW_GRID_SIZE) * WORKFLOW_GRID_SIZE;
    }
    setPositions((current) => {
      const next = { ...current, [drag.nodeKey]: { x, y } };
      positionsRef.current = next;
      return next;
    });
  }, [snap, toWorld]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "node") onPositionsChange(positionsRef.current);
    dragRef.current = null;
    rootRef.current?.releasePointerCapture?.(event.pointerId);
  }, [onPositionsChange]);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => Math.max(0.35, Math.min(1.65, current * (event.deltaY < 0 ? 1.08 : 0.92))));
  }, []);

  const fitGraph = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    const points = Object.values(positionsRef.current);
    if (!rect || !points.length) {
      setPan({ x: 42, y: 38 });
      setZoom(0.9);
      return;
    }
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x + WORKFLOW_NODE_SIZE.width));
    const maxY = Math.max(...points.map((point) => point.y + WORKFLOW_NODE_SIZE.height));
    const graphWidth = Math.max(1, maxX - minX + 96);
    const graphHeight = Math.max(1, maxY - minY + 96);
    const nextZoom = Math.max(0.35, Math.min(1.45, Math.min((rect.width - 48) / graphWidth, (rect.height - 48) / graphHeight)));
    setZoom(nextZoom);
    setPan({
      x: (rect.width - graphWidth * nextZoom) / 2 - (minX - 48) * nextZoom,
      y: (rect.height - graphHeight * nextZoom) / 2 - (minY - 48) * nextZoom,
    });
  }, []);

  const orderedNodes = useMemo(() => [...graph.nodes].sort((a, b) => {
    const pa = positions[a.nodeKey] ?? { x: 0, y: 0 };
    const pb = positions[b.nodeKey] ?? { x: 0, y: 0 };
    return pa.x - pb.x || pa.y - pb.y || a.nodeKey.localeCompare(b.nodeKey);
  }), [graph.nodes, positions]);

  const nodeByKey = useMemo(() => new Map(graph.nodes.map((node) => [node.nodeKey, node])), [graph.nodes]);

  return (
    <section className="as-wf-canvas-shell">
      <div className="as-wf-canvas-toolbar">
        <div className="as-wf-canvas-toolbar__group">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))} aria-label="Zoom out"><ZoomOut size={15} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.65, value + 0.1))} aria-label="Zoom in"><ZoomIn size={15} /></button>
          <button type="button" onClick={fitGraph} aria-label="Fit graph to canvas"><Maximize2 size={15} /></button>
        </div>
        <div className="as-wf-canvas-toolbar__group">
          <button type="button" data-active={snap} aria-pressed={snap} onClick={() => setSnap((value) => !value)} title="Snap nodes to grid"><Grip size={15} /><span>Snap</span></button>
          {!readOnly ? <button type="button" onClick={onAutoLayout} title="Arrange nodes"><Sparkles size={15} /><span>Auto arrange</span></button> : null}
        </div>
        <span className="as-wf-canvas-hint">{connectMode ? (connectFrom ? "Choose a destination node" : "Choose a source node") : "Drag nodes · drag empty space to pan · scroll to zoom"}</span>
      </div>

      <div
        ref={rootRef}
        className="as-wf-canvas"
        data-connect-mode={connectMode}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onClick={(event) => {
          if ((event.target as HTMLElement).dataset.canvasBackground === "true") {
            onSelectNode(null);
            onSelectEdge(null);
          }
        }}
      >
        {graph.nodes.length ? (
          <div className="as-wf-canvas-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <svg className="as-wf-edges" width="5000" height="5000" aria-label="Workflow connections">
              <defs>
                <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L6,3 z" />
                </marker>
              </defs>
              {graph.edges.map((edge, index) => {
                const from = positions[edge.fromNodeKey];
                const to = positions[edge.toNodeKey];
                if (!from || !to) return null;
                const selected = selectedEdgeIndex === index;
                const label = edge.ui?.label || (edge.conditionType === "always" ? "" : edge.conditionType);
                const x = (from.x + WORKFLOW_NODE_SIZE.width + to.x) / 2;
                const y = (from.y + WORKFLOW_NODE_SIZE.height / 2 + to.y + WORKFLOW_NODE_SIZE.height / 2) / 2 - 8;
                return (
                  <g key={workflowEdgeKey(edge, index)} className="as-wf-edge-group" data-selected={selected}>
                    <path
                      className="as-wf-edge-hit"
                      d={edgePath(from, to)}
                      onClick={(event) => { event.stopPropagation(); onSelectNode(null); onSelectEdge(index); }}
                    />
                    <path className="as-wf-edge-line" d={edgePath(from, to)} markerEnd={`url(#${markerId})`} />
                    {label ? <text x={x} y={y} className="as-wf-edge-label">{label}</text> : null}
                  </g>
                );
              })}
            </svg>
            {orderedNodes.map((node) => {
              const position = positions[node.nodeKey] ?? { x: 0, y: 0 };
              const Icon = NODE_META[node.kind].Icon;
              const status = statuses[node.nodeKey] ?? "idle";
              return (
                <button
                  type="button"
                  key={node.nodeKey}
                  className="as-wf-node"
                  data-workflow-node="true"
                  data-kind={node.kind}
                  data-selected={selectedNodeKey === node.nodeKey}
                  data-connect-source={connectFrom === node.nodeKey}
                  data-status={statusTone(status)}
                  style={{ left: position.x, top: position.y }}
                  onPointerDown={(event) => handleNodePointerDown(event, node.nodeKey)}
                  onClick={() => { if (connectMode) onConnectNode(node.nodeKey); else onSelectNode(node.nodeKey); }}
                  aria-pressed={selectedNodeKey === node.nodeKey}
                  aria-label={`${node.title}, ${NODE_META[node.kind].label}`}
                >
                  <span className="as-wf-node__icon"><Icon size={18} /></span>
                  <span className="as-wf-node__body">
                    <strong>{node.title}</strong>
                    <small>{nodeSubtitle(node)}</small>
                    <span className="as-wf-node__meta">
                      <span>{NODE_META[node.kind].label}</span>
                      {node.kind === "action" && node.resolutionMode ? <span>{node.resolutionMode}</span> : null}
                    </span>
                    {status !== "idle" ? <span className={`as-wf-node__status as-wf-node__status--${statusTone(status)}`}>{displayStatus(status)}</span> : null}
                  </span>
                  <span className="as-wf-node__ports" aria-hidden="true"><i /><i /></span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="as-wf-canvas-empty" data-canvas-background="true">
            <div><WorkflowIcon size={28} /><strong>Your workflow starts here</strong><span>Add a node to begin shaping the graph.</span></div>
          </div>
        )}
      </div>

      <div className="as-wf-mobile-flow">
        {orderedNodes.map((node, index) => {
          const Icon = NODE_META[node.kind].Icon;
          const status = statuses[node.nodeKey] ?? "idle";
          const selected = selectedNodeKey === node.nodeKey;
          const outgoing = graph.edges.filter((edge) => edge.fromNodeKey === node.nodeKey);
          return (
            <div className="as-wf-mobile-flow__item" key={node.nodeKey}>
              <button
                type="button"
                className="as-wf-mobile-node"
                data-selected={selected}
                onClick={() => {
                  onSelectEdge(null);
                  if (connectMode) onConnectNode(node.nodeKey);
                  else onSelectNode(node.nodeKey);
                }}
              >
                <span className="as-wf-mobile-node__icon" data-kind={node.kind}><Icon size={17} /></span>
                <span className="as-wf-mobile-node__body"><strong>{index + 1}. {node.title}</strong><small>{nodeSubtitle(node)}</small></span>
                <span className={`as-wf-status as-wf-status--${statusTone(status)}`}>{displayStatus(status || "idle")}</span>
              </button>
              {outgoing.length ? <div className="as-wf-mobile-branches"><ArrowDownRight size={14} /> {outgoing.map((edge) => `${nodeByKey.get(edge.toNodeKey)?.title ?? edge.toNodeKey}${edge.ui?.label ? ` · ${edge.ui.label}` : ""}`).join("  /  ")}</div> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WorkflowInspector({
  graph,
  selectedNode,
  selectedEdge,
  selectedEdgeIndex,
  canEdit,
  capabilities,
  tools,
  agentProfiles,
  onGraphChange,
  onDeleteNode,
  onDeleteEdge,
}: {
  graph: WorkflowGraph;
  selectedNode: WorkflowGraphNode | null;
  selectedEdge: WorkflowGraphEdge | null;
  selectedEdgeIndex: number | null;
  canEdit: boolean;
  capabilities: WorkflowCapabilityOption[];
  tools: WorkflowToolOption[];
  agentProfiles: WorkflowAgentProfileOption[];
  onGraphChange: (next: WorkflowGraph) => void;
  onDeleteNode: (nodeKey: string) => void;
  onDeleteEdge: (index: number) => void;
}) {
  if (selectedNode) {
    const patch = (next: Partial<WorkflowGraphNode>) => onGraphChange(updateNodeInGraph(graph, selectedNode.nodeKey, next));
    const patchConfig = (key: string, value: unknown) => patch({
      config: { ...(selectedNode.config ?? {}), [key]: value },
    });
    return (
      <div className="as-wf-inspector-content">
        <div className="as-wf-inspector-identity">
          <span className={`as-wf-kind-icon as-wf-kind-icon--${selectedNode.kind}`}><span>{NODE_META[selectedNode.kind].label}</span></span>
          <code>{selectedNode.nodeKey}</code>
        </div>
        <label className="as-wf-field"><span>Node name</span><input value={selectedNode.title} disabled={!canEdit} onChange={(event) => patch({ title: event.target.value })} /></label>
        <label className="as-wf-field"><span>Description</span><textarea rows={3} value={selectedNode.description ?? ""} disabled={!canEdit} onChange={(event) => patch({ description: event.target.value })} placeholder="What does this step do?" /></label>

        {selectedNode.kind === "action" ? (
          <section className="as-wf-inspector-section">
            <h4>Action resolution</h4>
            <label className="as-wf-field"><span>Resolution</span><select value={selectedNode.resolutionMode ?? ""} disabled={!canEdit} onChange={(event) => patch({ resolutionMode: event.target.value as "routed" | "pinned", capabilityKey: null, pinnedToolId: null })}><option value="" disabled>Choose resolution</option><option value="routed">Routed capability</option><option value="pinned">Pinned tool</option></select></label>
            {selectedNode.resolutionMode === "routed" ? (
              capabilities.length ? <label className="as-wf-field"><span>Capability</span><select value={selectedNode.capabilityKey ?? ""} disabled={!canEdit} onChange={(event) => patch({ capabilityKey: event.target.value || null })}><option value="">Choose a capability</option>{capabilities.map((option) => <option key={option.key} value={option.key} disabled={option.ready === false}>{option.label}{option.ready === false ? " · unavailable" : ""}</option>)}</select><small>Only capabilities supplied by the host are selectable.</small></label> : <div className="as-wf-notice"><AlertCircle size={15} /> No capability options were supplied by the host.</div>
            ) : null}
            {selectedNode.resolutionMode === "pinned" ? (
              tools.length ? <label className="as-wf-field"><span>Tool</span><select value={selectedNode.pinnedToolId ?? ""} disabled={!canEdit} onChange={(event) => {
                const option = tools.find((candidate) => candidate.id === event.target.value);
                patch({ pinnedToolId: event.target.value || null, capabilityKey: option?.capabilityKey ?? null });
              }}><option value="">Choose a tool</option>{tools.map((option) => <option key={option.id} value={option.id} disabled={option.ready === false || !option.capabilityKey}>{option.label}{option.ready === false || !option.capabilityKey ? " · unavailable" : ""}</option>)}</select><small>The pinned tool must be registered under a capability available to this account.</small></label> : <div className="as-wf-notice"><AlertCircle size={15} /> No tool options were supplied by the host.</div>
            ) : null}
          </section>
          <section className="as-wf-inspector-section">
            <h4>Authorized operation</h4>
            <label className="as-wf-field"><span>Operation key</span><input value={String(selectedNode.config?.authorized_operation ?? selectedNode.config?.operation ?? "")} disabled={!canEdit} onChange={(event) => patchConfig("authorized_operation", event.target.value)} placeholder="e.g. campaign.publish" /></label>
            <label className="as-wf-field"><span>Resource type</span><input value={String(selectedNode.config?.resource_type ?? "")} disabled={!canEdit} onChange={(event) => patchConfig("resource_type", event.target.value)} placeholder="e.g. marketing.campaign" /></label>
            <label className="as-wf-field"><span>Resource ID path</span><input value={String(selectedNode.config?.resource_id_path ?? "")} disabled={!canEdit} onChange={(event) => patchConfig("resource_id_path", event.target.value)} placeholder="e.g. campaign.id" /></label>
            <label className="as-wf-field"><span>Resource revision path</span><input value={String(selectedNode.config?.resource_revision_path ?? "")} disabled={!canEdit} onChange={(event) => patchConfig("resource_revision_path", event.target.value)} placeholder="e.g. campaign.revision" /></label>
            <label className="as-wf-checkbox"><input type="checkbox" checked={selectedNode.config?.requires_approval === true} disabled={!canEdit} onChange={(event) => patchConfig("requires_approval", event.target.checked)} /><span>Require human approval before this action</span></label>
            <small>The approval gate binds to this operation, capability, resource ID and exact revision. The action handler must enforce the expected revision.</small>
          </section>
        ) : null}

        {selectedNode.kind === "approval" ? (
          <section className="as-wf-inspector-section">
            <h4>Approval authority</h4>
            <label className="as-wf-field"><span>Action being approved</span><select value={String(selectedNode.config?.target_node_key ?? "")} disabled={!canEdit} onChange={(event) => patchConfig("target_node_key", event.target.value)}><option value="">Choose a connected action</option>{graph.nodes.filter((candidate) => candidate.kind === "action").map((candidate) => <option key={candidate.nodeKey} value={candidate.nodeKey}>{candidate.title} · {candidate.nodeKey}</option>)}</select></label>
            <label className="as-wf-field"><span>Approval summary</span><input value={String(selectedNode.config?.action_summary ?? "")} disabled={!canEdit} onChange={(event) => patchConfig("action_summary", event.target.value)} placeholder="What will this approval authorize?" /></label>
            <label className="as-wf-field"><span>Risk level</span><select value={String(selectedNode.config?.risk_level ?? "high")} disabled={!canEdit} onChange={(event) => patchConfig("risk_level", event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label className="as-wf-field"><span>Approval expires after <small>(seconds)</small></span><input type="number" min="60" max="86400" step="60" value={Number(selectedNode.config?.ttl_sec ?? 3600)} disabled={!canEdit} onChange={(event) => patchConfig("ttl_sec", Math.max(60, Math.min(86400, Number(event.target.value) || 3600)))} /></label>
            <small>This gate pauses the durable run. It cannot authorize a different tool, operation, resource or revision.</small>
          </section>
        ) : null}

        {selectedNode.kind === "agent" ? (
          <section className="as-wf-inspector-section">
            <h4>Agent profile</h4>
            {agentProfiles.length ? <label className="as-wf-field"><span>Profile</span><select value={selectedNode.agentProfileId ?? ""} disabled={!canEdit} onChange={(event) => patch({ agentProfileId: event.target.value || null })}><option value="">Select an agent profile</option>{agentProfiles.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label> : <div className="as-wf-notice">No agent profiles were supplied by the host.</div>}
          </section>
        ) : null}

        <section className="as-wf-inspector-section">
          <h4>Execution limits</h4>
          <label className="as-wf-field"><span>Timeout <small>(milliseconds)</small></span><input type="number" min="1" step="1000" value={selectedNode.timeoutMs ?? ""} disabled={!canEdit} placeholder="No node-specific limit" onChange={(event) => patch({ timeoutMs: event.target.value ? Math.max(1, Number(event.target.value)) : null })} /></label>
        </section>
        {canEdit ? <button type="button" className="as-wf-danger-button" onClick={() => onDeleteNode(selectedNode.nodeKey)}><Trash2 size={15} /> Remove node</button> : null}
      </div>
    );
  }

  if (selectedEdge && selectedEdgeIndex != null) {
    const patch = (next: Partial<WorkflowGraphEdge>) => onGraphChange(updateEdgeInGraph(graph, selectedEdgeIndex, next));
    return (
      <div className="as-wf-inspector-content">
        <div className="as-wf-inspector-heading"><strong>Connection</strong><code>{selectedEdge.fromNodeKey} → {selectedEdge.toNodeKey}</code></div>
        <label className="as-wf-field"><span>Condition type</span><select value={selectedEdge.conditionType} disabled={!canEdit} onChange={(event) => patch({ conditionType: event.target.value as WorkflowGraphEdge["conditionType"] })}><option value="always">Always</option><option value="status">Status</option><option value="field">Field</option><option value="branch">Branch</option></select></label>
        <label className="as-wf-field"><span>Priority</span><input type="number" value={selectedEdge.priority ?? 0} disabled={!canEdit} onChange={(event) => patch({ priority: Number(event.target.value) || 0 })} /></label>
        <label className="as-wf-field"><span>Connector label</span><input value={selectedEdge.ui?.label ?? ""} disabled={!canEdit} onChange={(event) => patch({ ui: { ...selectedEdge.ui, label: event.target.value } })} placeholder="Optional label" /></label>
        <label className="as-wf-checkbox"><input type="checkbox" checked={Boolean(selectedEdge.isFallback)} disabled={!canEdit} onChange={(event) => patch({ isFallback: event.target.checked })} /><span>Fallback connection</span></label>
        {canEdit ? <button type="button" className="as-wf-danger-button" onClick={() => onDeleteEdge(selectedEdgeIndex)}><Trash2 size={15} /> Remove connection</button> : null}
      </div>
    );
  }

  return (
    <div className="as-wf-inspector-content">
      <div className="as-wf-inspector-heading"><strong>Workflow settings</strong><span>Revision {graph.revision}</span></div>
      <label className="as-wf-field"><span>Name</span><input value={graph.displayName} disabled={!canEdit} onChange={(event) => onGraphChange({ ...graph, displayName: event.target.value })} /></label>
      <label className="as-wf-field"><span>Description</span><textarea rows={4} value={graph.description ?? ""} disabled={!canEdit} onChange={(event) => onGraphChange({ ...graph, description: event.target.value })} placeholder="What should this workflow accomplish?" /></label>
      <label className="as-wf-field"><span>Entry node</span><select value={graph.entryNodeKey ?? ""} disabled={!canEdit} onChange={(event) => onGraphChange({ ...graph, entryNodeKey: event.target.value || null })}><option value="">Choose an entry node</option>{graph.nodes.map((node) => <option key={node.nodeKey} value={node.nodeKey}>{node.title}</option>)}</select><small>Drafts may omit an entry node; activation requires one.</small></label>
      <div className="as-wf-settings-facts"><div><span>Scope</span><strong>{graph.scopeType === "account" ? "Account" : "Platform"}</strong></div><div><span>Lifecycle</span><strong>{graph.lifecycle}</strong></div><div><span>Nodes</span><strong>{graph.nodes.length}</strong></div><div><span>Connections</span><strong>{graph.edges.length}</strong></div></div>
      <p className="as-wf-inspector-footnote">Workflow identity, revisioning and persistence remain host-owned.</p>
    </div>
  );
}

export function WorkflowStudio({
  workflow,
  host,
  loading = false,
  error = null,
  readOnly = false,
  capabilities = [],
  tools = [],
  agentProfiles = [],
  run = null,
  runSteps = [],
  onChange,
  onRetry,
  onClose,
}: WorkflowStudioProps) {
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [validationHostChecked, setValidationHostChecked] = useState(false);
  const [latestRun, setLatestRun] = useState<WorkflowRunSummary | null>(run);
  const [busy, setBusy] = useState<"save" | "validate" | "activate" | "run" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState("");

  useEffect(() => {
    setSelectedNodeKey(null);
    setSelectedEdgeIndex(null);
    setConnectMode(false);
    setConnectFrom(null);
    setValidation(null);
    setLatestRun(run);
    setSavedSignature(workflow ? JSON.stringify(workflow) : "");
  }, [workflow?.id, workflow?.revision]);

  useEffect(() => {
    if (run) setLatestRun(run);
  }, [run]);

  const canEdit = Boolean(!readOnly && workflow && onChange && host?.saveDraft);
  const dirty = Boolean(workflow && savedSignature && JSON.stringify(workflow) !== savedSignature);
  const selectedNode = workflow?.nodes.find((node) => node.nodeKey === selectedNodeKey) ?? null;
  const selectedEdge = workflow && selectedEdgeIndex != null ? workflow.edges[selectedEdgeIndex] ?? null : null;
  const statuses = useMemo(() => nodeStatusByKey(runSteps), [runSteps]);

  const emitChange = useCallback((next: WorkflowGraph) => {
    if (!canEdit || !onChange) return;
    onChange(next);
    setValidation(null);
    setActionError(null);
  }, [canEdit, onChange]);

  const addNode = useCallback((kind: WorkflowNodeKind) => {
    if (!workflow || !canEdit) return;
    if (kind === "action" && !capabilities.length && !tools.length) return;
    const node = newNode(kind, workflow);
    emitChange({ ...workflow, nodes: [...workflow.nodes, node] });
    setSelectedNodeKey(node.nodeKey);
    setSelectedEdgeIndex(null);
    setPaletteOpen(false);
  }, [capabilities.length, canEdit, emitChange, tools.length, workflow]);

  const deleteNode = useCallback((nodeKey: string) => {
    if (!workflow || !canEdit) return;
    emitChange({
      ...workflow,
      nodes: workflow.nodes.filter((node) => node.nodeKey !== nodeKey),
      edges: workflow.edges.filter((edge) => edge.fromNodeKey !== nodeKey && edge.toNodeKey !== nodeKey),
      entryNodeKey: workflow.entryNodeKey === nodeKey ? null : workflow.entryNodeKey,
    });
    setSelectedNodeKey(null);
  }, [canEdit, emitChange, workflow]);

  const deleteEdge = useCallback((index: number) => {
    if (!workflow || !canEdit) return;
    emitChange({ ...workflow, edges: workflow.edges.filter((_, edgeIndex) => edgeIndex !== index) });
    setSelectedEdgeIndex(null);
  }, [canEdit, emitChange, workflow]);

  const connectNode = useCallback((nodeKey: string) => {
    if (!workflow || !canEdit) return;
    if (!connectFrom) {
      setConnectFrom(nodeKey);
      setSelectedNodeKey(nodeKey);
      return;
    }
    if (connectFrom === nodeKey) {
      setConnectFrom(null);
      return;
    }
    const duplicate = workflow.edges.some((edge) => edge.fromNodeKey === connectFrom && edge.toNodeKey === nodeKey && edge.conditionType === "always" && (edge.priority ?? 0) === 0);
    if (!duplicate) {
      emitChange({
        ...workflow,
        edges: [...workflow.edges, {
          fromNodeKey: connectFrom,
          toNodeKey: nodeKey,
          conditionType: "always",
          priority: 0,
          isFallback: false,
          ui: {},
        }],
      });
    }
    setConnectFrom(null);
    setConnectMode(false);
    setSelectedNodeKey(null);
  }, [canEdit, connectFrom, emitChange, workflow]);

  const updatePositions = useCallback((positions: Record<string, { x: number; y: number }>) => {
    if (!workflow || !canEdit) return;
    emitChange({
      ...workflow,
      nodes: workflow.nodes.map((node) => ({
        ...node,
        ui: { ...node.ui, position: positions[node.nodeKey] ?? node.ui?.position },
      })),
    });
  }, [canEdit, emitChange, workflow]);

  const autoLayout = useCallback(() => {
    if (!workflow || !canEdit) return;
    updatePositions(autoLayoutWorkflowNodes(workflow.nodes, workflow.edges));
  }, [canEdit, updatePositions, workflow]);

  const handleSave = useCallback(async () => {
    if (!workflow || !host?.saveDraft || !canEdit) return;
    setBusy("save");
    setActionError(null);
    try {
      const saved = await host.saveDraft(workflow);
      onChange?.(saved);
      setSavedSignature(JSON.stringify(saved));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not save this workflow draft.");
    } finally {
      setBusy(null);
    }
  }, [canEdit, host, onChange, workflow]);

  const handleValidate = useCallback(async () => {
    if (!workflow) return;
    setBusy("validate");
    setActionError(null);
    const local = validateWorkflowGraph(workflow);
    setValidationHostChecked(false);
    try {
      if (host?.validate) {
        const remote = await host.validate(workflow);
        setValidation({
          ok: local.ok && remote.ok,
          issues: [...local.issues, ...remote.issues],
          receiptId: remote.receiptId,
        });
        setValidationHostChecked(true);
      } else {
        setValidation(local);
      }
    } catch (cause) {
      setValidation(local);
      setActionError(cause instanceof Error ? cause.message : "Host validation could not be completed.");
    } finally {
      setBusy(null);
    }
  }, [host, workflow]);

  const handleActivate = useCallback(async () => {
    if (!workflow || !host?.activate) return;
    const local = validateWorkflowGraph(workflow, { forActivation: true });
    setValidation(local);
    setValidationHostChecked(false);
    if (!local.ok) return;
    setBusy("activate");
    setActionError(null);
    try {
      const activated = await host.activate(workflow);
      onChange?.(activated);
      setSavedSignature(JSON.stringify(activated));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The host could not activate this workflow.");
    } finally {
      setBusy(null);
    }
  }, [host, onChange, workflow]);

  const handleRun = useCallback(async () => {
    if (!workflow || !host?.run || workflow.lifecycle !== "active") return;
    setBusy("run");
    setActionError(null);
    try {
      const result = await host.run(workflow);
      setLatestRun(result);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The host could not start this workflow.");
    } finally {
      setBusy(null);
    }
  }, [host, workflow]);

  if (loading) {
    return <div className="as-workflow-studio as-workflow-studio--loading"><div className="as-wf-skeleton as-wf-skeleton--header" /><div className="as-wf-skeleton as-wf-skeleton--body" /><span>Loading workflow…</span></div>;
  }
  if (error) {
    return <div className="as-workflow-studio as-workflow-studio--message"><AlertCircle size={22} /><strong>Workflow could not be loaded</strong><p>{error}</p>{onRetry ? <button type="button" className="as-wf-button as-wf-button--primary" onClick={onRetry}><RefreshCw size={15} /> Try again</button> : null}</div>;
  }
  if (!workflow) {
    return <div className="as-workflow-studio as-workflow-studio--message"><WorkflowIcon size={24} /><strong>No workflow selected</strong><p>Choose a workflow from its host-provided library.</p></div>;
  }

  const canActivate = Boolean(host?.activate && workflow.lifecycle === "draft");
  const canRun = Boolean(host?.run && workflow.lifecycle === "active");
  const issueCount = validation?.issues.length ?? 0;

  return (
    <div className="as-workflow-studio">
      <header className="as-wf-header">
        <div className="as-wf-header__identity">
          {onClose ? <button type="button" className="as-wf-icon-button" onClick={onClose} aria-label="Close workflow editor"><X size={17} /></button> : null}
          <div className="as-wf-header__title">
            <div><strong>{workflow.displayName}</strong><span className={`as-wf-status as-wf-status--${workflow.lifecycle}`}>{workflow.lifecycle}</span></div>
            <p><code>{workflow.workflowKey}</code><span>Revision {workflow.revision}</span><span>{workflow.scopeType === "account" ? "Account workflow" : "Platform workflow"}</span></p>
          </div>
        </div>
        <div className="as-wf-header__actions">
          <button type="button" className="as-wf-button" onClick={() => void handleValidate()} disabled={busy !== null}><CheckCircle2 size={15} />{host?.validate ? "Validate" : "Check structure"}</button>
          {canActivate ? <button type="button" className="as-wf-button" onClick={() => void handleActivate()} disabled={busy !== null || !validateWorkflowGraph(workflow, { forActivation: true }).ok}><Check size={15} />Activate</button> : null}
          {canRun ? <button type="button" className="as-wf-button as-wf-button--primary" onClick={() => void handleRun()} disabled={busy !== null}><Play size={15} />{busy === "run" ? "Starting…" : "Run"}</button> : null}
          {canEdit ? <button type="button" className="as-wf-button as-wf-button--primary" onClick={() => void handleSave()} disabled={busy !== null || !dirty}><Save size={15} />{busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}</button> : <span className="as-wf-readonly"><ShieldCheck size={14} />View only</span>}
        </div>
      </header>

      {actionError ? <div className="as-wf-action-error" role="alert"><AlertCircle size={15} />{actionError}<button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error"><X size={14} /></button></div> : null}

      <div className="as-wf-studio-body">
        <section className="as-wf-editor-main">
          <div className="as-wf-editor-toolbar">
            <div className="as-wf-editor-toolbar__left">
              {canEdit ? (
                <div className="as-wf-add-wrap">
                  <button type="button" className="as-wf-button" aria-expanded={paletteOpen} onClick={() => setPaletteOpen((value) => !value)}><Plus size={15} />Add node<ChevronDown size={13} /></button>
                  {paletteOpen ? <div className="as-wf-node-menu" role="menu">{NODE_KINDS.map((kind) => {
                    const Icon = NODE_META[kind].Icon;
                    const disabled = kind === "action" && !capabilities.length && !tools.length;
                    return <button type="button" key={kind} role="menuitem" disabled={disabled} onClick={() => addNode(kind)}><span className={`as-wf-node-menu__icon as-wf-node-menu__icon--${kind}`}><Icon size={16} /></span><span><strong>{NODE_META[kind].label}</strong><small>{disabled ? "No capability or tool catalog supplied" : NODE_META[kind].description}</small></span><Plus size={14} /></button>;
                  })}</div> : null}
                </div>
              ) : null}
              <button type="button" className={`as-wf-button${connectMode ? " as-wf-button--selected" : ""}`} disabled={!canEdit || workflow.nodes.length < 2} aria-pressed={connectMode} onClick={() => { setConnectMode((value) => !value); setConnectFrom(null); setSelectedNodeKey(null); setSelectedEdgeIndex(null); }}><GitBranch size={15} />{connectMode ? "Cancel connection" : "Connect nodes"}</button>
              {connectMode && connectFrom ? <span className="as-wf-connect-hint">From {connectFrom}</span> : null}
            </div>
            <div className="as-wf-editor-toolbar__right">
              <span>{workflow.nodes.length} nodes</span><span>{workflow.edges.length} connections</span>
              <button type="button" className="as-wf-icon-button" onClick={() => setInspectorOpen((value) => !value)} aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}>{inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}</button>
            </div>
          </div>

          <WorkflowCanvas
            graph={workflow}
            selectedNodeKey={selectedNodeKey}
            selectedEdgeIndex={selectedEdgeIndex}
            connectMode={connectMode}
            connectFrom={connectFrom}
            readOnly={!canEdit}
            statuses={statuses}
            onSelectNode={(key) => { setSelectedNodeKey(key); if (key) setSelectedEdgeIndex(null); }}
            onSelectEdge={(index) => { setSelectedEdgeIndex(index); if (index != null) setSelectedNodeKey(null); }}
            onConnectNode={connectNode}
            onPositionsChange={updatePositions}
            onAutoLayout={autoLayout}
          />

          {validation ? <ValidationPanel result={validation} hostChecked={validationHostChecked} /> : null}
          {latestRun ? <RunPanel run={latestRun} steps={runSteps} /> : null}
        </section>

        {inspectorOpen ? (
          <aside className="as-wf-inspector">
            <div className="as-wf-inspector-header"><strong>{selectedNode ? "Node properties" : selectedEdge ? "Connection properties" : "Properties"}</strong><span>{selectedNode ? NODE_META[selectedNode.kind].label : selectedEdge ? "Edge" : "Workflow"}</span></div>
            <WorkflowInspector
              graph={workflow}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              selectedEdgeIndex={selectedEdgeIndex}
              canEdit={canEdit}
              capabilities={capabilities}
              tools={tools}
              agentProfiles={agentProfiles}
              onGraphChange={emitChange}
              onDeleteNode={deleteNode}
              onDeleteEdge={deleteEdge}
            />
          </aside>
        ) : null}
      </div>
      <footer className="as-wf-footer">
        <span><Activity size={13} />{canEdit ? "Draft editing is enabled by the host" : "Read-only · host save capability not supplied"}</span>
        <span>{issueCount ? `${issueCount} structural issue${issueCount === 1 ? "" : "s"}` : "Changes and execution remain host-owned"}</span>
      </footer>
    </div>
  );
}
